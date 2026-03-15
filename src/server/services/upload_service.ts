/**
 * UploadService: validates asciicast files, persists sessions, triggers pipeline.
 *
 * Validates uploaded .cast files (size limits, format heuristic), creates session
 * and job records, and emits events to start pipeline processing.
 *
 * Connections: SessionAdapter (db/), StorageAdapter (storage/),
 * JobQueueAdapter (jobs/), EventBusAdapter (events/).
 */

import typia from 'typia';
import { nanoid } from 'nanoid';
import { validateAsciicast, normalizeHeader } from '../../shared/parsers/asciicast.js';
import type { AsciicastHeader } from '../../shared/types/asciicast.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import { type ValidationFieldError, mapTypiaErrors } from '../routes/route_validation.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'services/upload' });

export interface UploadServiceDeps {
  sessionRepository: SessionAdapter;
  storageAdapter: StorageAdapter;
  jobQueue: JobQueueAdapter;
  eventBus: EventBusAdapter;
  maxFileSizeMB: number;
}

export type UploadResult =
  | { ok: true; session: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 422 | 500; error: string; details?: string; line?: number; fields?: ValidationFieldError[] };

/**
 * UploadService handles file upload validation, session creation, and pipeline triggering.
 */
export class UploadService {
  private readonly sessionRepository: SessionAdapter;
  private readonly storageAdapter: StorageAdapter;
  private readonly jobQueue: JobQueueAdapter;
  private readonly eventBus: EventBusAdapter;
  private readonly maxFileSizeMB: number;

  constructor(deps: UploadServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.storageAdapter = deps.storageAdapter;
    this.jobQueue = deps.jobQueue;
    this.eventBus = deps.eventBus;
    this.maxFileSizeMB = deps.maxFileSizeMB;
  }

  /**
   * Validate an uploaded file and create a session with associated job.
   * Emits session.uploaded to trigger pipeline processing.
   * Returns an error result on validation failure; throws on unexpected infrastructure errors.
   */
  async upload(file: File): Promise<UploadResult> {
    const maxBytes = this.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return { ok: false, status: 413, error: `File too large. Maximum size is ${this.maxFileSizeMB}MB` };
    }

    const content = await file.text();
    const validation = validateAsciicast(content);
    if (!validation.valid) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid asciicast file',
        details: validation.error,
        line: validation.line,
      };
    }

    const headerResult = validateHeader(content);
    if (!headerResult.ok) {
      return headerResult.error;
    }

    const id = nanoid();
    const safeFilename = sanitizeFilename(file.name);

    let filepath: string;
    try {
      filepath = await this.storageAdapter.save(id, content);
    } catch (err) {
      log.error({ err }, 'Storage save failed');
      return {
        ok: false,
        status: 500,
        error: 'Failed to save file',
        details: 'Storage write failed',
      };
    }

    try {
      const markerCount = countMarkers(content);
      const session = await this.sessionRepository.createWithId(id, {
        filename: safeFilename,
        filepath,
        size_bytes: file.size,
        marker_count: markerCount,
        uploaded_at: new Date().toISOString(),
      });

      await this.triggerPipeline(id, safeFilename);

      const { filepath: _fp, ...sessionData } = session;
      return { ok: true, session: sessionData as Record<string, unknown> };
    } catch (err) {
      await this.cleanupFile(id);
      try {
        await this.sessionRepository.deleteById(id);
      } catch (cleanupErr) {
        log.warn({ err: cleanupErr }, 'Failed to clean up session record after pipeline error');
      }
      throw err;
    }
  }

  /** Queue a pipeline job and emit the session.uploaded event. Rolls back to failed on error. */
  private async triggerPipeline(id: string, filename: string): Promise<void> {
    try {
      await this.jobQueue.create(id);
      this.eventBus.emit({ type: 'session.uploaded', sessionId: id, filename });
    } catch (err) {
      try {
        await this.sessionRepository.updateDetectionStatus(id, 'failed');
      } catch { /* best-effort — don't mask the original error */ }
      throw err;
    }
  }

  /** Remove a stored file after a DB error during session creation. */
  private async cleanupFile(id: string): Promise<void> {
    try {
      await this.storageAdapter.delete(id);
    } catch (cleanupErr) {
      log.warn({ err: cleanupErr }, 'Failed to clean up file after DB error');
    }
  }
}

/**
 * Validate the asciicast header using Typia AOT tags.
 * Returns ok:true on success, or ok:false with a ready UploadResult error on failure.
 */
export function validateHeader(content: string): { ok: true } | { ok: false; error: Extract<UploadResult, { ok: false }> } {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  let raw: unknown;
  try {
    raw = JSON.parse(firstLine);
  } catch {
    return { ok: false, error: { ok: false, status: 400, error: 'Invalid asciicast header JSON' } };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: { ok: false, status: 400, error: 'Invalid asciicast header: must be a JSON object' } };
  }
  const header = normalizeHeader(raw as Record<string, unknown>);
  const result = typia.validate<AsciicastHeader>(header);
  if (!result.success) {
    return {
      ok: false,
      error: {
        ok: false,
        status: 422,
        error: 'Asciicast header failed validation',
        fields: mapTypiaErrors(result.errors),
      },
    };
  }
  return { ok: true };
}

/** Sanitize an uploaded filename: keep only safe characters, enforce max length. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'unnamed.cast';
  const clean = base.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  const trimmed = clean.slice(0, 255);
  return trimmed || 'unnamed.cast';
}

/** Count the number of marker events in a raw .cast file (NDJSON lines with type 'm'). */
export function countMarkers(content: string): number {
  let count = 0;
  for (const line of content.split('\n')) {
    if (line.includes('"m"')) {
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed) && parsed[1] === 'm') count++;
      } catch {
        // skip malformed lines
      }
    }
  }
  return count;
}

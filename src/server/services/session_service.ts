/**
 * SessionService: list, retrieve, delete, and redetect sessions.
 *
 * Reads and writes session records, strips internal fields from API responses,
 * and coordinates storage and pipeline re-triggering for redetect requests.
 *
 * Connections: SessionAdapter (db/), SectionAdapter (db/),
 * StorageAdapter (storage/), JobQueueAdapter (jobs/), EventBusAdapter (events/).
 */

import { parseAsciicast } from '../../shared/parsers/asciicast.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SectionAdapter, SectionRow } from '../db/section_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import { PipelineStage } from '../../shared/types/pipeline.js';
import type { Section } from '../../shared/types/section.js';
import type { SectionMetadata, SessionMetadataResponse } from '../../shared/types/api.js';
import { logger } from '../logger.js';
import { RateLimiter } from '../utils/rate_limiter.js';

const log = logger.child({ module: 'services/session' });

export interface SessionServiceDeps {
  sessionRepository: SessionAdapter;
  sectionRepository: SectionAdapter;
  storageAdapter: StorageAdapter;
  jobQueue: JobQueueAdapter;
  eventBus: EventBusAdapter;
}

export type SessionServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 429 | 500; error: string; details?: string };

/**
 * SessionService handles CRUD operations and re-detection triggering for sessions.
 */
export class SessionService {
  private readonly sessionRepository: SessionAdapter;
  private readonly sectionRepository: SectionAdapter;
  private readonly storageAdapter: StorageAdapter;
  private readonly jobQueue: JobQueueAdapter;
  private readonly eventBus: EventBusAdapter;
  private readonly redetectLimiter = new RateLimiter(30_000);

  constructor(deps: SessionServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.sectionRepository = deps.sectionRepository;
    this.storageAdapter = deps.storageAdapter;
    this.jobQueue = deps.jobQueue;
    this.eventBus = deps.eventBus;
  }

  /** List all sessions, stripping the internal filepath field from each record. */
  async listSessions(): Promise<Record<string, unknown>[]> {
    const sessions = await this.sessionRepository.findAll();
    return sessions.map(({ filepath: _filepath, ...rest }) => rest as Record<string, unknown>);
  }

  /**
   * Retrieve full session data including parsed content and sections.
   * Returns 404 if the session record or its stored file does not exist.
   */
  async getSession(id: string): Promise<SessionServiceResult<Record<string, unknown>>> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    let content: string;
    try {
      content = await this.storageAdapter.read(id);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return { ok: false, status: 404, error: 'Session file not found on filesystem' };
      }
      throw err;
    }
    const parsed = parseAsciicast(content);
    const sections = await this.sectionRepository.findBySessionId(id);

    const snapshot = parseSnapshotJson(session.snapshot, 'session', id);
    const transformedSections = sections.map(section => transformSection(section));

    const { filepath: _fp, snapshot: _snap, ...sessionData } = session;
    return {
      ok: true,
      data: {
        ...sessionData,
        snapshot,
        content: { header: parsed.header, markers: parsed.markers },
        sections: transformedSections,
      } as Record<string, unknown>,
    };
  }

  /**
   * Retrieve session metadata without snapshot content.
   * Returns SectionMetadata[] with lineCount/preview from DB columns — no snapshot blobs.
   * Reads the .cast file for header+markers only; sections are loaded from DB.
   */
  async getSessionMetadata(id: string): Promise<SessionServiceResult<SessionMetadataResponse>> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    let content: string;
    try {
      content = await this.storageAdapter.read(id);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return { ok: false, status: 404, error: 'Session file not found on filesystem' };
      }
      throw err;
    }

    const parsed = parseAsciicast(content);
    const sectionRows = await this.sectionRepository.findBySessionId(id);
    const sections = sectionRows.map(toSectionMetadata);
    const totalLines = sections.reduce((sum, s) => sum + s.lineCount, 0);

    const { filepath: _fp, snapshot: _snap, ...sessionData } = session;
    return {
      ok: true,
      data: {
        ...sessionData,
        content: { header: parsed.header, markers: parsed.markers },
        sections,
        totalLines,
        sectionCount: sections.length,
      } as unknown as SessionMetadataResponse,
    };
  }

  /**
   * Delete a session record and its stored file.
   * File deletion is best-effort; DB deletion failure returns 500.
   */
  async deleteSession(id: string): Promise<SessionServiceResult<{ success: boolean }>> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    const deleted = await this.sessionRepository.deleteById(id);
    if (!deleted) {
      return { ok: false, status: 500, error: 'Failed to delete session from database' };
    }

    try {
      await this.storageAdapter.delete(id);
    } catch (err) {
      log.warn({ err }, 'Failed to delete session file');
    }

    return { ok: true, data: { success: true } };
  }

  /**
   * Re-trigger section detection for an existing session.
   * Returns 202 data payload; the pipeline runs asynchronously.
   */
  async redetectSession(id: string): Promise<SessionServiceResult<{ message: string; sessionId: string }>> {
    const session = await this.sessionRepository.findById(id);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    if (!this.redetectLimiter.tryAcquire(id)) {
      return { ok: false, status: 429, error: 'Rate limited — try again later' };
    }

    const content = await this.storageAdapter.read(id);
    parseAsciicast(content);

    const existing = await this.jobQueue.findBySessionId(id);
    if (existing && (existing.status === 'pending' || existing.status === 'running')) {
      return { ok: true, data: { message: 'Re-detection already in progress', sessionId: id } };
    }

    await this.ensureJob(id, existing?.id);

    this.eventBus.emit({ type: 'session.uploaded', sessionId: id, filename: session.filename });
    return { ok: true, data: { message: 'Re-detection started', sessionId: id } };
  }

  /**
   * Ensures a pipeline job exists and is queued for the given session.
   * Retries an existing job or creates a new one, handling concurrent creation via UNIQUE constraint.
   */
  private async ensureJob(id: string, existingJobId?: string): Promise<void> {
    if (existingJobId) {
      await this.jobQueue.retry(existingJobId, PipelineStage.Validate);
      return;
    }

    try {
      await this.jobQueue.create(id);
    } catch (err) {
      // Concurrent request may have already created the job — treat as success
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        log.info({ sessionId: id }, 'Concurrent redetect — job already created');
        const retryJob = await this.jobQueue.findBySessionId(id);
        if (retryJob) {
          await this.jobQueue.retry(retryJob.id, PipelineStage.Validate);
        }
      } else {
        throw err;
      }
    }
  }
}

/** Parse a JSON snapshot string; returns null on failure, logging a warning. */
function parseSnapshotJson(value: string | null | undefined, context: string, id: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    log.warn({ err, [`${context}Id`]: id }, `Failed to parse ${context} snapshot JSON`);
    return null;
  }
}

/** Transform a DB section row into SectionMetadata (no snapshot content). */
function toSectionMetadata(section: SectionRow): SectionMetadata {
  return {
    id: section.id,
    type: section.type,
    label: section.label ?? '',
    startEvent: section.start_event,
    endEvent: section.end_event ?? 0,
    startLine: section.start_line,
    endLine: section.end_line,
    lineCount: section.line_count ?? 0,
    preview: section.preview,
  };
}

/** Transform a DB section row into the shared API response shape. */
function transformSection(section: SectionRow): Section {
  return {
    id: section.id,
    type: section.type,
    label: section.label ?? '',
    startEvent: section.start_event,
    endEvent: section.end_event ?? 0,
    startLine: section.start_line,
    endLine: section.end_line,
    snapshot: section.snapshot
      ? parseSnapshotJson(section.snapshot, 'section', section.id) as Section['snapshot']
      : null,
  };
}

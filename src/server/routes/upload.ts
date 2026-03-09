/**
 * Upload route handler.
 * Accepts multipart form upload of asciicast v3 files.
 * Validates, stores, and registers sessions in database.
 * Triggers async processing via job queue + event bus.
 */

import type { Context } from 'hono';
import { nanoid } from 'nanoid';
import { validateAsciicast } from '../../shared/asciicast.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'upload' });

/**
 * Handle POST /api/upload
 * Multipart file upload with validation and transactional storage.
 * Creates a job and emits session.uploaded — the orchestrator handles processing.
 */
export async function handleUpload(
  c: Context,
  repository: SessionAdapter,
  storageAdapter: StorageAdapter,
  maxFileSizeMB: number,
  jobQueue: JobQueueAdapter,
  eventBus: EventBusAdapter
): Promise<Response> {
  try {
    const formData = await c.req.parseBody();
    const file = formData['file'];

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const maxBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return c.json(
        { error: `File too large. Maximum size is ${maxFileSizeMB}MB` },
        413
      );
    }

    const content = await file.text();

    const validation = validateAsciicast(content);
    if (!validation.valid) {
      return c.json(
        {
          error: 'Invalid asciicast file',
          details: validation.error,
          line: validation.line,
        },
        400
      );
    }

    // Generate nanoid upfront for consistent ID across file and DB
    const id = nanoid();

    let filepath: string;
    try {
      filepath = await storageAdapter.save(id, content);
    } catch (err) {
      return c.json(
        {
          error: 'Failed to save file',
          details: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }

    try {
      // Count markers from raw file scan (avoid full parse — we only need marker count)
      const markerCount = countMarkers(content);

      const session = await repository.createWithId(id, {
        filename: file.name,
        filepath,
        size_bytes: file.size,
        marker_count: markerCount,
        uploaded_at: new Date().toISOString(),
      });

      // Create job and emit session.uploaded — orchestrator picks this up
      try {
        await jobQueue.create(id);
        eventBus.emit({ type: 'session.uploaded', sessionId: id, filename: file.name });
      } catch (err) {
        try {
          await repository.updateDetectionStatus(id, 'failed');
        } catch { /* best-effort — don't mask the original error */ }
        throw err;
      }

      const { filepath: _fp, ...sessionData } = session;
      return c.json(sessionData, 201);
    } catch (err) {
      try {
        await storageAdapter.delete(id);
      } catch (cleanupErr) {
        log.warn({ err: cleanupErr }, 'Failed to clean up file after DB error');
      }
      throw err;
    }
  } catch (err) {
    log.error({ err }, 'Upload error');
    return c.json(
      {
        error: 'Internal server error',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}

/** Count the number of marker events in a raw .cast file (NDJSON lines with type 'm'). */
function countMarkers(content: string): number {
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

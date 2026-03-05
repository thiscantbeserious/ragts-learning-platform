/**
 * Upload route handler.
 * Accepts multipart form upload of asciicast v3 files.
 * Validates, stores, and registers sessions in database.
 */

import type { Context } from 'hono';
import { nanoid } from 'nanoid';
import { parseAsciicast, validateAsciicast } from '../../shared/asciicast.js';
import type { SessionRepository } from '../db/session-repository.js';
import type { SectionRepository } from '../db/section-repository.js';
import type { StorageAdapter } from '../storage/storage-adapter.js';
import { processSessionPipeline } from '../processing/index.js';

/**
 * Handle POST /api/upload
 * Multipart file upload with validation and transactional storage.
 */
export async function handleUpload(
  c: Context,
  repository: SessionRepository,
  sectionRepository: SectionRepository,
  storageAdapter: StorageAdapter,
  maxFileSizeMB: number
): Promise<Response> {
  try {
    // Parse multipart form data
    const formData = await c.req.parseBody();
    const file = formData['file'];

    // Validate file exists
    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    // Check file size (convert MB to bytes)
    const maxBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return c.json(
        { error: `File too large. Maximum size is ${maxFileSizeMB}MB` },
        413
      );
    }

    // Read file content
    const content = await file.text();

    // Validate asciicast format
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

    // Parse to extract marker count
    const parsed = parseAsciicast(content);
    const markerCount = parsed.markers.length;

    // Generate nanoid upfront for consistent ID across file and DB
    const id = nanoid();

    // Save file (fail fast if filesystem issues)
    let filepath: string;
    try {
      filepath = storageAdapter.save(id, content);
    } catch (err) {
      return c.json(
        {
          error: 'Failed to save file',
          details: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }

    // Create database record with transaction safety
    try {
      const session = repository.createWithId(id, {
        filename: file.name,
        filepath,
        size_bytes: file.size,
        marker_count: markerCount,
        uploaded_at: new Date().toISOString(),
      });

      // Trigger async processing (fire and forget)
      setImmediate(() => {
        processSessionPipeline(filepath, id, parsed.markers, sectionRepository, repository)
          .catch(err => console.error('Session processing failed:', err));
      });

      const { filepath: _fp, ...sessionData } = session;
      return c.json(sessionData, 201);
    } catch (err) {
      // DB insert failed — clean up file (best effort, don't mask original error)
      try {
        storageAdapter.delete(id);
      } catch (cleanupErr) {
        console.warn('Failed to clean up file after DB error:', cleanupErr);
      }
      throw err;
    }
  } catch (err) {
    console.error('Upload error:', err);
    return c.json(
      {
        error: 'Internal server error',
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
}

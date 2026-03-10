/**
 * Upload route handler.
 * Accepts multipart form upload of asciicast v3 files.
 * Delegates validation, storage, and pipeline triggering to UploadService.
 */

import type { Context } from 'hono';
import type { UploadService } from '../services/index.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/upload' });

/**
 * Handle POST /api/upload
 * Multipart file upload — thin route; business logic lives in UploadService.
 */
export async function handleUpload(
  c: Context,
  service: UploadService
): Promise<Response> {
  try {
    const formData = await c.req.parseBody();
    const file = formData['file'];

    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const result = await service.upload(file);

    if (!result.ok) {
      const { error, details, line } = result;
      return c.json({ error, ...(details !== undefined && { details }), ...(line !== undefined && { line }) }, result.status);
    }

    return c.json(result.session, 201);
  } catch (err) {
    log.error({ err }, 'Upload error');
    return c.json({ error: 'Internal server error' }, 500);
  }
}

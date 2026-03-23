/**
 * Route handler for bulk section content retrieval.
 *
 * Serves GET /api/sessions/:id/sections/content with all section content
 * returned in a single response. Must be registered BEFORE the per-section
 * route to avoid Hono param-matching conflicts.
 *
 * Connections: BulkSectionContentService (services/).
 */

import type { Context } from 'hono';
import type { BulkSectionContentService } from '../services/bulk_section_content_service.js';
import { validatePathId } from './route_validation.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/bulk_section_content' });

/**
 * Handle GET /api/sessions/:id/sections/content
 * Returns full content for all sections in the session as a single JSON response.
 * Returns 413 when the session exceeds BULK_MAX_SECTIONS.
 */
export async function handleGetBulkSectionContent(
  c: Context,
  service: BulkSectionContentService
): Promise<Response> {
  try {
    const id = c.req.param('id');

    const invalidId = validatePathId(c, id);
    if (invalidId) return invalidId;

    const result = await service.getBulkSectionContent(id);

    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }

    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Get bulk section content error');
    return c.json({ error: 'Failed to retrieve bulk section content' }, 500);
  }
}

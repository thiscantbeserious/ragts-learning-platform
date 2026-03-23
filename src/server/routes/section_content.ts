/**
 * Route handler for per-section paginated terminal content.
 *
 * Serves GET /api/sessions/:id/sections/:sectionId/content with
 * offset/limit pagination and ETag-based 304 Not Modified support.
 *
 * Connections: SectionContentService (services/).
 */

import type { Context } from 'hono';
import type { SectionContentService } from '../services/section_content_service.js';
import { validatePathId } from './route_validation.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'routes/section_content' });

/**
 * Handle GET /api/sessions/:id/sections/:sectionId/content
 * Returns a paginated page of terminal snapshot lines for the given section.
 * Supports ETag/304 caching; passes If-None-Match through to the service.
 */
export async function handleGetSectionContent(
  c: Context,
  service: SectionContentService
): Promise<Response> {
  try {
    const id = c.req.param('id');
    const sectionId = c.req.param('sectionId');

    const invalidId = validatePathId(c, id);
    if (invalidId) return invalidId;

    const invalidSectionId = validatePathId(c, sectionId);
    if (invalidSectionId) return invalidSectionId;

    const ifNoneMatch = c.req.header('If-None-Match');
    const query = { ...parseQueryParams(c), ifNoneMatch: ifNoneMatch ?? undefined };

    const result = await service.getSectionContent(id, sectionId, query);

    if (!result.ok) {
      if (result.status === 304) {
        return new Response(null, { status: 304 });
      }
      return c.json({ error: result.error }, result.status);
    }

    c.header('ETag', result.etag);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(result.data);
  } catch (err) {
    log.error({ err }, 'Get section content error');
    return c.json({ error: 'Failed to retrieve section content' }, 500);
  }
}

/** Parse offset, limit query params from the request. */
function parseQueryParams(c: Context): { offset?: number; limit?: number | 'all' } {
  const offsetStr = c.req.query('offset');
  const limitStr = c.req.query('limit');

  const offset = offsetStr === undefined ? undefined : Number.parseInt(offsetStr, 10);
  const limit = parseLimitParam(limitStr);

  return {
    offset: Number.isFinite(offset) && offset! >= 0 ? offset : undefined,
    limit,
  };
}

/** Parse limit query param — returns "all" sentinel or a numeric value. */
function parseLimitParam(value: string | undefined): number | 'all' | undefined {
  if (value === undefined) return undefined;
  if (value === 'all') return 'all';
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

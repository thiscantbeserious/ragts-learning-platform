// @vitest-environment node
/**
 * Integration tests for GET /api/sessions/:id/sections/content (bulk endpoint).
 *
 * Tests 200 response shape, 404 session-not-found, 413 oversized-session,
 * and 500 internal error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { handleGetBulkSectionContent } from './bulk_section_content.js';
import type { BulkSectionContentService, BulkSectionContentResult } from '../services/bulk_section_content_service.js';
import type { BulkSectionContentResponse } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBulkResponse(sectionIds: string[]): BulkSectionContentResponse {
  const sections: BulkSectionContentResponse['sections'] = {};
  for (const id of sectionIds) {
    sections[id] = {
      sectionId: id,
      lines: [{ spans: [{ text: 'hello' }] }],
      totalLines: 1,
      offset: 0,
      limit: 'all',
      hasMore: false,
      contentHash: 'abc123',
    };
  }
  return { sections };
}

function makeMockService(result: BulkSectionContentResult): BulkSectionContentService {
  return {
    getBulkSectionContent: vi.fn().mockResolvedValue(result),
  } as unknown as BulkSectionContentService;
}

function makeApp(service: BulkSectionContentService) {
  const app = new Hono();
  app.get('/api/sessions/:id/sections/content', (c) =>
    handleGetBulkSectionContent(c, service)
  );
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:id/sections/content', () => {
  let mockService: BulkSectionContentService;

  beforeEach(() => {
    const data = makeBulkResponse(['sect-1', 'sect-2']);
    mockService = makeMockService({ ok: true, data });
  });

  it('returns 200 with bulk content response', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/content')
    );
    expect(res.status).toBe(200);
  });

  it('response body contains sections map keyed by section id', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/content')
    );
    const body = await res.json() as BulkSectionContentResponse;
    expect(Object.keys(body.sections)).toEqual(['sect-1', 'sect-2']);
  });

  it('each section entry has the expected SectionContentPage shape', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/content')
    );
    const body = await res.json() as BulkSectionContentResponse;
    const page = body.sections['sect-1'];
    expect(page).toMatchObject({
      sectionId: 'sect-1',
      limit: 'all',
      hasMore: false,
      offset: 0,
    });
  });

  it('returns 404 when session is not found', async () => {
    const service = makeMockService({ ok: false, status: 404, error: 'Session not found' });
    const app = makeApp(service);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/missing/sections/content')
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not found');
  });

  it('returns 413 when session exceeds section limit', async () => {
    const service = makeMockService({
      ok: false,
      status: 413,
      error: 'Session has 201 sections; bulk endpoint supports at most 200',
    });
    const app = makeApp(service);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/content')
    );
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('sections');
  });

  it('passes session id from path to service', async () => {
    const app = makeApp(mockService);
    await app.fetch(
      new Request('http://localhost/api/sessions/my-session-id/sections/content')
    );
    expect(mockService.getBulkSectionContent).toHaveBeenCalledWith('my-session-id');
  });

  it('returns 200 for a valid session id path param', async () => {
    const service = makeMockService({ ok: true, data: { sections: {} } });
    const app = makeApp(service);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/content')
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 on unexpected service error', async () => {
    const service = {
      getBulkSectionContent: vi.fn().mockRejectedValue(new Error('DB exploded')),
    } as unknown as BulkSectionContentService;
    const app = makeApp(service);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/content')
    );
    expect(res.status).toBe(500);
  });
});

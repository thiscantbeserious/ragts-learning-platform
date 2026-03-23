// @vitest-environment node
/**
 * Integration tests for GET /api/sessions/:id/sections/:sectionId/content.
 *
 * Tests ETag/304, pagination query params, 404 responses, and correct
 * response headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { handleGetSectionContent } from './section_content.js';
import type { SectionContentService, SectionContentResult } from '../services/section_content_service.js';
import type { SectionContentPage } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<SectionContentPage> = {}): SectionContentPage {
  return {
    sectionId: 'sect-1',
    lines: [{ spans: [{ text: 'hello' }] }],
    totalLines: 1,
    offset: 0,
    limit: 500,
    hasMore: false,
    contentHash: 'abc123',
    ...overrides,
  };
}

function makeMockService(result: SectionContentResult): SectionContentService {
  return {
    getSectionContent: vi.fn().mockResolvedValue(result),
  } as unknown as SectionContentService;
}

function makeApp(service: SectionContentService) {
  const app = new Hono();
  app.get('/api/sessions/:id/sections/:sectionId/content', (c) =>
    handleGetSectionContent(c, service)
  );
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:id/sections/:sectionId/content', () => {
  let mockService: SectionContentService;

  beforeEach(() => {
    mockService = makeMockService({ ok: true, data: makePage(), etag: '"abc123"' });
  });

  it('returns 200 with section content page', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content')
    );
    expect(res.status).toBe(200);
    const body = await res.json() as SectionContentPage;
    expect(body.sectionId).toBe('sect-1');
    expect(body.lines).toHaveLength(1);
  });

  it('sets ETag header on 200 response', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content')
    );
    expect(res.headers.get('etag')).toBe('"abc123"');
  });

  it('sets Cache-Control header on 200 response', async () => {
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content')
    );
    expect(res.headers.get('cache-control')).toBeTruthy();
  });

  it('returns 304 when If-None-Match matches ETag', async () => {
    mockService = makeMockService({ ok: false, status: 304, error: 'Not Modified' });
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content', {
        headers: { 'If-None-Match': '"abc123"' },
      })
    );
    expect(res.status).toBe(304);
  });

  it('returns 404 when session not found', async () => {
    mockService = makeMockService({ ok: false, status: 404, error: 'Session not found' });
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/missing/sections/sect-1/content')
    );
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('not found');
  });

  it('returns 404 when section not found', async () => {
    mockService = makeMockService({ ok: false, status: 404, error: 'Section not found' });
    const app = makeApp(mockService);
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/missing/content')
    );
    expect(res.status).toBe(404);
  });

  it('passes offset and limit query params to service', async () => {
    const app = makeApp(mockService);
    await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content?offset=10&limit=25')
    );
    expect(mockService.getSectionContent).toHaveBeenCalledWith(
      'sess-1',
      'sect-1',
      expect.objectContaining({ offset: 10, limit: 25 })
    );
  });

  it('passes limit=all sentinel when specified', async () => {
    const app = makeApp(mockService);
    await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content?limit=all')
    );
    expect(mockService.getSectionContent).toHaveBeenCalledWith(
      'sess-1',
      'sect-1',
      expect.objectContaining({ limit: 'all' })
    );
  });

  it('passes If-None-Match header to service as ifNoneMatch', async () => {
    const app = makeApp(mockService);
    await app.fetch(
      new Request('http://localhost/api/sessions/sess-1/sections/sect-1/content', {
        headers: { 'If-None-Match': '"stale-hash"' },
      })
    );
    expect(mockService.getSectionContent).toHaveBeenCalledWith(
      'sess-1',
      'sect-1',
      expect.objectContaining({ ifNoneMatch: '"stale-hash"' })
    );
  });
});

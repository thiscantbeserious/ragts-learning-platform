// @vitest-environment node
/**
 * Unit tests for session route handlers.
 *
 * Tests handleGetSession response shape against SessionMetadataResponse contract.
 * Uses a mock SessionService to isolate route logic from service/DB dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { handleGetSession } from './sessions.js';
import type { SessionService } from '../services/index.js';
import type { SessionMetadataResponse } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockMetadata(overrides: Partial<SessionMetadataResponse> = {}): SessionMetadataResponse {
  return {
    id: 'sess-1',
    filename: 'test.cast',
    content: { header: { version: 3, width: 80, height: 24 }, markers: [] },
    sections: [],
    detection_status: 'completed',
    totalLines: 0,
    sectionCount: 0,
    ...overrides,
  } as unknown as SessionMetadataResponse;
}

function makeMockService(result: { ok: true; data: SessionMetadataResponse } | { ok: false; status: 404 | 429 | 500; error: string }): Pick<SessionService, 'getSessionMetadata'> {
  return {
    getSessionMetadata: vi.fn().mockResolvedValue(result),
  } as unknown as Pick<SessionService, 'getSessionMetadata'>;
}

function makeApp(service: Pick<SessionService, 'getSessionMetadata'>) {
  const app = new Hono();
  app.get('/api/sessions/:id', (c) => handleGetSession(c, service as SessionService));
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/sessions/:id
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:id', () => {
  it('returns 200 with session metadata on success', async () => {
    const data = makeMockMetadata();
    const app = makeApp(makeMockService({ ok: true, data }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/sess-1'));

    expect(res.status).toBe(200);
    const body = await res.json() as SessionMetadataResponse;
    expect(body.id).toBe('sess-1');
    expect(body.filename).toBe('test.cast');
  });

  it('returns 404 when session is not found', async () => {
    const app = makeApp(makeMockService({ ok: false, status: 404, error: 'Session not found' }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/missing'));

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Session not found');
  });

  it('returns 400 for empty id', async () => {
    const service = makeMockService({ ok: true, data: makeMockMetadata() });
    const app = new Hono();
    app.get('/api/sessions/:id', (c) => handleGetSession(c, service as SessionService));

    // An empty string path segment is caught by validatePathId
    const res = await app.fetch(new Request('http://localhost/api/sessions/%20'));

    expect(res.status).toBe(400);
  });

  it('returns sections array without snapshot fields', async () => {
    const data = makeMockMetadata({
      sections: [{
        id: 'sec-1',
        type: 'marker',
        label: 'Setup',
        startEvent: 0,
        endEvent: 10,
        startLine: 0,
        endLine: 5,
        lineCount: 6,
        preview: 'First line',
      }] as unknown as SessionMetadataResponse['sections'],
      sectionCount: 1,
      totalLines: 6,
    });
    const app = makeApp(makeMockService({ ok: true, data }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/sess-1'));

    const body = await res.json() as SessionMetadataResponse;
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]).not.toHaveProperty('snapshot');
    expect(body.sections[0]!.lineCount).toBe(6);
    expect(body.sections[0]!.preview).toBe('First line');
  });

  it('includes totalLines and sectionCount in response', async () => {
    const data = makeMockMetadata({
      totalLines: 42,
      sectionCount: 3,
    });
    const app = makeApp(makeMockService({ ok: true, data }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/sess-1'));

    const body = await res.json() as SessionMetadataResponse;
    expect(body.totalLines).toBe(42);
    expect(body.sectionCount).toBe(3);
  });
});

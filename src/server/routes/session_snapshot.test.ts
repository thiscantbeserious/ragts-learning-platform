// @vitest-environment node
/**
 * Unit tests for GET /api/sessions/:id/snapshot route handler.
 *
 * Tests the snapshot endpoint that serves 0-section sessions.
 * Uses a mock SessionService to isolate route logic from DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { handleGetSessionSnapshot } from './session_snapshot.js';
import type { SessionService } from '../services/index.js';
import type { SessionSnapshotResponse } from '../../shared/types/api.js';
import type { TerminalSnapshot } from '#vt-wasm/types';

function makeSnapshot(): TerminalSnapshot {
  return { cols: 80, rows: 24, lines: [{ spans: [{ text: 'hello' }] }] };
}

function makeMockService(
  result:
    | { ok: true; data: SessionSnapshotResponse }
    | { ok: false; status: 404 | 429 | 500; error: string },
): Pick<SessionService, 'getSessionSnapshot'> {
  return {
    getSessionSnapshot: vi.fn().mockResolvedValue(result),
  } as unknown as Pick<SessionService, 'getSessionSnapshot'>;
}

function makeApp(service: Pick<SessionService, 'getSessionSnapshot'>) {
  const app = new Hono();
  app.get('/api/sessions/:id/snapshot', (c) =>
    handleGetSessionSnapshot(c, service as SessionService),
  );
  return app;
}

describe('GET /api/sessions/:id/snapshot', () => {
  it('returns 200 with snapshot when session exists', async () => {
    const snapshot = makeSnapshot();
    const data: SessionSnapshotResponse = { id: 'sess-1', snapshot };
    const app = makeApp(makeMockService({ ok: true, data }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/sess-1/snapshot'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionSnapshotResponse;
    expect(body.id).toBe('sess-1');
    expect(body.snapshot).toEqual(snapshot);
  });

  it('returns 200 with null snapshot when none stored', async () => {
    const data: SessionSnapshotResponse = { id: 'sess-1', snapshot: null };
    const app = makeApp(makeMockService({ ok: true, data }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/sess-1/snapshot'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionSnapshotResponse;
    expect(body.snapshot).toBeNull();
  });

  it('returns 404 when session not found', async () => {
    const app = makeApp(makeMockService({ ok: false, status: 404, error: 'Session not found' }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/missing/snapshot'));

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Session not found');
  });

  it('returns 400 for empty id', async () => {
    const data: SessionSnapshotResponse = { id: 'x', snapshot: null };
    const app = makeApp(makeMockService({ ok: true, data }));

    const res = await app.fetch(new Request('http://localhost/api/sessions/%20/snapshot'));

    expect(res.status).toBe(400);
  });
});

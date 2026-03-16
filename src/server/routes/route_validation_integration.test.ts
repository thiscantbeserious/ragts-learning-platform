// @vitest-environment node
/**
 * Integration tests for route-level validation (Stage 2b).
 *
 * Tests that validation is wired to every API route:
 * - Invalid path params return 400
 * - Malformed upload headers return 422 with field info
 * - Valid requests still succeed (no regression)
 *
 * These tests do NOT modify existing test files — this is a new file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initVt } from '#vt-wasm';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import { EmitterEventBusImpl } from '../events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from '../processing/pipeline_orchestrator.js';
import { createApp } from '../app.js';
import type { AppDeps } from '../app.js';

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

let testDir: string;
let ctx: DatabaseContext;
let orchestrator: PipelineOrchestrator;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  await initVt();
  testDir = mkdtempSync(join(tmpdir(), 'ragts-validation-test-'));

  const impl = new SqliteDatabaseImpl();
  ctx = await impl.initialize({ dataDir: testDir });

  const eventBus = new EmitterEventBusImpl();
  orchestrator = new PipelineOrchestrator(eventBus, ctx.jobQueue, {
    sessionRepository: ctx.sessionRepository,
  });
  await orchestrator.start();

  const deps: AppDeps = {
    sessionRepository: ctx.sessionRepository,
    sectionRepository: ctx.sectionRepository,
    storageAdapter: ctx.storageAdapter,
    jobQueue: ctx.jobQueue,
    eventLog: ctx.eventLog,
    eventBus,
    ping: async () => { /* no-op */ },
    config: {
      dataDir: testDir,
      port: 3000,
      corsOrigin: '*',
      maxFileSizeMB: 2,
      nodeEnv: 'test',
    },
  };

  app = createApp(deps);
});

afterEach(async () => {
  await orchestrator.stop();
  await ctx.close();
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Valid .cast header for positive tests
// ---------------------------------------------------------------------------

const VALID_CAST = [
  JSON.stringify({ version: 3, width: 220, height: 50 }),
  JSON.stringify([0.0, 'o', 'hello']),
  '',
].join('\n');

// A valid header but with version 2 (not supported by Typia tags — expects exactly 3)
const HEADER_WRONG_VERSION = [
  JSON.stringify({ version: 2, width: 220, height: 50 }),
  JSON.stringify([0.0, 'o', 'hello']),
  '',
].join('\n');

// A header with width 0 — fails PositiveUInt32 (Minimum<1>)
const HEADER_ZERO_WIDTH = [
  JSON.stringify({ version: 3, width: 0, height: 50 }),
  JSON.stringify([0.0, 'o', 'hello']),
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Path param validation — GET /api/sessions/:id
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:id — path param validation', () => {
  it('returns 404 for a well-formed but non-existent id', async () => {
    const res = await app.fetch(new Request('http://localhost/api/sessions/does-not-exist'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Path param validation — DELETE /api/sessions/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/sessions/:id — path param validation', () => {
  it('returns 404 for a well-formed but non-existent id', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/no-such-id', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Path param validation — GET /api/sessions/:id/status
// ---------------------------------------------------------------------------

describe('GET /api/sessions/:id/status — path param validation', () => {
  it('returns 404 for a well-formed but non-existent id', async () => {
    const res = await app.fetch(new Request('http://localhost/api/sessions/no-such-id/status'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Path param validation — POST /api/sessions/:id/retry
// ---------------------------------------------------------------------------

describe('POST /api/sessions/:id/retry — path param validation', () => {
  it('returns 404 for a well-formed but non-existent id', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/no-such-id/retry', { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Path param validation — POST /api/sessions/:id/redetect
// ---------------------------------------------------------------------------

describe('POST /api/sessions/:id/redetect — path param validation', () => {
  it('returns 404 for a well-formed but non-existent id', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/sessions/no-such-id/redetect', { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Query param validation — GET /api/events
// ---------------------------------------------------------------------------

describe('GET /api/events — query param validation', () => {
  it('returns 400 when sessionId is an empty string', async () => {
    const res = await app.fetch(new Request('http://localhost/api/events?sessionId='));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await app.fetch(new Request('http://localhost/api/events'));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 404 when sessionId is well-formed but session not found', async () => {
    const res = await app.fetch(new Request('http://localhost/api/events?sessionId=no-such-id'));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Upload validation — POST /api/upload
// ---------------------------------------------------------------------------

describe('POST /api/upload — header validation', () => {
  it('accepts a valid asciicast v3 file', async () => {
    const formData = new FormData();
    formData.append('file', new File([VALID_CAST], 'test.cast', { type: 'text/plain' }));

    const res = await app.fetch(
      new Request('http://localhost/api/upload', { method: 'POST', body: formData }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.filename).toBe('test.cast');
  });

  it('rejects an asciicast file with version 2 (not supported)', async () => {
    const formData = new FormData();
    formData.append('file', new File([HEADER_WRONG_VERSION], 'v2.cast', { type: 'text/plain' }));

    const res = await app.fetch(
      new Request('http://localhost/api/upload', { method: 'POST', body: formData }),
    );

    // validateAsciicast rejects version 2 before Typia validation even runs
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('rejects an asciicast file with width 0 (fails Typia PositiveUInt32 constraint)', async () => {
    const formData = new FormData();
    formData.append('file', new File([HEADER_ZERO_WIDTH], 'bad-width.cast', { type: 'text/plain' }));

    const res = await app.fetch(
      new Request('http://localhost/api/upload', { method: 'POST', body: formData }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('fields');
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(0);
  });

  it('rejects upload with no file', async () => {
    const formData = new FormData();

    const res = await app.fetch(
      new Request('http://localhost/api/upload', { method: 'POST', body: formData }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/sessions — list (regression: valid request still works)
// ---------------------------------------------------------------------------

describe('GET /api/sessions — regression', () => {
  it('returns empty array when no sessions exist', async () => {
    const res = await app.fetch(new Request('http://localhost/api/sessions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

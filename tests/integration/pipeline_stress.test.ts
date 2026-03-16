// @vitest-environment node
/**
 * Pipeline stress test — bulk upload with responsiveness metrics.
 *
 * Starts a real HTTP server (Hono + SQLite), uploads all fixture files
 * multiple times in rapid succession, waits for all pipelines to complete,
 * and measures/reports timing metrics per session and overall.
 *
 * Also verifies server responsiveness (health check latency) during processing,
 * and that no sessions fail with a RangeError.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { SqliteDatabaseImpl } from '../../src/server/db/sqlite/sqlite_database_impl.js';
import { EmitterEventBusImpl } from '../../src/server/events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from '../../src/server/processing/pipeline_orchestrator.js';
import { createApp } from '../../src/server/app.js';
import type { AppDeps } from '../../src/server/app.js';
import type { DatabaseContext } from '../../src/server/db/database_adapter.js';
import { initVt } from '#vt-wasm';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');
const POLL_INTERVAL_MS = 500;
const PIPELINE_TIMEOUT_MS = 120_000;
const HEALTH_RESPONSE_THRESHOLD_MS = 1000;

/** All fixture files available in tests/fixtures — failing-session.cast excluded (identical to codex-medium) */
const REAL_FIXTURE_FILES = [
  'claude-medium.cast',
  'claude-small.cast',
  'codex-medium.cast',
  'codex-small.cast',
  'gemini-medium.cast',
  'gemini-small.cast',
  'sample.cast',
] as const;

/** 15-entry upload list simulating a bulk upload similar to the user's scenario */
const BULK_UPLOAD_FIXTURES: string[] = [
  'claude-medium.cast',
  'claude-small.cast',
  'codex-medium.cast',
  'codex-small.cast',
  'gemini-medium.cast',
  'gemini-small.cast',
  'sample.cast',
  // Duplicates to reach ~15 entries
  'claude-medium.cast',
  'codex-medium.cast',
  'gemini-medium.cast',
  'claude-medium.cast',
  'codex-medium.cast',
  'gemini-medium.cast',
  'claude-small.cast',
  'codex-small.cast',
];

interface TestState {
  server: Server;
  baseUrl: string;
  testDir: string;
  ctx: DatabaseContext;
  orchestrator: PipelineOrchestrator;
}

const state: Partial<TestState> = {};

/** Poll a session until it reaches a terminal status or the timeout expires. */
async function waitForPipeline(baseUrl: string, sessionId: string, pollStart: number): Promise<string> {
  let status = 'pending';
  while (status !== 'completed' && status !== 'failed') {
    if (performance.now() - pollStart > PIPELINE_TIMEOUT_MS) {
      throw new Error(`Timeout waiting for session ${sessionId} to complete (still '${status}')`);
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
    const data = await res.json() as { detection_status: string };
    status = data.detection_status;
  }
  return status;
}

/** Upload a single fixture file and return the session id. */
async function uploadFixture(baseUrl: string, fixture: string, index: number): Promise<{ id: string; uploadMs: number }> {
  const start = performance.now();
  const formData = new FormData();
  const fileContent = readFileSync(join(FIXTURES_DIR, fixture));
  formData.append('file', new Blob([fileContent]), `upload-${index}-${fixture}`);

  const res = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  const uploadMs = performance.now() - start;
  expect(res.status, `Upload ${index} (${fixture}) should return 201`).toBe(201);
  const data = await res.json() as { id: string };
  return { id: data.id, uploadMs };
}

beforeAll(async () => {
  await initVt();

  const testDir = mkdtempSync(join(tmpdir(), 'ragts-stress-test-'));

  const impl = new SqliteDatabaseImpl();
  const ctx = await impl.initialize({ dataDir: testDir });

  const eventBus = new EmitterEventBusImpl();
  const orchestrator = new PipelineOrchestrator(eventBus, ctx.jobQueue, {
    sessionRepository: ctx.sessionRepository,
    storageAdapter: ctx.storageAdapter,
  });
  await orchestrator.start();

  const deps: AppDeps = {
    sessionRepository: ctx.sessionRepository,
    sectionRepository: ctx.sectionRepository,
    storageAdapter: ctx.storageAdapter,
    jobQueue: ctx.jobQueue,
    eventLog: ctx.eventLog,
    eventBus,
    ping: ctx.ping,
    config: {
      port: 0,
      dataDir: testDir,
      maxFileSizeMB: 250,
      nodeEnv: 'test',
      corsOrigin: undefined,
    },
  };

  const app = createApp(deps);

  await new Promise<void>((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      state.baseUrl = `http://localhost:${info.port}`;
      resolve();
    });
    state.server = server as Server;
  });

  state.testDir = testDir;
  state.ctx = ctx;
  state.orchestrator = orchestrator;
}, 30_000);

afterAll(async () => {
  if (state.orchestrator) {
    // Drain any queued/deferred jobs before shutting down to prevent
    // "statement has been finalized" errors from async job chains firing
    // after the DB is closed.
    await state.orchestrator.waitForPending();
    await state.orchestrator.stop();
  }
  if (state.ctx) {
    await state.ctx.close();
  }
  if (state.server) {
    await new Promise<void>((resolve) => state.server!.close(() => resolve()));
  }
  if (state.testDir) {
    rmSync(state.testDir, { recursive: true, force: true });
  }
});

describe('Pipeline stress test — bulk upload with responsiveness', () => {
  it('processes all fixture uploads without RangeError', async () => {
    const baseUrl = state.baseUrl!;
    const fixtures = BULK_UPLOAD_FIXTURES;

    // Upload all fixtures in rapid succession without waiting between them
    const uploadResults = await Promise.all(
      fixtures.map((fixture, i) => uploadFixture(baseUrl, fixture, i))
    );

    const sessionIds = uploadResults.map((r) => r.id);
    expect(sessionIds.length).toBe(fixtures.length);

    // Poll all sessions in parallel for completion
    const pollStart = performance.now();
    const pipelineResults = await Promise.all(
      sessionIds.map(async (id) => {
        const sessionStart = performance.now();
        const status = await waitForPipeline(baseUrl, id, pollStart);
        const pipelineMs = performance.now() - sessionStart;
        return { id, status, pipelineMs };
      })
    );

    const totalMs = performance.now() - pollStart;

    // Report timing metrics
    console.log('\n=== Pipeline Stress Test Results ===');
    console.log(`Total sessions: ${sessionIds.length}`);
    console.log(`Total pipeline time: ${(totalMs / 1000).toFixed(2)}s`);
    console.log(`Average per session: ${(totalMs / sessionIds.length / 1000).toFixed(2)}s`);
    console.log('\nUpload times:');
    for (const [i, r] of uploadResults.entries()) {
      console.log(`  upload-${i}-${fixtures[i]}: ${r.uploadMs.toFixed(0)}ms`);
    }
    console.log('\nPer-session pipeline times:');
    for (const r of pipelineResults) {
      console.log(`  ${r.id}: ${(r.pipelineMs / 1000).toFixed(2)}s — ${r.status}`);
    }

    // Verify all sessions completed without failure
    for (const { id, status } of pipelineResults) {
      expect(status, `Session ${id} should complete without error`).toBe('completed');
    }
  }, PIPELINE_TIMEOUT_MS);

  it('server remains responsive during pipeline processing', async () => {
    const baseUrl = state.baseUrl!;

    // Upload the largest fixture to trigger substantial processing
    const formData = new FormData();
    const fileContent = readFileSync(join(FIXTURES_DIR, 'codex-medium.cast'));
    formData.append('file', new Blob([fileContent]), 'responsiveness-test.cast');

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json() as { id: string };
    const sessionId = uploadData.id;

    // Measure health check latency while processing runs in the background
    const healthTimes: number[] = [];
    let processing = true;

    const healthChecker = (async () => {
      while (processing) {
        const start = performance.now();
        const res = await fetch(`${baseUrl}/api/health`);
        const elapsed = performance.now() - start;
        healthTimes.push(elapsed);
        expect(res.status, 'Health check must return 200 during processing').toBe(200);
        expect(elapsed, `Health check latency ${elapsed.toFixed(0)}ms exceeds ${HEALTH_RESPONSE_THRESHOLD_MS}ms`).toBeLessThan(HEALTH_RESPONSE_THRESHOLD_MS);
        await new Promise<void>((r) => setTimeout(r, 200));
      }
    })();

    // Wait for the uploaded session to reach a terminal state
    const pollStart = performance.now();
    const finalStatus = await waitForPipeline(baseUrl, sessionId, pollStart);
    processing = false;
    await healthChecker;

    console.log(`\nHealth check times during processing (${healthTimes.length} pings):`);
    console.log(`  Min: ${Math.min(...healthTimes).toFixed(1)}ms`);
    console.log(`  Max: ${Math.max(...healthTimes).toFixed(1)}ms`);
    const avg = healthTimes.reduce((a, b) => a + b, 0) / healthTimes.length;
    console.log(`  Avg: ${avg.toFixed(1)}ms`);

    expect(finalStatus, 'Session should complete successfully').toBe('completed');
  }, 60_000);
});

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
import { generateLargeCast } from './generate_large_cast.js';
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { SqliteDatabaseImpl } from '../../src/server/db/sqlite/sqlite_database_impl.js';
import { EmitterEventBusImpl } from '../../src/server/events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from '../../src/server/processing/pipeline_orchestrator.js';
import { createApp } from '../../src/server/app.js';
import type { AppDeps } from '../../src/server/app.js';
import type { DatabaseContext } from '../../src/server/db/database_adapter.js';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');
const POLL_INTERVAL_MS = 500;
const PIPELINE_TIMEOUT_MS = 120_000;
const HEALTH_RESPONSE_THRESHOLD_MS = 1000;

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
async function waitForPipeline(
  baseUrl: string,
  sessionId: string,
  pollStart: number,
  timeoutMs: number = PIPELINE_TIMEOUT_MS,
): Promise<string> {
  let status = 'pending';
  while (status !== 'completed' && status !== 'failed') {
    if (performance.now() - pollStart > timeoutMs) {
      throw new Error(`Timeout waiting for session ${sessionId} to complete (still '${status}')`);
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`);
      const data = await res.json() as { detection_status: string };
      status = data.detection_status;
    } catch (err) {
      // Transient connection errors (ECONNRESET, ECONNREFUSED) can occur when
      // the server event loop is saturated by WASM processing. Retry next poll.
      // Node.js native fetch wraps socket errors as TypeError with a cause.
      const code = (err as NodeJS.ErrnoException).code ??
        ((err as { cause?: NodeJS.ErrnoException }).cause?.code);
      if (code !== 'ECONNRESET' && code !== 'ECONNREFUSED') throw err;
    }
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
  const testDir = mkdtempSync(join(tmpdir(), 'ragts-stress-test-'));

  const impl = new SqliteDatabaseImpl();
  const ctx = await impl.initialize({ dataDir: testDir });

  const eventBus = new EmitterEventBusImpl();
  const orchestrator = new PipelineOrchestrator(eventBus, ctx.jobQueue, {
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
    // Drain queued/deferred jobs before shutting down to prevent
    // "statement has been finalized" errors from async job chains.
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
}, 30_000);

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

/** Upload a pre-built Buffer as a cast file and return the session id. */
async function uploadBuffer(baseUrl: string, content: Buffer, name: string): Promise<{ id: string; uploadMs: number }> {
  const start = performance.now();
  const formData = new FormData();
  formData.append('file', new Blob([content]), name);
  const res = await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: formData });
  const uploadMs = performance.now() - start;
  expect(res.status, `Upload ${name} should return 201`).toBe(201);
  const data = await res.json() as { id: string };
  return { id: data.id, uploadMs };
}

/**
 * Performance budgets — if these fail, the fix is insufficient and we need
 * intra-stage yielding (Option B) or worker threads.
 */
const IS_CI = !!process.env.CI;

const PERF = {
  /** Max wall-clock for the entire pipeline on a 2MB session (CI runners are ~3-4x slower than local) */
  MAX_PIPELINE_SMALL_MS: 30_000,
  /** Max wall-clock for the entire pipeline on a 5MB session */
  MAX_PIPELINE_LARGE_MS: 60_000,
  /** Max latency for any single health check during processing (CI runners have higher variance) */
  MAX_HEALTH_LATENCY_MS: IS_CI ? 2_000 : 1_000,
  /** Health probe interval */
  PROBE_INTERVAL_MS: 100,
} as const;

/**
 * Runs a session through the full pipeline while continuously probing
 * the server for responsiveness. Returns timing data for assertions.
 */
async function runWithResponsivenessProbe(
  baseUrl: string,
  sessionId: string,
  budgetMs: number,
): Promise<{
  status: string;
  pipelineMs: number;
  healthProbes: number[];
  failedProbes: number;
}> {
  const healthProbes: number[] = [];
  let failedProbes = 0;
  let done = false;

  // Probe health continuously while pipeline runs
  const prober = (async () => {
    while (!done) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.status !== 200) failedProbes++;
        healthProbes.push(performance.now() - t0);
      } catch {
        failedProbes++;
        healthProbes.push(performance.now() - t0);
      }
      await new Promise<void>(r => setTimeout(r, PERF.PROBE_INTERVAL_MS));
    }
  })();

  const t0 = performance.now();
  const status = await waitForPipeline(baseUrl, sessionId, t0, budgetMs);
  const pipelineMs = performance.now() - t0;
  done = true;
  await prober;

  return { status, pipelineMs, healthProbes, failedProbes };
}

function reportResults(label: string, sizeMB: string, result: Awaited<ReturnType<typeof runWithResponsivenessProbe>>) {
  const { pipelineMs, healthProbes, failedProbes } = result;
  const max = healthProbes.length > 0 ? Math.max(...healthProbes) : 0;
  const avg = healthProbes.length > 0 ? healthProbes.reduce((a, b) => a + b, 0) / healthProbes.length : 0;
  const min = healthProbes.length > 0 ? Math.min(...healthProbes) : 0;
  console.log(`\n=== ${label} ===`);
  console.log(`File: ${sizeMB}MB | Pipeline: ${(pipelineMs / 1000).toFixed(2)}s | Status: ${result.status}`);
  console.log(`Health probes: ${healthProbes.length} total, ${failedProbes} failed`);
  console.log(`  Latency — min: ${min.toFixed(1)}ms | avg: ${avg.toFixed(1)}ms | max: ${max.toFixed(1)}ms`);
}

describe('Synthetic large session tests', () => {
  it('2MB / 30 sections / resizes — completes within budget, server stays responsive', async () => {
    const baseUrl = state.baseUrl!;
    const buf = generateLargeCast({ sections: 30, targetSizeMB: 2, includeResizes: true, resizeInterval: 10 });
    const sizeMB = (buf.length / 1024 / 1024).toFixed(2);

    const { id } = await uploadBuffer(baseUrl, buf, 'synthetic-2mb.cast');
    const result = await runWithResponsivenessProbe(baseUrl, id, PERF.MAX_PIPELINE_SMALL_MS);
    reportResults('2MB / 30 sections / resizes', sizeMB, result);

    expect(result.status, 'Pipeline must complete (no RangeError)').toBe('completed');
    expect(result.pipelineMs, `Pipeline exceeded ${PERF.MAX_PIPELINE_SMALL_MS / 1000}s budget`).toBeLessThan(PERF.MAX_PIPELINE_SMALL_MS);
    const maxFailedProbes = Math.max(2, Math.ceil(result.healthProbes.length * 0.1));
    expect(result.failedProbes, `Too many failed health probes: ${result.failedProbes}/${result.healthProbes.length}`).toBeLessThanOrEqual(maxFailedProbes);
    const maxLatency = result.healthProbes.length > 0 ? Math.max(...result.healthProbes) : 0;
    expect(maxLatency, `Max health latency ${maxLatency.toFixed(0)}ms exceeds ${PERF.MAX_HEALTH_LATENCY_MS}ms`).toBeLessThan(PERF.MAX_HEALTH_LATENCY_MS);
  }, PERF.MAX_PIPELINE_SMALL_MS + 5_000);

  it('5MB / 50 sections / resizes — completes within budget, server stays responsive', async () => {
    const baseUrl = state.baseUrl!;
    const buf = generateLargeCast({ sections: 50, targetSizeMB: 5, includeResizes: true, resizeInterval: 10 });
    const sizeMB = (buf.length / 1024 / 1024).toFixed(2);

    const { id } = await uploadBuffer(baseUrl, buf, 'synthetic-5mb.cast');
    const result = await runWithResponsivenessProbe(baseUrl, id, PERF.MAX_PIPELINE_LARGE_MS);
    reportResults('5MB / 50 sections / resizes', sizeMB, result);

    expect(result.status, 'Pipeline must complete (no RangeError)').toBe('completed');
    expect(result.pipelineMs, `Pipeline exceeded ${PERF.MAX_PIPELINE_LARGE_MS / 1000}s budget`).toBeLessThan(PERF.MAX_PIPELINE_LARGE_MS);
    const maxFailedProbes = Math.max(2, Math.ceil(result.healthProbes.length * 0.1));
    expect(result.failedProbes, `Too many failed health probes: ${result.failedProbes}/${result.healthProbes.length}`).toBeLessThanOrEqual(maxFailedProbes);
    const maxLatency = result.healthProbes.length > 0 ? Math.max(...result.healthProbes) : 0;
    expect(maxLatency, `Max health latency ${maxLatency.toFixed(0)}ms exceeds ${PERF.MAX_HEALTH_LATENCY_MS}ms`).toBeLessThan(PERF.MAX_HEALTH_LATENCY_MS);
  }, PERF.MAX_PIPELINE_LARGE_MS + 5_000);
});

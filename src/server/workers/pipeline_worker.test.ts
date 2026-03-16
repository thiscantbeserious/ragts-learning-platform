// @vitest-environment node
/**
 * Tests for the pipeline worker thread.
 *
 * Verifies that the worker:
 * - Initialises WASM and sends 'ready' on startup
 * - Runs validate + detect + replay + dedup in sequence for a valid .cast file
 * - Returns a ProcessedSession-shaped result
 * - Returns ok:false with a stage name on error
 *
 * The worker is compiled via buildWorkerScript (esbuild) since tsx cannot resolve
 * .js imports to .ts files in worker_threads context.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildWorkerScript, type BuiltWorker } from './build_worker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ENTRY = resolve(__dirname, 'pipeline_worker.ts');

let builtWorker: BuiltWorker;

beforeAll(async () => {
  builtWorker = await buildWorkerScript(WORKER_ENTRY);
}, 30000);

afterAll(() => {
  builtWorker?.cleanup();
});

/** Spawn a pipeline worker and wait for it to send 'ready'. */
function spawnWorker(): Promise<Worker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(builtWorker.path);

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Worker did not become ready within 10s'));
    }, 10000);

    worker.once('message', (msg: { type: string }) => {
      if (msg.type === 'ready') {
        clearTimeout(timer);
        resolve(worker);
      }
    });

    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Send a job to the worker and return the result message. */
function runJob(worker: Worker, id: number, payload: unknown): Promise<{
  type: string;
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  stage?: string;
}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Job timed out after 15s'));
    }, 15000);

    worker.on('message', (msg) => {
      if (msg.type === 'result' && msg.id === id) {
        clearTimeout(timer);
        resolve(msg);
      }
    });

    worker.postMessage({ type: 'job', id, payload });
  });
}

function buildShortCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.15, 'o', 'hello\r\n']),
    JSON.stringify([0.2, 'o', '$ ']),
  ].join('\n');
}

describe('pipeline_worker', { timeout: 30000 }, () => {
  let worker: Worker | null = null;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pipeline-worker-test-'));
  });

  afterAll(async () => {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sends ready after WASM init', async () => {
    worker = await spawnWorker();
    expect(worker).toBeTruthy();
  });

  it('returns ok:true with ProcessedSession for a valid .cast file', async () => {
    if (!worker) worker = await spawnWorker();

    const content = buildShortCast();
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, content);
    const sessionId = 'test-session-001';

    const msg = await runJob(worker, 1, { filePath, sessionId });

    expect(msg.ok).toBe(true);
    const result = msg.result as {
      sessionId: string;
      snapshot: string;
      sections: unknown[];
      eventCount: number;
      detectedSectionsCount: number;
    };
    expect(result.sessionId).toBe(sessionId);
    expect(typeof result.snapshot).toBe('string');
    expect(Array.isArray(result.sections)).toBe(true);
    expect(typeof result.eventCount).toBe('number');
    expect(typeof result.detectedSectionsCount).toBe('number');
  });

  it('returns ok:false with stage name on error (nonexistent file)', async () => {
    if (!worker) worker = await spawnWorker();

    const msg = await runJob(worker, 2, {
      filePath: '/nonexistent/file.cast',
      sessionId: 'test-session-002',
    });

    expect(msg.ok).toBe(false);
    expect(typeof msg.error).toBe('string');
    expect(typeof msg.stage).toBe('string');
    expect(msg.stage).toBe('validate');
  });

  it('handles multiple sequential jobs correctly', async () => {
    if (!worker) worker = await spawnWorker();

    const content = buildShortCast();
    const filePath = join(tmpDir, 'session2.cast');
    writeFileSync(filePath, content);

    const msg1 = await runJob(worker, 10, { filePath, sessionId: 'seq-001' });
    const msg2 = await runJob(worker, 11, { filePath, sessionId: 'seq-002' });

    expect(msg1.ok).toBe(true);
    expect(msg2.ok).toBe(true);
    expect((msg1.result as { sessionId: string }).sessionId).toBe('seq-001');
    expect((msg2.result as { sessionId: string }).sessionId).toBe('seq-002');
  });
});

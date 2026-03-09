// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runPipeline, waitForPipelines } from './pipeline_tracker.js';
import { NdjsonStream } from './ndjson_stream.js';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper: create a controllable deferred promise
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// NOTE: pipeline-tracker has module-level state (activeCount, waitQueue, inflight).
// Tests must be run sequentially and must fully drain the semaphore between cases
// to avoid cross-test interference.
// Each test calls waitForPipelines() at the end to drain inflight state.

describe('pipeline-tracker semaphore', () => {
  it('allows up to 3 concurrent pipelines to start immediately', async () => {
    const started: number[] = [];
    const deferreds = [deferred(), deferred(), deferred()];

    for (let i = 0; i < 3; i++) {
      const idx = i;
      runPipeline(async () => {
        started.push(idx);
        await deferreds[idx]!.promise;
      });
    }

    // Yield to microtask queue so pipelines can start
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toHaveLength(3);

    deferreds.forEach(d => d.resolve());
    await waitForPipelines();
  });

  it('queues 4th call until a slot is freed', async () => {
    const deferreds = [deferred(), deferred(), deferred()];
    let fourthStarted = false;

    for (let i = 0; i < 3; i++) {
      const idx = i;
      runPipeline(async () => { await deferreds[idx]!.promise; });
    }

    // Yield so the 3 pipelines acquire their slots
    await Promise.resolve();
    await Promise.resolve();

    runPipeline(async () => { fourthStarted = true; });

    await Promise.resolve();
    await Promise.resolve();

    // 4th has not started because all slots are occupied
    expect(fourthStarted).toBe(false);

    // Release one slot
    deferreds[0]!.resolve();
    await new Promise(r => setTimeout(r, 10));

    expect(fourthStarted).toBe(true);

    deferreds[1]!.resolve();
    deferreds[2]!.resolve();
    await waitForPipelines();
  });

  it('releases slot even when pipeline fn throws', async () => {
    const blockDeferreds = [deferred(), deferred()];
    let afterThrowStarted = false;

    // Fill 2 slots with blocking pipelines
    for (let i = 0; i < 2; i++) {
      const idx = i;
      runPipeline(async () => { await blockDeferreds[idx]!.promise; });
    }

    // Fill slot 3 with a throwing pipeline
    const throwDeferred = deferred();
    runPipeline(async () => {
      await throwDeferred.promise;
      throw new Error('intentional pipeline error');
    });

    await Promise.resolve();
    await Promise.resolve();

    // Queue a 4th pipeline
    runPipeline(async () => { afterThrowStarted = true; });

    await Promise.resolve();
    await Promise.resolve();

    expect(afterThrowStarted).toBe(false);

    // Trigger the throw — slot should be released
    throwDeferred.resolve();
    await new Promise(r => setTimeout(r, 10));

    expect(afterThrowStarted).toBe(true);

    blockDeferreds[0]!.resolve();
    blockDeferreds[1]!.resolve();
    await waitForPipelines();
  });

  it('preserves FIFO ordering of waiters', async () => {
    const blockDeferreds = [deferred(), deferred(), deferred()];
    const order: number[] = [];

    // Fill 3 slots
    for (let i = 0; i < 3; i++) {
      const idx = i;
      runPipeline(async () => { await blockDeferreds[idx]!.promise; });
    }

    await Promise.resolve();
    await Promise.resolve();

    // Queue 3 waiters in order 0, 1, 2
    for (let i = 0; i < 3; i++) {
      const idx = i;
      runPipeline(async () => { order.push(idx); });
    }

    await Promise.resolve();

    // Release slots one at a time and verify FIFO order
    for (let i = 0; i < 3; i++) {
      blockDeferreds[i]!.resolve();
      await new Promise(r => setTimeout(r, 10));
    }

    await waitForPipelines();

    expect(order).toEqual([0, 1, 2]);
  });
});

describe('NdjsonStream malformedLineCount', () => {
  it('starts at 0 for a valid .cast file', async () => {
    const fixturePath = path.resolve(__dirname, '../../../fixtures/sample.cast');
    const stream = new NdjsonStream(fixturePath);
    for await (const _item of stream) { /* consume */ }
    expect(stream.malformedLineCount).toBe(0);
  });

  it('increments malformedLineCount for invalid JSON lines', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-malformed-${Date.now()}.cast`);
    const content = [
      '{"version":2,"width":80,"height":24}',
      'not-valid-json',
      '[0.1, "o", "hello"]',
      'also bad json !!!',
    ].join('\n');
    await fs.writeFile(tmpFile, content, 'utf-8');

    const stream = new NdjsonStream(tmpFile);
    const items: unknown[] = [];
    for await (const item of stream) { items.push(item); }
    await fs.unlink(tmpFile);

    expect(stream.malformedLineCount).toBe(2);
  });

  it('increments malformedLineCount for non-array event lines', async () => {
    const tmpFile = path.join(os.tmpdir(), `test-nonarray-${Date.now()}.cast`);
    const content = [
      '{"version":2,"width":80,"height":24}',
      '[0.1, "o", "hello"]',   // valid event
      '{"not": "an array"}',    // non-array event -> malformed
      '"just a string"',        // non-array event -> malformed
      '[0.3, "o", "world"]',   // valid event
    ].join('\n');
    await fs.writeFile(tmpFile, content, 'utf-8');

    const stream = new NdjsonStream(tmpFile);
    const items: unknown[] = [];
    for await (const item of stream) { items.push(item); }
    await fs.unlink(tmpFile);

    expect(stream.malformedLineCount).toBe(2);
  });
});

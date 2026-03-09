/**
 * Pipeline concurrency tracker with FIFO semaphore.
 *
 * Limits concurrent pipeline executions to MAX_CONCURRENT_PIPELINES.
 * Waiting callers are queued FIFO and resumed as slots become available.
 * Also tracks in-flight pipelines for graceful shutdown via waitForPipelines().
 */

/** Maximum number of simultaneously executing pipelines. */
const MAX_CONCURRENT_PIPELINES = 3;

/** In-flight pipeline promises (for graceful shutdown). */
const inflight = new Set<Promise<void>>();

/** FIFO queue of resolve functions waiting for a semaphore slot. */
const waitQueue: Array<{ resolve: () => void }> = [];

/** Number of currently active (running) pipeline slots. */
let activeCount = 0;

/** Release one semaphore slot, waking the next FIFO waiter if any. */
function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next.resolve();
  } else {
    activeCount--;
  }
}

/**
 * Acquire a semaphore slot.
 * Resolves immediately if a slot is free, otherwise queues and awaits.
 */
function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT_PIPELINES) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>(resolve => {
    waitQueue.push({ resolve });
  });
}

/**
 * Run a pipeline function with concurrency control.
 * Acquires a semaphore slot (waiting FIFO if all slots are taken),
 * runs fn(), and releases the slot in finally — even if fn() throws.
 *
 * The pipeline is tracked for graceful shutdown via waitForPipelines().
 */
export function runPipeline(fn: () => Promise<void>): Promise<void> {
  const pipeline = (async () => {
    await acquireSlot();
    try {
      await fn();
    } finally {
      releaseSlot();
    }
  })();

  inflight.add(pipeline);
  pipeline.catch(() => {}).finally(() => inflight.delete(pipeline));

  return pipeline;
}

/** Wait for all in-flight pipelines to complete. */
export async function waitForPipelines(): Promise<void> {
  await Promise.allSettled(inflight);
}

/** Tracks in-flight background pipelines for graceful shutdown and test awaiting. */
const inflight = new Set<Promise<void>>();

/** Register a pipeline promise. Automatically removes itself on completion. */
export function trackPipeline(promise: Promise<void>): void {
  inflight.add(promise);
  promise.finally(() => inflight.delete(promise));
}

/** Wait for all in-flight pipelines to complete. */
export async function waitForPipelines(): Promise<void> {
  await Promise.allSettled([...inflight]);
}

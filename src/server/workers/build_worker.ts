/**
 * Resolves the pipeline worker script for WorkerPool consumption.
 *
 * In production (dist/): the Vite server build already compiled the TS worker
 * to JS. We just return the path to the compiled file — no build step needed.
 *
 * In development (src/): worker threads can't resolve .js → .ts imports
 * (verbatimModuleSyntax + moduleResolution: "bundler" breaks in workers).
 * A separate dev module (build_worker_dev.ts) uses esbuild to bundle the TS
 * entry point to a self-contained JS file at startup (~13ms).
 */

import { existsSync } from 'node:fs';

/** Result of resolving a worker script. */
export interface BuiltWorker {
  /** Absolute path to the JS file — pass this to WorkerPool. */
  path: string;
  /** Call this to clean up any temp files. No-op in production. */
  cleanup: () => void;
}

/**
 * Resolves the pipeline worker entry point to a runnable JS file.
 * In production, returns the pre-compiled path. In development, builds with esbuild.
 */
export async function resolveWorkerScript(tsEntryPoint: string): Promise<BuiltWorker> {
  // Check if a pre-compiled JS version exists (production build via Vite)
  const jsPath = tsEntryPoint.replace(/\.ts$/, '.js');
  if (existsSync(jsPath)) {
    return { path: jsPath, cleanup: () => {} };
  }

  // Development only: compile with esbuild (dynamic import — not available in production)
  const { buildWithEsbuild } = await import('./build_worker_dev.js');
  return buildWithEsbuild(tsEntryPoint);
}

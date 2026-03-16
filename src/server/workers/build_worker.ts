/**
 * Resolves the pipeline worker script for WorkerPool consumption.
 *
 * In production (dist/): the Vite server build already compiled the TS worker
 * to JS. We just return the path to the compiled file — no build step needed.
 *
 * In development (src/): worker threads can't resolve .js → .ts imports
 * (verbatimModuleSyntax + moduleResolution: "bundler" breaks in workers).
 * We dynamically import a dev-only esbuild module to compile the worker.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

  // Development only: dynamically import the esbuild compilation module.
  // The path is constructed at runtime so Vite cannot statically analyze
  // or bundle it — preventing ERR_MODULE_NOT_FOUND in production.
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const devModulePath = join(thisDir, 'build_worker_dev.js');
  const devModule = await import(pathToFileURL(devModulePath).href) as {
    buildWithEsbuild: (entryPoint: string) => Promise<BuiltWorker>;
  };
  return devModule.buildWithEsbuild(tsEntryPoint);
}

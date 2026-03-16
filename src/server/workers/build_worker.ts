/**
 * Resolves the pipeline worker script for WorkerPool consumption.
 *
 * In production (dist/): the Vite server build already compiled the TS worker
 * to JS. We just return the path to the compiled file — no build step needed.
 *
 * In development (src/): worker threads can't resolve .js → .ts imports
 * (verbatimModuleSyntax + moduleResolution: "bundler" breaks in workers).
 * We use esbuild to bundle the TS entry point to a self-contained JS file
 * at startup (~13ms). The output goes to node_modules/.cache/ so the worker
 * can resolve node_modules from the project root.
 */

import { existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(THIS_DIR, '../../..');

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

  // Development: compile with esbuild
  return buildWorkerScript(tsEntryPoint);
}

/**
 * Compiles a TypeScript worker entry point to a self-contained JS file via esbuild.
 * Only used in development — production uses the Vite-compiled output.
 */
async function buildWorkerScript(entryPoint: string): Promise<BuiltWorker> {
  const { build, type: _Plugin } = await import('esbuild');
  type Plugin = import('esbuild').Plugin;

  const { mkdirSync } = await import('node:fs');
  const cacheDir = join(PROJECT_ROOT, 'node_modules', '.cache', 'erika-workers');
  mkdirSync(cacheDir, { recursive: true });
  const outfile = join(cacheDir, `worker-${Date.now()}.mjs`);

  // Resolve #vt-wasm to an absolute path since the bundled worker
  // runs from .cache/ where package.json imports aren't available.
  const vtWasmAbsPath = join(PROJECT_ROOT, 'packages/vt-wasm/index.js');

  const resolveImportsPlugin: Plugin = {
    name: 'resolve-package-imports',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^#vt-wasm/ }, () => ({
        path: vtWasmAbsPath,
        external: true,
      }));
    },
  };

  // Bundle project source code but keep node_modules external
  // to avoid CJS/ESM interop issues with packages like pino.
  const externalNodeModulesPlugin: Plugin = {
    name: 'external-node-modules',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
        if (args.path.startsWith('#')) return undefined;
        return { path: args.path, external: true };
      });
    },
  };

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    plugins: [resolveImportsPlugin, externalNodeModulesPlugin],
  });

  return {
    path: outfile,
    cleanup: () => {
      try { rmSync(outfile, { force: true }); } catch { /* best-effort */ }
    },
  };
}

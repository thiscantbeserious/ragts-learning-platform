/**
 * Resolves the pipeline worker script for WorkerPool consumption.
 *
 * In production (dist/): the Vite server build already compiled the TS worker
 * to JS. We just return the path to the compiled file — no build step needed.
 *
 * In development (src/): worker threads can't resolve .js → .ts imports
 * (verbatimModuleSyntax + moduleResolution: "bundler" breaks in workers).
 * We use esbuild to bundle the TS entry point at startup (~13ms).
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Result of resolving a worker script. */
export interface BuiltWorker {
  /** Absolute path to the JS file — pass this to WorkerPool. */
  path: string;
  /** Call this to clean up any temp files. No-op in production. */
  cleanup: () => void;
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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

  // Development only: compile with esbuild
  let esbuild: typeof import('esbuild');
  try {
    esbuild = require('esbuild') as typeof import('esbuild');
  } catch {
    throw new Error(
      `Cannot resolve worker script: ${tsEntryPoint} does not have a compiled .js version ` +
      `and esbuild is not available. Run 'npm run build' first or install dev dependencies.`
    );
  }

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const cacheDir = join(projectRoot, 'node_modules', '.cache', 'erika-workers');
  mkdirSync(cacheDir, { recursive: true });
  const outfile = join(cacheDir, `worker-${Date.now()}.mjs`);

  const vtWasmAbsPath = join(projectRoot, 'packages/vt-wasm/index.js');

  await esbuild.build({
    entryPoints: [tsEntryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    plugins: [
      {
        name: 'resolve-package-imports',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^#vt-wasm/ }, () => ({
            path: vtWasmAbsPath,
            external: true,
          }));
        },
      },
      {
        name: 'external-node-modules',
        setup(pluginBuild) {
          pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.path.startsWith('#')) return undefined;
            return { path: args.path, external: true };
          });
        },
      },
    ],
  });

  return {
    path: outfile,
    cleanup: () => {
      try { rmSync(outfile, { force: true }); } catch { /* best-effort */ }
    },
  };
}

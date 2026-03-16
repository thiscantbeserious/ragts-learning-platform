/**
 * Development-only esbuild compilation for worker threads.
 * Separated into its own module so the esbuild import is never
 * parsed or resolved in production builds (where esbuild isn't installed).
 */

import { build, type Plugin } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuiltWorker } from './build_worker.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Compiles a TypeScript worker entry point to a self-contained JS file via esbuild.
 * Only used in development — production uses the Vite-compiled output.
 */
export async function buildWithEsbuild(entryPoint: string): Promise<BuiltWorker> {
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

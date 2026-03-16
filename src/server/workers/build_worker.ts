/**
 * Compiles a TypeScript worker script to a temporary JavaScript file using esbuild.
 *
 * Worker threads in Node.js cannot resolve .js → .ts imports when the codebase
 * uses verbatimModuleSyntax + moduleResolution: "bundler". Neither tsx nor Node's
 * --experimental-transform-types handles this correctly in worker threads.
 *
 * Solution: bundle the worker entry point with esbuild at startup (~10ms).
 * The output is a self-contained ESM JS file with all imports resolved.
 * The compiled file is written to a temp directory and cleaned up on shutdown.
 */

import { build, type Plugin } from 'esbuild';
import { rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Result of building a worker script. */
export interface BuiltWorker {
  /** Absolute path to the compiled JS file — pass this to WorkerPool. */
  path: string;
  /** Call this to clean up the temp directory. */
  cleanup: () => void;
}

/**
 * Compiles a TypeScript worker entry point to a self-contained JS file.
 * External modules (native addons, WASM packages) are left as imports.
 *
 * @param entryPoint Absolute path to the .ts worker source
 * @param externals Modules to leave as external imports (e.g., '#vt-wasm', 'better-sqlite3')
 */
export async function buildWorkerScript(
  entryPoint: string,
  _externals: string[] = ['#vt-wasm', 'better-sqlite3'],
): Promise<BuiltWorker> {
  // Output to a .cache directory inside the project so the worker can
  // resolve node_modules from the project root via Node's default algorithm.
  const cacheDir = join(PROJECT_ROOT, 'node_modules', '.cache', 'erika-workers');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(cacheDir, { recursive: true });
  const outfile = join(cacheDir, `worker-${Date.now()}.mjs`);

  // Resolve #vt-wasm (package.json imports field) to a file:// URL
  // since the bundled worker runs from a temp dir where #imports aren't available.
  const vtWasmAbsPath = join(PROJECT_ROOT, 'packages/vt-wasm/index.js');

  const resolveImportsPlugin: Plugin = {
    name: 'resolve-package-imports',
    setup(pluginBuild) {
      // Rewrite #vt-wasm to an absolute file:// path and mark external
      pluginBuild.onResolve({ filter: /^#vt-wasm/ }, () => ({
        path: vtWasmAbsPath,
        external: true,
      }));
    },
  };

  // Mark node_modules as external but bundle project source code.
  // This avoids CJS/ESM interop issues with packages like pino while
  // still inlining our stages, types, and parsers into the bundle.
  const externalNodeModulesPlugin: Plugin = {
    name: 'external-node-modules',
    setup(pluginBuild) {
      // Mark bare module specifiers (not relative/absolute paths) as external
      pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
        // Already handled by the #vt-wasm plugin
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
      try {
        rmSync(outfile, { force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

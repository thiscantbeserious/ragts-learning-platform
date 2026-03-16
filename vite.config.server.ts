/**
 * Vite server build config.
 *
 * Builds src/server/start.ts for production deployment.
 * Uses the same @typia/unplugin pipeline as the dev server so
 * Typia AOT transforms apply in production builds too.
 */

import { defineConfig } from 'vite';
import UnpluginTypia from '@typia/unplugin/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    UnpluginTypia({}),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'dist/server',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        start: 'src/server/start.ts',
        // Pipeline worker must be a separate file — loaded by WorkerPool via new Worker(path)
        'workers/pipeline_worker': 'src/server/workers/pipeline_worker.ts',
      },
      output: {
        entryFileNames: '[name].js',
        format: 'esm',
      },
      external: [
        /^node:/,
        'pino',
        'pino-pretty',
        'esbuild',
        // Dev-only worker compilation — never used in production.
        // Matches both relative (./build_worker_dev.js) and absolute paths.
        /build_worker_dev/,
        /build_worker_dev\.js/,
        // vt-wasm loads .wasm binary via readFileSync relative to import.meta.dirname
        // Must stay external so the path resolves correctly at runtime
        /.*vt-wasm.*/,
        /.*#vt-wasm.*/,
      ],
    },
  },
  ssr: {
    external: ['hono-pino'],
    noExternal: ['hono'],
  },
});

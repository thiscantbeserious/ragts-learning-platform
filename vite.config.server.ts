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
      input: 'src/server/start.ts',
      output: {
        entryFileNames: 'start.js',
        format: 'esm',
      },
      external: [
        /^node:/,
        'pino',
        'pino-pretty',
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

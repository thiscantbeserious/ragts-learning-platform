import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import devServer from '@hono/vite-dev-server';
import UnpluginTypia from '@typia/unplugin/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Appends a build-time content hash query param to blocking design CSS paths
 * so browsers always fetch fresh styles after a deployment.
 * Only affects the production build output — dev server is unchanged.
 */
function cssCacheBust(): Plugin {
  return {
    name: 'css-cache-bust',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        /href="(\/design\/styles\/([^"]+\.css))"/g,
        (_match, fullPath: string, filename: string) => {
          try {
            const content = readFileSync(`./design/styles/${filename}`, 'utf-8');
            const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
            return `href="${fullPath}?v=${hash}"`;
          } catch {
            return `href="${fullPath}"`;
          }
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [
    UnpluginTypia({}),
    vue(),
    cssCacheBust(),
    devServer({
      entry: 'src/server/dev.ts',
      exclude: [
        // Exclude everything EXCEPT /api/* — Vite handles all non-API requests
        // (client routes, static assets, HMR, etc.)
        /^(?!\/api\/).*/,
      ],
    }),
  ],
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: Number(process.env.DEV_SERVER_PORT || 5173),
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  test: {
    environment: 'happy-dom',
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,ts}',
      'packages/**/*.{test,spec}.{js,ts}',
    ],
    exclude: [
      'tests/visual/**',
      'node_modules/**',
    ],
    // Integration tests that spawn PipelineOrchestrator (which creates worker
    // threads) must run sequentially to avoid resource cleanup races.
    // Unit tests and client tests still run in parallel for speed.
    sequence: {
      sequentialFiles: [
        'tests/integration/**',
        'src/server/routes/route_validation_integration*',
        'src/server/workers/pipeline_worker*',
      ],
    },
    environmentMatchGlobs: [
      ['packages/**', 'node'],
      ['src/server/**', 'node'],
      ['tests/snapshots/backend/**', 'node'],
      ['tests/integration/**', 'node'],
    ],
    coverage: {
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: [
        '**/scripts/**',
        '**/migrations/**',
        'packages/vt-wasm/pkg/**',
        'tests/helpers/**',
        'tests/integration/generate_large_cast.ts',
        'src/server/routes/**',
        'src/server/start.ts',
        'src/server/index.ts',
        'src/server/app.ts',
        'src/server/bootstrap.ts',
        'src/server/dev.ts',
        'src/server/workers/build_worker.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});

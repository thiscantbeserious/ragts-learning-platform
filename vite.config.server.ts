import { defineConfig } from 'vite';
import devServer from '@hono/vite-dev-server';
import UnpluginTypia from '@typia/unplugin/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    UnpluginTypia(),
    devServer({
      entry: 'src/server/index.ts',
      exclude: [
        // Don't intercept static file requests
        /^\/@.+$/,
        /^\/src\/client\/.+/,
        /^\/design\/.+/,
        /^\/node_modules\/.*/,
      ],
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: Number(process.env.PORT || 3000),
  },
  ssr: {
    // Externalize native/CJS modules that break under Vite's ESM transform
    external: [
      'better-sqlite3',
      'pino',
      'pino-pretty',
      'hono-pino',
      // Local WASM package uses CJS exports — externalize until migrated to ESM
      path.resolve(__dirname, 'packages/vt-wasm/pkg/vt_wasm.js'),
    ],
  },
});

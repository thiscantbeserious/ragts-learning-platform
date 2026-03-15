# Stage 1a: Config Changes Required (outside backend-engineer write scope)

The backend-engineer write hook blocks `vite.config.ts` and `package.json`.
These changes must be applied by the coordinator or a chore-scoped agent.

## Status

Sub-step 1 (server entry refactor): COMPLETE — committed as 9205bf6
Sub-steps 2 & 3: require changes to `vite.config.ts` and `package.json` below

---

## vite.config.ts changes (sub-steps 2 + 3)

### Change 1: Add imports (after existing imports)

After line:
```ts
import type { Plugin } from 'vite';
```

Add:
```ts
import devServer from '@hono/vite-dev-server';
import UnpluginTypia from '@typia/unplugin/vite';
```

### Change 2: Update plugins array

Replace:
```ts
  plugins: [vue(), cssCacheBust()],
```

With:
```ts
  plugins: [
    UnpluginTypia({}),   // must be before vue() per @typia/unplugin docs
    vue(),
    cssCacheBust(),
    devServer({
      entry: 'src/server/dev.ts',
    }),
  ],
```

### Change 3: Remove proxy, update server port

Replace:
```ts
  server: {
    port: Number(process.env.DEV_SERVER_PORT || 5173),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3000}`,
        changeOrigin: true,
      },
    },
  },
```

With:
```ts
  server: {
    port: Number(process.env.DEV_SERVER_PORT || 5173),
  },
```

Rationale: With @hono/vite-dev-server, the API server runs inside the same
Vite process. No proxy is needed — /api requests are handled by the Hono app
directly. The proxy would try to forward to a separate server that no longer exists.

### Change 4: Add @typia/unplugin to test config

Add to `test` section so Typia AOT transforms apply in Vitest too:

After:
```ts
  test: {
    environment: 'happy-dom',
```

Add (or extend existing `plugins` in test if present):
No change needed — Vitest inherits top-level plugins from the vite config.

---

## package.json changes (sub-steps 2 + 3)

### Change 1: Update `dev` script

Replace:
```json
"dev": "concurrently --kill-others \"npm run dev:server\" \"npm run dev:client\"",
```

With:
```json
"dev": "vite",
```

Rationale: Single Vite process serves both client (Vue) and server (Hono) via
@hono/vite-dev-server. No concurrently needed.

### Change 2: Update `predev` script

The predev script kills port 3000. With unified Vite, the dev server runs on
port 5173 (DEV_SERVER_PORT). The predev script should be updated or removed.
Suggested: remove it entirely or change to kill 5173.

Replace:
```json
"predev": "node -e \"try{process.kill(+(require('child_process').execSync('lsof -ti:3000 2>/dev/null').toString().trim()),9)}catch{}\"",
```

With (kill the Vite port instead):
```json
"predev": "node -e \"try{require('child_process').execSync('fuser -k 5173/tcp 2>/dev/null')}catch{}\"",
```

Or simply remove the predev hook since concurrently is no longer used and port
conflicts are less likely with a single Vite process.

### Change 3: Update `start` script

Replace:
```json
"start": "NODE_ENV=production node dist/server/src/server/start.js",
```

With:
```json
"start": "NODE_ENV=production node dist/server/start.js",
```

Rationale: When building with `vite build --config vite.config.server.ts`,
the output will be in `dist/server/start.js` (not `dist/server/src/server/start.js`
which was the tsc output path).

### Change 4: Update `build` script (sub-step 3)

Replace:
```json
"build": "vite build && tsc -p tsconfig.build.json",
"build:server": "tsc -p tsconfig.build.json",
```

With:
```json
"build": "vite build && vite build --config vite.config.server.ts",
"build:server": "vite build --config vite.config.server.ts",
```

---

## vite.config.server.ts (new file — sub-step 3)

This file needs to be created at the project root:

```ts
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
        // Keep Node built-ins and heavy dependencies external
        /^node:/,
        'better-sqlite3',
        'pino',
        'pino-pretty',
      ],
    },
  },
  ssr: {
    // Externalize packages that use CJS or native bindings
    external: ['hono-pino'],
    noExternal: ['hono'],
  },
});
```

---

## Summary

After these changes are applied:
- `npm run dev` → single `vite` process, serves client + API server together
- `npm run build` → builds client (dist/client/) + server (dist/server/)
- `npm run start` → `node dist/server/start.js`
- Typia AOT transforms apply in dev (via @typia/unplugin Vite plugin) and production (via vite.config.server.ts)

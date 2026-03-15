/// <reference types="vite/client" />
/**
 * Dev entry point for @hono/vite-dev-server.
 *
 * Initializes the server runtime and exports the Hono app as a default export.
 * @hono/vite-dev-server expects a module with a default export that has a
 * fetch() method (i.e., a Hono app instance or similar fetch-based handler).
 *
 * Uses import.meta.hot to persist the runtime across HMR reloads so we don't
 * leak DB connections, orchestrator instances, or event bus subscriptions.
 *
 * Signal handlers are not registered here — the Vite process manages the lifecycle.
 * serveStatic is excluded — Vite serves static files itself in dev mode.
 */

import { init, type ServerRuntime } from './bootstrap.js';
import { createApp } from './app.js';

let runtime: ServerRuntime;

if (import.meta.hot?.data?.runtime) {
  // Reuse existing runtime across HMR reloads — no re-init, no leaked resources
  runtime = import.meta.hot.data.runtime as ServerRuntime;
} else {
  runtime = await init();
}

const app = createApp(runtime);

if (import.meta.hot) {
  // Stash runtime so the next HMR reload can reuse it
  import.meta.hot.data.runtime = runtime;
}

export default app;

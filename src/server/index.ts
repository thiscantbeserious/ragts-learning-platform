/**
 * Server barrel — re-exports from the app factory and bootstrap modules.
 *
 * The full server entry point was split into:
 *   - app.ts      — pure Hono app factory (routes, no side effects)
 *   - bootstrap.ts — DB init, orchestrator, event subscriptions
 *   - start.ts    — production entry (bootstrap + @hono/node-server)
 *   - dev.ts      — Vite dev entry (@hono/vite-dev-server)
 *
 * This file exists for backward compatibility with tooling that references
 * src/server/index. Prefer importing directly from app.ts or bootstrap.ts.
 */

export { createApp } from './app.js';
export type { AppDeps } from './app.js';
export { init } from './bootstrap.js';
export type { ServerRuntime } from './bootstrap.js';

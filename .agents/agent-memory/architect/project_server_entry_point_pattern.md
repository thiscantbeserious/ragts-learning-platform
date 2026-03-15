---
name: Server entry point must be app factory + bootstrap split
description: Hono server needs pure app factory (no side effects) separate from bootstrap — required for Vite dev server HMR compatibility
type: project
---

The server entry point (`src/server/index.ts`) has DB init, orchestrator startup, signal handlers, and service instantiation at module scope. This blocks `@hono/vite-dev-server` integration because HMR re-executes module-scope code, causing DB re-opens, migration re-runs, and signal handler leaks.

**Why:** Discovered as BLOCKER-1 during typia-shared-ddl self-review (2026-03-15). The refactor is non-trivial (~150 lines affected) and was initially buried as a single bullet in Stage 1a.

**How to apply:** The agreed pattern is: `app.ts` (pure factory, accepts deps, returns Hono app), `bootstrap.ts` (DB init, migrations, orchestrator, service instantiation), `start.ts` (production entry), `dev.ts` (Vite dev entry). Any future server architecture changes must preserve this separation. The `serveStatic` import from `@hono/node-server/serve-static` belongs in production path only.

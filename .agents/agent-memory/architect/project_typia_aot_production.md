---
name: Typia requires AOT compilation in ALL build paths
description: Typia validate/assert calls need compile-time transformation — tsc alone cannot build code that uses them, requires Vite or ts-patch
type: project
---

Typia's `typia.validate<T>()` and `typia.assert<T>()` are compile-time macros, not runtime functions. They require AOT transformation via `@typia/unplugin` (Vite) or `@typia/transform` (ts-patch). Plain `tsc` produces code where these calls fail at runtime.

**Why:** The typia-shared-ddl ADR (2026-03-15) initially designed only the dev path (Vite + unplugin) and missed that the production build uses `tsc -p tsconfig.build.json` for the server. Self-review caught this as RISK-3.

**How to apply:** Any ADR introducing Typia must address BOTH dev and production build paths. The chosen approach is to build the server with Vite too (`vite build --config vite.config.server.ts`), replacing `tsc` for server builds. This was added as ADR Decision 5.

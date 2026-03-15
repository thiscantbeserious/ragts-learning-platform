# Architect Self-Review: Typia AOT Validation + Native Dependency Removal

## Summary

I reviewed the ADR, PLAN, and research doc against the actual codebase. The design is broadly sound but has several issues ranging from blockers to gaps that would derail implementation if not addressed before engineers start.

---

## BLOCKER-1: `@hono/vite-dev-server` cannot serve this app -- top-level await + side effects in `index.ts`

**Severity: BLOCKER**

The ADR claims `@hono/vite-dev-server` will replace tsx watch. But `src/server/index.ts` is not a pure Hono app export. It performs:

- Top-level `await` for database initialization (line 61-63)
- Top-level `await` for orchestrator start (line 87)
- `process.on('SIGTERM'/'SIGINT')` signal handler registration (lines 89-98)
- Service instantiation with DB-dependent dependencies (lines 101-119)
- Route registration using those service instances (lines 133-153)
- Conditional `serveStatic` import from `@hono/node-server/serve-static` (line 3)

`@hono/vite-dev-server` expects a module that exports a Hono app (or a function returning one). The current `index.ts` does all initialization at module scope. On every HMR reload, it would:
1. Re-open the database
2. Re-run migrations
3. Re-start the orchestrator
4. Re-register signal handlers (leaking handlers)
5. Import `@hono/node-server/serve-static` which is incompatible with Vite's dev server

This is not a "consideration" -- it is a fundamental restructuring of the server entry point. The PLAN's Stage 1a bullet "Create or update the server entry point for Vite dev mode compatibility" vastly understates the work. This needs a proper sub-design: separate the app factory (routes + middleware) from the bootstrap (DB init, orchestrator, signal handlers).

**Impact on plan:** Stage 1a needs to be split into at least two sub-stages:
1. Refactor `index.ts` into an app factory that accepts dependencies, plus a bootstrap module
2. Wire `@hono/vite-dev-server` to the factory

---

## BLOCKER-2: `node:sqlite` is experimental/unstable in Node 24

**Severity: BLOCKER**

The ADR states node:sqlite is "stable in Node 24." This is incorrect. As of Node 24.0.0 (released 2025-05-06), `node:sqlite` is still behind the `--experimental-sqlite` flag or requires explicit opt-in. The Node.js docs mark it as Stability: 1.1 (Active Development). In Node 22, it requires `--experimental-sqlite`.

This means:
- Every `npm run dev`, `npm run start`, `npm test`, and CI invocation needs the flag
- Vitest workers need the flag passed via `execArgv` or Node options
- The `migrate:v2` script needs the flag
- Production Docker images need it

The ADR presents this as "no native dependencies, npm install just works" but actually trades one friction point (node-gyp) for another (experimental flag everywhere). This must be explicitly acknowledged and designed for, or the decision reconsidered.

**Impact on plan:** If proceeding, every script in `package.json` needs `NODE_OPTIONS=--experimental-sqlite` or equivalent. Stage 0b/0c need to document this. The "consequences" section needs updating.

---

## BLOCKER-3: wasm-pack `--target nodejs` produces CJS -- and `--target web` produces async init

**Severity: BLOCKER**

The Dockerfile (line 7) shows the current build uses `--target nodejs`, which is why the output is CJS (`exports.Vt`, `require('fs')`). The ADR's Decision 2 says "change wasm-pack to output ESM" but the available wasm-pack targets are:

- `--target nodejs`: CJS output, sync `require('fs')` for WASM loading. **This is what produces the current output.**
- `--target web`: ESM output, but uses `async function init()` -- requires calling `await init()` before any exports work. This breaks the current sync init pattern in `index.ts` line 44 (`await import('./pkg/vt_wasm.js')` then sync `mod.create()`).
- `--target bundler`: ESM output, but expects a bundler (Webpack/Vite) to handle the WASM import. May work with Vite's WASM handling but the init pattern is completely different.
- `--target deno`: Not relevant.

None of these produce "ESM output that works as a drop-in replacement." The engineer needs to understand that switching targets changes the init API, not just the module syntax. The PLAN says "verify which matches the current sync init pattern" in considerations, but this is bigger than a consideration -- it is the core technical challenge of Stage 0a.

**Impact on plan:** Stage 0a needs explicit investigation of the `--target web` async init pattern and how to adapt `index.ts`'s `initVt()` function. The `index.ts` wrapper already uses `await import()` + async `initVt()`, so `--target web` may actually work, but the init ceremony is different (you call `init(wasmBytes)` first). This needs to be spelled out.

---

## RISK-1: `db.transaction()` wrapper complexity is understated

**Severity: RISK**

The ADR says the compat wrapper provides `.transaction(fn)` matching better-sqlite3's API. But better-sqlite3's `.transaction()` returns a *reusable callable transaction function* -- you call `db.transaction(fn)` once to get a wrapper, then call that wrapper repeatedly. See `sqlite_session_impl.ts` line 83:

```ts
this.completeProcessingTxn = db.transaction((session: ProcessedSession) => { ... });
```

And `migrations/004_pipeline_jobs_events.ts` line 104:

```ts
const runMigration = db.transaction(() => { ... });
runMigration();
```

The wrapper must return a function with the same signature as `fn` that wraps the call in BEGIN/COMMIT/ROLLBACK. This is not trivial -- it needs to handle:
- Nested transactions (better-sqlite3 uses savepoints)
- The `.deferred`, `.immediate`, `.exclusive` transaction mode variants
- Error rollback with proper re-throw
- The return value passthrough

The PLAN Stage 0b lists this as a single checkbox. It should be a multi-step task with explicit test cases for the reusable-function pattern, error rollback, and return value passthrough.

---

## RISK-2: `db.pragma()` return value differences

**Severity: RISK**

better-sqlite3's `db.pragma('table_info(sessions)')` returns an array of objects. The codebase uses this in migrations 002 (line 26), 003 (lines 37, 45), and 004 test (line 42):

```ts
const sessionColumns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
```

With `node:sqlite`, the equivalent `db.prepare("PRAGMA table_info(sessions)").all()` returns the same shape, but the wrapper must handle both read-pragmas (return value) and write-pragmas (`PRAGMA journal_mode = WAL`) which may return different shapes. The PLAN's Open Question #1 mentions this but doesn't scope it -- the engineer needs to verify all 7 distinct pragma calls + 3 pragma-as-query calls.

---

## RISK-3: Production build path has no Typia story

**Severity: RISK**

The current production build is:
```
"build": "vite build && tsc -p tsconfig.build.json"
"start": "NODE_ENV=production node dist/server/src/server/start.js"
```

The server is compiled with plain `tsc`, not Vite. Typia requires AOT compilation via its unplugin. If `@typia/unplugin` is only in the Vite config, production server builds via `tsc` will NOT have Typia transforms applied. The `typia.validate<T>()` calls will fail at runtime because they need compile-time transformation.

The PLAN never addresses how the production build gets Typia transforms. Options:
1. Build the server with Vite too (changes the whole build pipeline)
2. Use `typia generate` as a pre-build step (different approach than unplugin)
3. Use a tsc plugin (`ts-patch` + `@typia/transform`)

This is a **gap in the ADR** -- it only considers the dev experience, not production.

---

## RISK-4: `@hono/typia-validator` may not exist or may be unstable

**Severity: RISK**

The PLAN Stage 2b says "Install `@hono/typia-validator` as a dependency." I cannot verify this package exists on npm from the codebase alone, but the Hono ecosystem middleware packages follow the `@hono/` namespace pattern. If this package doesn't exist or is alpha-quality, the engineer needs a fallback plan (write a custom Hono middleware using `typia.validate()` directly -- which is straightforward but more work).

---

## GAP-1: Missing files from better-sqlite3 grep

**Severity: GAP**

The ADR claims "9 source files, 2 test files." The actual grep shows:

**Source files importing better-sqlite3 (10, not 9):**
1. `sqlite_database_impl.ts` (value import)
2. `sqlite_session_impl.ts` (type import)
3. `sqlite_section_impl.ts` (type import)
4. `sqlite_job_queue_impl.ts` (type import)
5. `sqlite_event_log_impl.ts` (type import)
6. `migrations/002_sections.ts` (type import)
7. `migrations/003_unified_snapshot.ts` (type import)
8. `migrations/004_pipeline_jobs_events.ts` (type import)
9. `jobs/job_queue_adapter.ts` (comment reference only -- not an import)
10. `jobs/sqlite_job_queue_impl.ts` (comment + type import)

**Test files importing better-sqlite3 (3, not 2):**
1. `migrations/004_pipeline_jobs_events.test.ts` (value import)
2. `tests/integration/db/sqlite_event_log_impl.test.ts` (value import)
3. `tests/integration/db/sqlite_session_complete_processing.test.ts` (value import)

The PLAN Stage 0c lists only some of these. Missing from the PLAN's explicit checklist:
- `src/server/events/sqlite_event_log_impl.ts`
- `src/server/jobs/sqlite_job_queue_impl.ts`
- `tests/integration/db/sqlite_session_complete_processing.test.ts`

---

## GAP-2: `migrate:v2` script and tsx dependency

**Severity: GAP**

The PLAN Stage 1b mentions `tsx` is used by `migrate:v2` as a consideration. But it never resolves this. If tsx is removed (Stage 1b checkbox), `npm run migrate:v2` breaks. The migration script uses `SqliteDatabaseImpl` directly -- once that uses `node:sqlite`, the script also needs the experimental flag.

Options the PLAN should specify:
1. Keep tsx for migrate:v2 only (then tsx stays in devDeps -- contradicts the "remove tsx" goal)
2. Switch migrate:v2 to `node --experimental-sqlite --loader tsx` or just plain `node` with the built output
3. Add a build step for the migration script

---

## GAP-3: Production server entry point with `@hono/node-server/serve-static`

**Severity: GAP**

`src/server/index.ts` line 3 imports `serveStatic` from `@hono/node-server/serve-static`. This is a Node.js-specific import. If the server runs inside `@hono/vite-dev-server` during development, this import will either:
- Fail (if `@hono/node-server` is externalized)
- Work but be pointless (Vite serves static files itself)

The PLAN doesn't address this. The production code path (`if (config.nodeEnv === 'production')`) conditionally uses it, so it might be fine if the import is tree-shaken or the module is available. But this interaction needs explicit verification.

---

## GAP-4: No Stage 0e referenced but Stage 1a depends on it

**Severity: INCONSISTENCY**

The PLAN Stage 1a says "Depends on: Stage 0e" but there is no Stage 0e defined anywhere in the PLAN. The dependency graph in the Mermaid diagram shows `S0d --> S1a`, which makes Stage 1a depend on Stage 0d. The text and the diagram disagree.

---

## GAP-5: `tsconfig.build.json` includes `src/server/**/*` and `src/shared/**/*`

**Severity: GAP**

Typia tags added to `src/shared/types/*.ts` in Stage 2a will be compiled by `tsc` during `npm run build`. If these types use Typia-specific syntax that tsc doesn't understand natively (e.g., `typia.validate<T>()` calls or Typia's custom JSDoc tags), the build may break. The PLAN says "tags are compile-time annotations, no runtime effect" -- but Typia tags using intersection types like `string & tags.Format<"uuid">` DO affect the TypeScript type surface and tsc will need the type definitions available.

The shared types themselves are probably fine (JSDoc tags or phantom intersection types are valid TS). But any file in `src/server/routes/` that calls `typia.validate()` or uses `@hono/typia-validator` middleware will contain Typia function calls that need AOT transformation. If `tsc` compiles those without the transform, the runtime calls will fail.

---

## INCONSISTENCY-1: ADR says "3-4 line changes" for vt-wasm CJS, reality is more

**Severity: INCONSISTENCY**

The ADR Section "vt-wasm CJS patterns (3 lines to change)" lists:
- Line 79: `exports.Vt = Vt;`
- Line 92: `exports.create = create;`
- Line 251: `const wasmBytes = require('fs').readFileSync(wasmPath);`

But the actual `pkg/vt_wasm.js` also has:
- Line 250: `const wasmPath = \`\${__dirname}/vt_wasm_bg.wasm\`;` -- uses `__dirname` (CJS global, not available in ESM)
- Line 252-253: `new WebAssembly.Module(wasmBytes)` + `new WebAssembly.Instance(...)` -- sync WASM instantiation that may need to become async with `--target web`
- `pkg/package.json` has no `"type": "module"` and uses `"main"` not `"exports"`

This is moot if Decision 2 (rebuild with wasm-pack ESM target) is followed, since the output changes entirely. But the ADR's Option A description is inaccurate, which matters if the engineer falls back to Option A.

---

## INCONSISTENCY-2: Route list mismatch between ADR and codebase

**Severity: INCONSISTENCY (minor)**

The ADR lists 6 route files but misses that `events.ts` handles `GET /api/events` (not `GET /api/sessions/:id/events` -- that's the SSE route in `sse.ts`). Looking at `index.ts`:
- `GET /api/sessions/:id/events` -> `sse.ts` (handleSseEvents)
- `GET /api/events` -> `events.ts` (handleGetEventLog)

The PLAN Stage 2b lists "Event routes (GET /api/sessions/:id/events)" with "validate path param + query params" -- but this is the SSE endpoint, not a JSON endpoint. Adding Typia validation middleware to an SSE stream endpoint is not the same as validating a JSON route. The actual `events.ts` route (`GET /api/events`) with query param `sessionId` is what should be validated.

---

## Summary Table

| # | Severity | Issue | Impact |
|---|----------|-------|--------|
| B1 | BLOCKER | `index.ts` not compatible with `@hono/vite-dev-server` | Stage 1a needs redesign |
| B2 | BLOCKER | `node:sqlite` requires `--experimental-sqlite` in Node 24 | All stages affected |
| B3 | BLOCKER | wasm-pack targets don't produce drop-in ESM | Stage 0a needs redesign |
| R1 | RISK | `db.transaction()` wrapper complexity understated | Stage 0b may take 2-3x longer |
| R2 | RISK | `db.pragma()` return value differences need scoping | Stage 0b |
| R3 | RISK | Production build has no Typia AOT story | Stage 2a/2b broken in prod |
| R4 | RISK | `@hono/typia-validator` package existence unverified | Stage 2b |
| G1 | GAP | File count and PLAN checklist incomplete | Stage 0c |
| G2 | GAP | `migrate:v2` + tsx removal unresolved | Stage 1b |
| G3 | GAP | `serveStatic` import in dev mode | Stage 1a |
| G4 | GAP | No Stage 0e exists but Stage 1a references it | PLAN |
| G5 | GAP | `tsc` production build vs Typia transforms | Stage 2a/2b |
| I1 | INCONSISTENCY | vt-wasm "3 lines" undercount | ADR accuracy |
| I2 | INCONSISTENCY | Route/endpoint mismatch (events vs SSE) | Stage 2b scope |

---

## Recommendation

The three blockers must be resolved before implementation. Specifically:

1. **B2 (node:sqlite experimental)** -- Reassess whether this migration is worth it today, or wait for Node 26 where `node:sqlite` may be stable. If proceeding, document the `--experimental-sqlite` requirement everywhere and accept the trade-off.

2. **B1 (index.ts restructuring)** -- Add a pre-stage (Stage 0.5 or expand Stage 1a) that refactors `index.ts` into an app factory. This is a non-trivial refactor that changes ~150 lines and affects every route registration. It should be its own reviewed stage.

3. **B3 (wasm-pack ESM target)** -- The Stage 0a description needs to be honest that this is an investigation + potential architecture change to the WASM init pattern, not just "change a flag in build.sh." The `--target web` async init pattern needs explicit design.

4. **R3 (production Typia)** -- The ADR needs a fifth decision: how does the production server get Typia transforms? This is arguably a blocker for Stage 2.

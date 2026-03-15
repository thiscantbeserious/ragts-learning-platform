# ADR: Typia AOT Validation + Native Dependency Removal

## Status
Proposed

## Context

Erika's runtime has three compounding friction points:

1. **better-sqlite3** is a native C++ addon requiring node-gyp. It fails on clean machines, blocks containerization, and ties the project to platform-specific binaries.
2. **packages/vt-wasm/pkg/vt_wasm.js** uses CJS (`exports.Vt`, `require('fs')`), conflicting with the project's ESM-first (`"type": "module"`) pipeline.
3. **tsx watch** runs the server outside Vite's plugin pipeline, so `@typia/unplugin` cannot apply AOT transforms to server code. This blocks type-driven validation middleware on Hono routes.

These problems are coupled. Typia validation requires AOT compilation (Stage 2). AOT compilation requires the Vite dev-server pipeline (Stage 1). The Vite pipeline requires removing native dependency friction first (Stage 0). The stages are strictly ordered.

### Codebase shape (investigation findings)

**better-sqlite3 usage (9 source files, 2 test files):**
- 1 value import: `sqlite_database_impl.ts` (`import Database from 'better-sqlite3'`)
- 8 type-only imports: `type Database` across impls and migrations
- API surface used: `new Database(path)`, `db.prepare()`, `db.exec()`, `db.pragma()`, `db.transaction()`, `db.close()`, `db.open`, `stmt.run()`, `stmt.get()`, `stmt.all()`, `result.changes`, `result.lastInsertRowid`
- 2 test files: `004_pipeline_jobs_events.test.ts`, `tests/integration/db/sqlite_event_log_impl.test.ts`, `tests/integration/db/sqlite_session_complete_processing.test.ts`

**node:sqlite `DatabaseSync` API gaps vs better-sqlite3:**
- No `.pragma()` method -- must use `db.exec("PRAGMA key = value")` or `db.prepare("PRAGMA key").get()`
- No `.transaction()` helper -- must wrap with `BEGIN`/`COMMIT`/`ROLLBACK` manually or build a helper
- No `.open` property -- need alternate guard for double-close safety
- `StatementSync.run()` returns `StatementResultingChanges` (same shape: `changes`, `lastInsertRowid`)
- `StatementSync.get()` / `.all()` return plain objects (same as better-sqlite3)
- Constructor: `new DatabaseSync(path)` (different import, similar signature)

**vt-wasm CJS patterns (3 lines to change in pkg/vt_wasm.js):**
- Line 79: `exports.Vt = Vt;` -- change to `export { Vt };` or `export` on class
- Line 92: `exports.create = create;` -- change to `export { create };`
- Line 251: `const wasmBytes = require('fs').readFileSync(wasmPath);` -- change to `import { readFileSync } from 'node:fs';`
- Also need `__dirname` replacement with `import.meta.url` for WASM path resolution
- `packages/vt-wasm/pkg/package.json` needs `"type": "module"` and `"main"` to `"exports"`

**Route validation surface (6 route files):**
- `upload.ts` -- accepts multipart form data; delegates to UploadService. Primary validation target.
- `sessions.ts` -- GET list, GET by ID, DELETE by ID, POST redetect. Path params only.
- `events.ts` -- GET with query param `sessionId`. Minimal validation needed.
- `status.ts` -- GET with path param `id`. Minimal validation needed.
- `retry.ts` -- POST with path param `id`. Minimal validation needed.
- `sse.ts` -- GET with path param `id` + `Last-Event-ID` header. Minimal validation needed.

**Shared types (7 files in `src/shared/types/`):**
- `session.ts` -- `Session`, `SessionCreate` (API boundary types)
- `asciicast.ts` -- `AsciicastHeader`, `AsciicastEvent`, `ParsedEvent`, `Marker`, `AsciicastFile`, `ValidationResult`
- `pipeline.ts` -- `DetectionStatus`, `PipelineEvent`, `PipelineStage` (enum)
- `section.ts` -- `Section` (API response shape)
- `api.ts` -- `SessionDetailResponse`, `SessionStatusResponse` (API response shapes)
- `errors.ts` -- `ServiceError` class, `ServiceErrorCode` type
- `index.ts` -- barrel re-exports

## Options Considered

### Decision 1: node:sqlite API adaptation strategy

#### Option A: Thin compatibility wrapper (CHOSEN)

Create a `src/server/db/sqlite/compat.ts` module that wraps `node:sqlite`'s `DatabaseSync` with an API matching better-sqlite3's surface. The wrapper provides `.pragma()`, `.transaction()`, and `.open`. All downstream consumers keep their current code unchanged -- only the wrapper and the database impl's constructor change.

- Pros: Minimal diff across 9+ files. Type-safe boundary. Migration and impl files stay untouched. Easy to verify correctness. Fits the existing adapter pattern (`SessionAdapter` → `SqliteSessionImpl`).
- Cons: Extra abstraction layer. But: the project already uses the adapter pattern everywhere -- this is consistent, not new debt.

#### Option B: Direct migration

Replace better-sqlite3 API calls directly with node:sqlite equivalents across all files.

- Pros: No abstraction layer. Developers see the real API.
- Cons: Touches 9+ files for mechanical changes. If node:sqlite API changes, every file must be updated again.

**Decision: Option A.** The project already isolates the DB driver behind adapters (`SessionAdapter` → `SqliteSessionImpl`). A thin compat wrapper is the same pattern applied to the driver itself. It minimizes the diff, keeps downstream files untouched, and makes future driver swaps (e.g., libSQL) trivial.

### Decision 2: vt-wasm ESM conversion approach

#### Option A: Modify pkg output directly

Edit `packages/vt-wasm/pkg/vt_wasm.js` in-place to use ESM syntax.

- Pros: 3-4 line changes. No toolchain needed.
- Cons: If `build.sh` is re-run, the changes are overwritten. Creates invisible tech debt.

#### Option B: Modify wasm-pack build to output ESM (CHOSEN)

Change `build.sh` / `Cargo.toml` to configure wasm-pack for `--target web` or `--target bundler` with ESM output.

- Pros: Changes persist across rebuilds. Fixes the problem at the source. No manual patching.
- Cons: Requires Rust toolchain. Different wasm-pack targets produce different init patterns. Engineer must verify the output matches expectations.

**Decision: Option B.** If we're removing native friction, do it properly. A manual patch that gets overwritten on rebuild is tech debt from day one. The build script should produce ESM output natively.

### Decision 3: Dev server strategy

#### Option A: @hono/vite-dev-server (CHOSEN)

Use `@hono/vite-dev-server` as a Vite plugin. The server entry point runs inside Vite's transform pipeline, getting Typia AOT transforms automatically. HMR for server code. Single Vite process for both client and server.

- Pros: First-party Hono integration. Proven approach. Enables `@typia/unplugin` for server code. Research already benchmarked ~50ms overhead vs tsx.
- Cons: Requires adapting `start.ts` for Vite dev mode vs production mode. May need careful handling of `@hono/node-server` vs Vite's built-in server.

#### Option B: Custom Vite SSR setup

Use Vite's generic SSR support (`vite.ssrLoadModule()`) to load the Hono app.

- Pros: More control over the SSR pipeline.
- Cons: More boilerplate. No Hono-specific integration. Re-inventing what `@hono/vite-dev-server` already provides.

**Decision: Option A.** `@hono/vite-dev-server` is purpose-built for this use case. The proof-of-concept config reference exists on the research branch.

### Decision 4: Typia validation scope for Stage 2

All routes get validation, not just upload. This establishes the pattern across the entire API surface so future routes just copy it. The scope:

1. Adding Typia tags to all shared types used at API boundaries (`AsciicastHeader`, `Session`, `Section`, API response shapes)
2. **Upload route** — validate parsed asciicast content before DB write
3. **Read routes** (sessions list, session detail, events, status) — validate path params and query params
4. **Write routes** (redetect, retry, delete) — validate path params
5. **Response validation** — validate API responses before sending to client (guards against DB corruption surfacing as malformed JSON)

This means every boundary is guarded: input validation on the way in, response validation on the way out. Future routes inherit the pattern — just add Typia tags to the interface and wire the middleware.

### Decision 5: Production server build with Vite (not tsc)

The current production build uses `tsc -p tsconfig.build.json` for the server. Typia requires AOT compilation via `@typia/unplugin`. If `tsc` builds the server, Typia transforms won't apply — `typia.validate()` calls fail at runtime.

**Decision: Build the server with Vite too.** Same pipeline for dev and production. `vite build` for client, `vite build --config vite.config.server.ts` for server. No ts-patch, no dual build systems.

### Decision 6: Server entry point restructuring

`src/server/index.ts` currently performs DB init, orchestrator startup, signal handlers, service instantiation, and route registration at module scope. `@hono/vite-dev-server` needs a pure app export — on HMR reload, module-scope side effects would re-open the DB, re-run migrations, and leak signal handlers.

**Decision: Split into app factory + bootstrap.** `app.ts` is a pure function accepting dependencies, returning a Hono app. `start.ts` handles production bootstrap. `dev.ts` is the Vite dev entry point. Standard Hono + Vite pattern.

## Consequences

### What becomes easier
- **Onboarding:** `npm install` just works -- no node-gyp, no platform binaries
- **Containerization:** Plain Node 24 image, no build tools needed
- **Adding validation:** Tag an interface, done. No schema files to maintain
- **Dev experience:** Single Vite process, unified plugin pipeline, server HMR

### What becomes harder
- **node:sqlite is newer:** Less community documentation than better-sqlite3. But the API is simpler and stable in Node 24.
- **vt-wasm rebuild:** If the WASM package is rebuilt, the ESM patch must be re-applied (or the build script updated).
- **Typia learning curve:** Developers must learn Typia tag syntax. But it is JSDoc-based and well-documented.

### Follow-ups to scope for later
- Client-side validation using shared Typia-tagged types
- OpenAPI spec generation from Typia-annotated interfaces
- Client composable validation (validate API responses before storing in reactive refs)

## Decision History

1. **Compatibility wrapper over direct migration** for node:sqlite -- fits the existing adapter pattern, minimal diff, future driver swaps are trivial.
2. **wasm-pack ESM build** over in-place patch -- fixes the problem at the source, changes persist across rebuilds.
3. **@hono/vite-dev-server** over custom SSR -- purpose-built, benchmarked, first-party Hono support.
4. **All routes validated** -- establishes the pattern across the entire API surface so future routes just copy it. Input validation in, response validation out.
5. **Vite for production server build** -- same pipeline as dev, ensures Typia AOT transforms apply. No ts-patch.
6. **App factory + bootstrap split** -- separates pure Hono app (routes + middleware) from initialization (DB, orchestrator, signals). Required for @hono/vite-dev-server HMR compatibility.

# Requirements: Typia AOT Validation + Native Dependency Removal

## Problem Statement

Erika's runtime has three compounding problems that must be resolved together:

1. `better-sqlite3` is a native C++ addon requiring node-gyp, platform-specific compilation, and ABI-matched binaries. It fails on clean machines, in Docker containers, and in CI environments that lack a C++ toolchain.
2. `packages/vt-wasm/` exports CJS only, creating ESM pipeline conflicts in Vite and requiring special-case handling in SSR contexts.
3. The dev server runs via `tsx watch`, outside Vite's plugin pipeline. Typia's `@typia/unplugin` cannot apply AOT compilation to server code in this setup, making it impossible to add type-driven validation middleware to Hono routes without incurring runtime reflection overhead or scattering manual `typia.validate()` calls.

These three problems are coupled. Validation cannot be migrated cleanly without the pipeline switch; the pipeline switch depends on the native deps being gone. The stages must be completed in order.

## Desired Outcome

After implementation:

- `npm install` and `npm run build` complete on any Node 24 environment without native compilation.
- A single `npm run dev` command starts both server and client through Vite's plugin pipeline with HMR on both sides.
- Typia's AOT compilation applies to server and client code uniformly.
- Every Hono route that accepts external input validates it against the corresponding TypeScript interface before the handler executes; malformed payloads return a structured 4xx error without touching business logic or database writes.
- Validation constraints live exclusively on `src/shared/types/` interfaces. There is no parallel schema definition anywhere in the codebase.
- All all existing tests pass without modification.

## Scope

### In Scope

- **Stage 0 — Native dependency removal**
  - Replace `better-sqlite3` with `node:sqlite` (Node 24 built-in) in all server database code
  - Convert `packages/vt-wasm/` from CJS to ESM exports
  - Remove `better-sqlite3` from `package.json` dependencies
  - Verify `npm install` emits no node-gyp invocation

- **Stage 1 — Dev pipeline switch**
  - Replace `tsx watch` backend dev script with `@hono/vite-dev-server`
  - Integrate `@typia/unplugin` into the Vite config so the transform applies to both server and client entry points
  - Preserve HMR, API proxying, and existing `npm run dev` UX
  - Update `package.json` scripts and any affected config files

- **Stage 2 — Schema migration**
  - Add Typia validation tags to TypeScript interfaces in `src/shared/types/` for upload payloads (minimum: the upload endpoint's request body type)
  - Implement Hono middleware that calls the Typia-generated validator and returns a structured 4xx error on failure
  - Wire the middleware to the upload route and any other routes that accept external input
  - No parallel schema files; constraints live only on the interfaces

### Out of Scope

- Runtime validation of Vue component props
- OpenAPI spec generation from Typia-annotated interfaces
- Client-side form validation driven by shared type tags
- Database schema migrations or new tables
- Any user-facing feature, UI change, or design system modification
- PostgreSQL adapter changes
- Performance benchmarking beyond confirming no regression

## Acceptance Criteria

### Stage 0 — Native dependency removal

- [ ] `package.json` does not list `better-sqlite3` as a dependency
- [ ] `npm install` on a clean directory produces no `node-gyp` or `node-pre-gyp` output and exits 0
- [ ] `packages/vt-wasm/` exports ESM (has `"type": "module"` or exports via `"exports"` with ESM condition); no CJS-only entrypoint remains
- [ ] `npx vitest run` reports all tests passing, 0 failures
- [ ] The server starts with `node:sqlite` and the existing SQLite database file opens without error

### Stage 1 — Dev pipeline switch

- [ ] `npm run dev` starts both frontend (port 5173) and backend (port 3000) through a single Vite invocation
- [ ] A change to a file in `src/server/` triggers a hot reload without requiring a manual process restart
- [ ] `@typia/unplugin` is listed in the Vite config's plugins array and transforms are confirmed active for both server and client entry points (e.g., via a logged build artifact or plugin diagnostic)
- [ ] The `/api/*` proxy from the frontend dev server to the backend continues to work
- [ ] `npm run build` produces a production bundle with no errors
- [ ] `npx vitest run` reports all tests passing, 0 failures

### Stage 2 — Schema migration

- [ ] The upload route (`POST /api/upload`) rejects a request with a missing required field with a 4xx status code and a JSON body containing a machine-readable error (field name and constraint that failed)
- [ ] The upload route (`POST /api/upload`) rejects a request with a field of the wrong type with a 4xx status code before any database write occurs
- [ ] A valid upload request continues to succeed with the same response as before migration
- [ ] Validation constraints are expressed as Typia tags on interfaces in `src/shared/types/`; no Zod schema, JSON Schema file, or io-ts codec exists for the same types
- [ ] No Hono route handler receives request data that has not passed validation middleware; this is verifiable by code inspection (middleware is registered on the route, not inside the handler)
- [ ] `npx vitest run` reports all tests passing, 0 failures

### Cross-stage (non-functional)

- [ ] `npm ci --omit=dev` followed by `npm run build` completes on a plain Node 24 Docker image with no missing native module error
- [ ] CI build job passes on the standard runner image without pre-installing `python`, `make`, or `gcc`
- [ ] No test file is modified, skipped, or disabled to accommodate the migration

## Constraints

- **Stage ordering is a hard dependency.** Stage 1 cannot begin until Stage 0's acceptance criteria pass. Stage 2 cannot begin until Stage 1's acceptance criteria pass.
- **Node 22.5+ required** for `node:sqlite`. The project targets Node 24 LTS (`.nvmrc`) and documents Node 22.12+ support — this is already satisfied.
- **Typia requires AOT compilation.** It cannot operate as a pure runtime library. The Vite plugin pipeline (Stage 1) must be in place before any Typia validation code is authored in Stage 2.
- **Existing SQLite data compatibility.** The `node:sqlite` driver must produce the same query behavior and transaction semantics as `better-sqlite3`. Standard SQLite `.db` files created by either driver are interchangeable.
- **`@hono/vite-dev-server` must support existing proxy config.** The frontend dev experience (HMR, `/api` proxying) must not regress.
- **all existing tests are the regression gate.** No test may be altered; if a test fails, the migration adapts.
- **No frontend or design system changes.** This cycle operates in `src/server/`, `src/shared/`, `packages/`, and build configuration only.

## Context

- Vision approved: `.state/feat/typia-shared-ddl/VISION_STEP.md`
- Stories approved: `.state/feat/typia-shared-ddl/STORIES.md`
- Branch: `feat/typia-shared-ddl`
- Current test count: all existing tests across 29 files (per CLAUDE.md)
- Node target: 24 LTS (`.nvmrc`); Node 22.12+ also supported
- `node:sqlite` ships in Node 22.5+ and is stable in Node 24

---
**Sign-off:** Approved by user

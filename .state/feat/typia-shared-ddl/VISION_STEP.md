# Vision: Single Source of Truth

> Erika's TypeScript interfaces become the schema, the validator, and the documentation -- eliminating the gap between what the type system promises and what the runtime enforces.

## Core Intent

Erika currently operates on a trust-based type system. Interfaces in `src/shared/types/` describe the shape of sessions, sections, and API payloads, but nothing enforces those shapes at runtime. Data crosses three boundaries -- upload API, SQLite storage, client composables -- and at each boundary, the developer simply trusts that the shape is correct. When it is not, the failure surfaces far from its origin: a malformed upload silently corrupts a session row; a missing field crashes a Vue component three clicks deep.

The intent is to close that gap. Not by adding a second schema language (Zod, io-ts, JSON Schema) that must be kept in sync with the interfaces, but by making the interfaces themselves the runtime validators. Write the type once. Validate everywhere. No drift.

This is also about removing friction from the development environment itself. Two native dependencies -- `better-sqlite3` and the CJS-only `vt-wasm` package -- create build complexity, SSR compatibility issues, and Vite plugin pipeline limitations that block the validation migration. Removing those blockers is not a side quest; it is prerequisite infrastructure.

## Current State

**Type system:** TypeScript interfaces in `src/shared/types/` define domain shapes (sessions, sections, asciicast events, API responses). These are compile-time only. No runtime validation exists anywhere in the stack. Upload payloads, database rows, and API responses are all `as`-cast or structurally assumed.

**Database driver:** `better-sqlite3` is a native C++ addon. It requires node-gyp, platform-specific compilation, and creates SSR/bundling friction with Vite. Node 22.5+ ships `node:sqlite` as a built-in module -- synchronous API, zero dependencies, ESM-native.

**WASM package:** `packages/vt-wasm/` currently exports CJS. This conflicts with Vite's ESM-first pipeline and requires special handling in SSR contexts.

**Dev server:** The backend runs via `tsx watch`, which operates outside Vite's plugin pipeline. Any Vite plugin (like Typia's unplugin) only applies to client code. Server code cannot benefit from AOT compilation without switching to a Vite-based dev server.

**The gap:** Every boundary in the system is unguarded. The toolchain makes it difficult to add guards without also fixing the build pipeline. These are coupled problems -- solving validation without solving the pipeline means manual `typia.validate()` calls scattered through server code instead of automatic middleware integration.

## Design Direction

This is infrastructure. There is no visual change. The "design" here is the developer experience.

**Emotional target:** Confidence. A developer working on Erika should feel that the type system has their back -- not just in the editor, but at every boundary where data enters or leaves. When they define an interface, they should trust that it is enforced. When they add a validation tag, they should see it take effect immediately in both server and client.

**Interaction pattern:** Invisible when working. Loud when something is wrong. Validation errors should surface at the boundary where bad data arrives, with clear messages that point to the specific field and constraint that failed. They should never propagate silently into downstream logic.

**Philosophical stance:** The type is the schema. There is no schema file, no codegen step, no second definition to maintain. If a developer changes an interface, the validation changes with it. This is not a feature of Typia -- it is the reason Typia was chosen.

## Key Interactions

### 1. Defining a validated type

A developer adds validation constraints directly to an existing TypeScript interface using JSDoc-style tags. No new file, no schema definition language, no build step to remember. The interface they already maintain becomes the single source of truth for both compile-time checking and runtime validation.

### 2. Guarding an API boundary

When a request hits a Hono route, validation middleware intercepts it before the handler executes. If the payload does not match the interface, the request is rejected with a structured error response. The handler never sees invalid data. The developer adds one middleware call to the route definition -- they do not write parsing logic, try/catch blocks, or manual field checks.

### 3. Running the dev server

A single command starts both server and client through Vite's plugin pipeline. Typia's AOT compilation applies to all code -- server and client -- through the same mechanism. There is no separate build step, no "remember to also run X." Hot reload works for both sides. The developer does not think about which pipeline their code runs through.

### 4. Installing and building

`npm install` completes without native compilation. No node-gyp, no Python dependency, no platform-specific binary downloads. The project builds identically on macOS, Linux, and CI. A new contributor clones, installs, and runs without encountering a C++ compiler error.

### 5. Catching a regression

A developer changes a field name in a shared interface. TypeScript catches the compile-time references. But because the same interface drives runtime validation, any stored data or external input using the old field name is also caught -- at the API boundary, not three layers deep in a component that assumed the field existed.

## Opportunities

**Contract-driven API documentation.** Because the TypeScript interfaces carry validation metadata (format, range, pattern constraints), it becomes possible in future cycles to generate OpenAPI specs directly from the source types. No separate spec file to maintain.

**Client-side form validation from shared types.** The same validation tags that guard the API can eventually drive client-side validation in upload forms or future curation interfaces. One definition, validated on both sides of the wire.

**Progressive strictness.** The migration does not require validating everything at once. Interfaces can gain validation tags incrementally -- start with upload payloads (the highest-risk boundary), then expand to database reads, then to client composables. Each addition is a single-line tag change, not a schema rewrite.

## Constraints

- **Node 22.5+ required** for `node:sqlite`. The project already targets Node 24 LTS (per `.nvmrc`), and documents Node 22.12+ support, so this is compatible.
- **Existing SQLite data must remain accessible.** The driver change must not alter query behavior, transaction semantics, or migration compatibility. Data files created by `better-sqlite3` are standard SQLite databases and are fully compatible.
- **`@hono/vite-dev-server` must support the existing proxy and middleware configuration.** The dev server switch must not break the frontend dev experience (HMR, API proxying).
- **Typia requires AOT compilation.** It cannot run as a pure runtime library. This is why the Vite plugin pipeline must be in place before the schema migration begins -- the stages are ordered by dependency, not preference.
- **all existing tests must continue to pass.** No test is disabled, skipped, or modified to accommodate the migration. If a test fails, the migration adapts, not the test.
- **Design system and frontend are untouched.** This cycle operates entirely in `src/server/`, `src/shared/`, `packages/`, and build configuration.

## Out of Scope

- Runtime validation of client-side component props (future cycle)
- OpenAPI spec generation from Typia-annotated interfaces (future cycle)
- Database schema migrations or new tables
- Any user-facing feature, UI change, or design system modification
- PostgreSQL adapter changes (the `node:sqlite` migration is SQLite-specific; the adapter pattern isolates it)
- Performance benchmarking beyond confirming no regression (Typia's AOT compilation produces zero-overhead validators; this is established, not something to re-prove)

## Success Criteria

- **Zero native dependencies in the install chain.** `npm install` on a clean machine completes without invoking node-gyp or downloading platform-specific binaries.
- **Single dev command.** One `vite` invocation runs both server and client with full HMR, full plugin pipeline, and API proxying.
- **Every API route validates its input.** No Hono handler receives unvalidated request data. Malformed uploads return structured error responses before reaching business logic.
- **No type duplication.** Validation constraints live on the TypeScript interfaces in `src/shared/types/`. There is no parallel schema definition anywhere in the codebase.
- **All all existing tests pass without modification.** The test suite is the regression gate. If it passes, the migration is behaviorally equivalent.
- **The developer never thinks about validation plumbing.** Adding a new validated field is: add the field to the interface, add a tag, done. No wiring, no registration, no build step.

---
**Sign-off:** Pending

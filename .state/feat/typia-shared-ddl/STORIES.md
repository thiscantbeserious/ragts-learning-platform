# Stories: Typia AOT Validation + Native Dependency Removal

> Migrate the dev pipeline and shared types to eliminate native build friction and enforce runtime validation at every API boundary.

## Stories

### Developer working on Erika

As a developer working on Erika, I want validation constraints to live directly on the TypeScript interfaces I already maintain so that I never have to keep a separate schema definition in sync with the type system.

Acceptance signal: Adding a validation tag to an interface in `src/shared/types/` causes the corresponding API route to reject payloads that violate the constraint -- without any additional wiring, registration, or build step.

---

As a developer working on Erika, I want a single `vite` command to start both server and client with full hot reload so that I do not have to think about which pipeline my code runs through or remember a separate backend watch command.

Acceptance signal: `npm run dev` starts both sides through the same Vite plugin pipeline; a change to a server file triggers hot reload without restarting the process manually.

---

As a developer working on Erika, I want Typia's AOT compilation to apply to server code as well as client code so that validation middleware is generated at build time rather than executed as slow runtime reflection.

Acceptance signal: The `@typia/unplugin` transform runs for both server and client entry points in the Vite config; no `typia.validate()` call executes without pre-generated validators.

### New contributor

As a new contributor, I want `npm install` to complete without invoking node-gyp or downloading platform-specific binaries so that I can clone the repo and start working without encountering a C++ compiler error on my machine.

Acceptance signal: A clean install on macOS, Linux, and a CI runner all complete successfully with no native compilation step in the output.

### Self-hosting operator

As a self-hosting operator, I want the production build to have zero native addon dependencies so that I can run Erika in containerized or restricted environments without packaging a compiled C++ module or matching the Node ABI version to the host.

Acceptance signal: `npm ci --omit=dev` followed by `npm run build` and startup completes on a plain Node 24 Docker image with no `node_modules/.bin/node-gyp-rebuild` call and no missing native module error.

---

As a self-hosting operator, I want malformed upload payloads to be rejected at the API boundary with a structured error response so that bad data never silently corrupts a session record in the database.

Acceptance signal: Sending a `.cast` file with a missing or incorrectly typed required field returns a 4xx response with a machine-readable error body before any database write occurs.

### CI pipeline

As the CI pipeline, I want the full test suite (all existing tests) to pass without modification after each migration stage so that regressions in query behavior, route handling, or WASM output are caught before merge.

Acceptance signal: `npx vitest run` reports all tests passing and zero failures on the post-migration branch in CI.

---

As the CI pipeline, I want the build to be fully reproducible across platforms without environment-specific native compilation so that CI does not fail due to ABI mismatches, missing system libraries, or node-gyp version drift.

Acceptance signal: The CI build job passes on the standard runner image without any pre-install of `python`, `make`, or `gcc`.

## Out of Scope

- Runtime validation of Vue component props (future cycle)
- OpenAPI spec generation from Typia-annotated interfaces (future cycle)
- Client-side form validation driven by shared type tags (future cycle)
- Database schema migrations or new tables
- Any user-facing feature, UI change, or design system modification
- PostgreSQL adapter changes

---
**Sign-off:** Pending

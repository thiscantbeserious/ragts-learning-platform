# ADR: Complete Database Adapter Pattern

## Status
Accepted

## Context

The RAGTS database abstraction layer is partially implemented. The `SessionAdapter` interface exists with a clean `SqliteSessionImpl` implementation, but the rest of the DB layer lacks abstraction:

| Component | Interface | Implementation | Status |
|-----------|-----------|---------------|--------|
| Sessions | `SessionAdapter` | `SqliteSessionImpl` | Complete |
| Sections | -- | `SqliteSectionImpl` | Missing interface |
| File storage | -- | `storage.ts` (bare functions) | Missing abstraction |
| DB init | -- | `database.ts` (SQLite-only) | Missing abstraction |

This creates concrete coupling throughout the codebase:

- `session-pipeline.ts` imports `SqliteSectionImpl` directly
- `routes/sessions.ts` imports `SqliteSectionImpl` directly
- `routes/upload.ts` imports `SqliteSectionImpl` directly
- `storage.ts` exports bare functions with no interface, imported directly in routes
- `database.ts` hard-codes SQLite connection, schema loading, and migration execution
- `index.ts` (app entry) instantiates all concrete types manually

The architecture document (Section 7) lists "Complete database adapter pattern" as an immediate open decision. The goal is to enable a future PostgreSQL implementation without rewriting consumers.

### Forces

- SQLite is the only implementation today and will remain so for near-term
- PostgreSQL support is planned for Docker Compose (team scale) deployment
- The existing `SessionAdapter` pattern is proven and well-understood
- Manual dependency injection via function parameters works well at current scale (2 repos, 4 routes)
- Over-abstraction would add complexity without near-term benefit

## Options Considered

### Option A: Interface extraction only (minimal)

Extract `SectionAdapter` interface and `StorageAdapter` interface. Update all import sites to use interfaces instead of concrete types. Leave `initDatabase` as-is.

- Pros: Smallest change. Directly fixes the concrete-type coupling. Each consumer depends on an interface.
- Cons: DB initialization remains SQLite-specific with no swap point. When PostgreSQL arrives, `database.ts` needs a rewrite and all wiring in `index.ts` changes. No unified factory for the whole DB layer.

### Option B: Full adapter pattern with DatabaseAdapter (chosen)

Extract `SectionAdapter` interface, `StorageAdapter` interface, and a `DatabaseAdapter` interface that owns initialization, migration, repository creation, and storage creation. A `SqliteDatabaseImpl` implements it. The app entry point calls `new SqliteDatabaseImpl().initialize(config)` and gets back all repositories and storage through one seam.

- Pros: Single swap point for the entire DB engine. Implementation encapsulates connection, migrations, and repository wiring. When PostgreSQL arrives, implement `PgDatabaseImpl` -- app code unchanged. Clean seam for integration testing (mock the adapter). Consistent with the existing `SessionAdapter` pattern.
- Cons: More files (~4 new). Adapter adds one level of indirection. Slightly more abstraction than strictly needed today.

### Option C: Interface extraction + DI container

Like Option B plus a lightweight DI container or service locator to replace manual parameter passing in route handlers.

- Pros: Routes would not need repository parameters. Cleaner handler signatures.
- Cons: Over-engineered for current scale. Hono has its own context mechanism that could serve this role later. DI containers add debugging complexity. Manual parameter passing is explicit and testable.

## Decision

**Option B: Full adapter pattern with DatabaseAdapter.**

The `DatabaseAdapter` gives a single swap point for the entire persistence layer without the overhead of a DI container. The manual parameter passing in routes remains -- it is explicit, testable, and appropriate for the current number of repositories.

Naming convention: `*Adapter` = interface, `*Impl` = implementation.

Key design decisions:

1. **Interfaces are minimal.** Each interface covers only the methods that exist today on the concrete implementations. No speculative methods for future needs.

2. **SectionAdapter interface** mirrors the existing `SqliteSectionImpl` method signatures exactly: `create`, `findBySessionId`, `deleteBySessionId` (with optional type filter), `deleteById`.

3. **StorageAdapter interface** covers the three existing functions: `save`, `read`, `delete`. It receives configuration (data directory) at construction, not per-call.

4. **DatabaseAdapter interface** has a single method: `initialize(config)` that returns `{ sessionRepository, sectionRepository, storageAdapter, close() }`. This keeps the adapter stateless until initialization.

5. **Types stay where they are.** `SectionRow` and `CreateSectionInput` move to the interface file (like `Session`/`SessionCreate` in `shared/types.ts` for the session interface). They are part of the contract, not the implementation.

6. **Existing tests continue to work.** Tests that construct `SqliteSessionImpl` or `SqliteSectionImpl` directly remain valid -- they test the SQLite implementation. New tests verify the adapter wiring.

## Consequences

What becomes easier:
- Adding PostgreSQL support: implement `PgDatabaseImpl`, swap in `index.ts`
- Integration testing: mock the adapter interface for route tests
- Understanding the DB layer: all interfaces in one place, all SQLite in another
- `session-pipeline.ts` and routes depend on interfaces, not implementations

What becomes harder:
- Navigating the code: one extra level of indirection (adapter -> repositories)
- Understanding initialization: adapter hides the SQLite setup behind an interface

Follow-ups for later:
- PostgreSQL implementation when Docker Compose deployment ships
- Migration framework evaluation (currently ad-hoc `migrate002`/`migrate003` functions)
- Consider Hono context variables for repository access if route count grows significantly

## Cross-Consultation

Product Owner validated scope alignment. SectionAdapter interface, DatabaseAdapter abstraction, and StorageAdapter/FsStorageImpl were all approved. PO noted the timing is correct -- completing the adapter pattern now, before auth adds more repositories, avoids retrofitting abstractions later.

## Decision History

1. Option B chosen over minimal extraction (A) because the adapter gives a clean single swap point for the entire DB engine, and over DI container (C) because manual parameter passing works fine at current scale.
2. Interfaces are minimal -- only methods that exist on current concrete implementations. No speculative future methods.
3. This is a backend refactoring task. Branch: `refactor/db-adapter-pattern`. Scopes: `refactor(server)`, `test(server)`.
4. Types like `SectionRow` and `CreateSectionInput` move to the interface file as part of the contract.
5. Existing tests remain valid -- they test SQLite implementations directly. New tests verify adapter wiring.
6. PO cross-consultation confirmed scope and timing (pre-auth is the right moment for this refactor).
7. Naming convention applied: `*Adapter` = interface, `*Impl` = implementation.

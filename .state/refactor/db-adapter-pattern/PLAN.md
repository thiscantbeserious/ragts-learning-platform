# Plan: Complete Database Adapter Pattern

References: ADR.md

## Git Contract

| Rule | Value |
|------|-------|
| Branch | `refactor/db-adapter-pattern` |
| Commit scopes | `refactor(server)`, `test(server)` |
| Allowed paths | `src/server/**`, `src/shared/**`, `tests/**`, `.state/refactor/**` |
| PR title | `refactor(server): complete database adapter pattern` |

## Naming Convention

`*Adapter` = interface, `*Impl` = implementation.

## Open Questions

1. Should `StorageAdapter` methods use the same signatures as the current bare functions (dataDir + id for save, filepath for read/delete), or should the adapter own the path resolution internally?
   - **Resolution direction:** Adapter owns path resolution. Constructor receives `dataDir`, methods take `id` and `content`. This hides filesystem layout from consumers.

2. Should `DatabaseAdapter.initialize()` be async to support PostgreSQL connection pools later?
   - **Resolution direction:** Yes, make it async. SQLite implementation returns a resolved promise. PostgreSQL will need async connection.

## Stages

### Stage 1: Extract SectionAdapter interface

Goal: Create `SectionAdapter` interface matching the existing `SqliteSectionImpl` API. Move `SectionRow` and `CreateSectionInput` types to the interface file.

Owner: backend-engineer

- [x] Create `src/server/db/section-adapter.ts` with `SectionAdapter` interface
- [x] Move `SectionRow` and `CreateSectionInput` types from `sqlite-section-impl.ts` to `section-adapter.ts`
- [x] Update `SqliteSectionImpl` to `implements SectionAdapter`
- [x] Update `sqlite-section-impl.ts` imports to reference types from the interface file
- [x] Verify existing tests pass unchanged: `src/server/db/sqlite-section-impl.test.ts`

Files: `src/server/db/section-adapter.ts` (new), `src/server/db/sqlite-section-impl.ts` (modify)
Depends on: none

Considerations:
- The interface must exactly match the current method signatures -- do not add or change methods
- `SectionRow` and `CreateSectionInput` are part of the contract (used by consumers), not implementation details
- Re-export types from `sqlite-section-impl.ts` if needed for backward compatibility during transition

### Stage 2: Create StorageAdapter interface and FsStorageImpl

Goal: Abstract file storage behind an interface. The adapter owns path resolution (constructor receives `dataDir`).

Owner: backend-engineer

- [x] Create `src/server/storage/storage-adapter.ts` with `StorageAdapter` interface: `save(id, content): string`, `read(id): string`, `delete(id): boolean`, `exists(id): boolean`
- [x] Create `src/server/storage/fs-storage-impl.ts` implementing `StorageAdapter`
- [x] Write tests for the new implementation: `src/server/storage/storage-adapter.test.ts`
- [x] Verify existing `src/server/storage.test.ts` still passes (old functions remain for now)

Files: `src/server/storage/storage-adapter.ts` (new), `src/server/storage/fs-storage-impl.ts` (new), `src/server/storage/storage-adapter.test.ts` (new)
Depends on: none (parallel with Stage 1)

Considerations:
- Name it `FsStorageImpl` not `SqliteStorageImpl` -- file storage is filesystem, not SQLite
- The `save` method returns the absolute filepath (needed for DB record)
- The `read` method takes `id` not `filepath` -- the adapter resolves the path internally
- Current `storage.ts` functions take `filepath` for read/delete but `dataDir + id` for save. The adapter normalizes this: all methods take `id`, adapter knows the directory layout
- Keep the old `storage.ts` until consumers are updated in Stage 4

### Stage 3: Create DatabaseAdapter interface and SqliteDatabaseImpl

Goal: Unify DB initialization, migration, repository creation, and storage into a single adapter.

Owner: backend-engineer

- [x] Create `src/server/db/database-adapter.ts` with `DatabaseAdapter` interface and `DatabaseContext` type
- [x] Create `src/server/db/sqlite-database-impl.ts` implementing `DatabaseAdapter`
- [x] Write tests for the implementation: `src/server/db/database-adapter.test.ts`
- [x] `DatabaseContext` type: `{ sessionRepository: SessionAdapter, sectionRepository: SectionAdapter, storageAdapter: StorageAdapter, close(): void }`
- [x] `DatabaseAdapter` interface: `initialize(config: { dataDir: string }): Promise<DatabaseContext>`
- [x] `SqliteDatabaseImpl.initialize()` should encapsulate everything currently in `database.ts` + repository construction + storage adapter construction

Files: `src/server/db/database-adapter.ts` (new), `src/server/db/sqlite-database-impl.ts` (new), `src/server/db/database-adapter.test.ts` (new)
Depends on: Stage 1 (SectionAdapter interface), Stage 2 (StorageAdapter interface)

Considerations:
- The implementation test should verify that `initialize()` returns working repositories (insert + query round-trip)
- `close()` wraps `db.close()` for cleanup
- The implementation does NOT replace `initDatabase` yet -- it delegates to it internally. `initDatabase` becomes an implementation detail of `SqliteDatabaseImpl`
- Config shape should be minimal: `{ dataDir: string }` is enough for SQLite. PostgreSQL implementation will need `{ connectionString, ... }`

### Stage 4: Update consumers to use interfaces

Goal: Replace all concrete type imports with interface imports. Wire the app entry point through the adapter.

Owner: backend-engineer

- [x] Update `src/server/processing/session-pipeline.ts`: change `SqliteSectionImpl` import to `SectionAdapter`
- [x] Update `src/server/routes/sessions.ts`: change `SqliteSectionImpl` import to `SectionAdapter`, replace `readSession`/`deleteSession` with `StorageAdapter`
- [x] Update `src/server/routes/upload.ts`: change `SqliteSectionImpl` import to `SectionAdapter`, replace `saveSession`/`deleteSession` with `StorageAdapter`
- [x] Update `src/server/index.ts`: replace manual DB init + repository construction with `SqliteDatabaseImpl.initialize()`
- [x] Update route handler signatures to accept `StorageAdapter` instead of `dataDir` where applicable
- [x] Verify all existing tests pass: `npm run test`

Files: `src/server/processing/session-pipeline.ts` (modify), `src/server/routes/sessions.ts` (modify), `src/server/routes/upload.ts` (modify), `src/server/index.ts` (modify)
Depends on: Stage 3

Considerations:
- `handleUpload` currently receives `dataDir` and calls `saveSession(dataDir, id, content)` directly. Change to receive `StorageAdapter` and call `storageAdapter.save(id, content)`
- `handleDeleteSession` calls `deleteSession(session.filepath)` -- needs to change to `storageAdapter.delete(id)` (adapter resolves path from id)
- `handleGetSession` calls `readSession(session.filepath)` -- change to `storageAdapter.read(id)` ... the adapter derives from id. The `filepath` column in DB becomes a SQLite implementation detail (still stored for backward compat, but not used by the storage adapter interface)
- `session-pipeline.ts` does NOT use storage -- it receives `filePath` directly. Leave that parameter as-is for now

### Stage 5: Clean up old code and update tests

Goal: Remove the old `storage.ts` bare functions. Update integration tests to use the adapter pattern.

Owner: backend-engineer

- [x] Delete `src/server/storage.ts` (replaced by `FsStorageImpl`)
- [x] Delete or update `src/server/storage.test.ts` (replaced by `storage-adapter.test.ts`)
- [x] Update `src/server/routes/api.test.ts` to use `FsStorageImpl` (direct impl construction retained — tests still verify SQLite implementations directly)
- [x] Verify no remaining imports of deleted files: grep for `from '../storage.js'` and `from './storage.js'`
- [x] Run full test suite: `npm run test`
- [x] Create barrel export `src/server/db/index.ts` that re-exports all interfaces and the SQLite implementation

Files: `src/server/storage.ts` (delete), `src/server/storage.test.ts` (delete or update), `src/server/routes/api.test.ts` (modify), `src/server/db/index.ts` (new)
Depends on: Stage 4

Considerations:
- `api.test.ts` constructs `SqliteSessionImpl` and `SqliteSectionImpl` directly in `beforeEach`. This is fine -- these tests verify the SQLite implementation.
- The barrel export should expose: `SessionAdapter`, `SectionAdapter`, `StorageAdapter`, `DatabaseAdapter`, `DatabaseContext`, `SqliteDatabaseImpl`
- Do NOT export `SqliteSessionImpl` or `SqliteSectionImpl` from the barrel -- consumers should go through the adapter
- `scripts/migrate-v2.ts` also imports from the DB layer -- verify it still works

### Stage 6: Update ARCHITECTURE.md

Goal: Update the database abstraction table in ARCHITECTURE.md Section 4 to reflect the completed pattern. Remove "Complete database adapter pattern" from Section 7 open decisions.

Owner: backend-engineer

- [x] Update ARCHITECTURE.md Section 4 "Database Abstraction" table: all rows show complete
- [x] Add `DatabaseAdapter` row to the table
- [x] Remove "Complete database adapter pattern" from Section 7 "Immediate" open decisions
- [x] Add entry to Section 8 "Decision History" referencing this ADR

Files: `ARCHITECTURE.md` (modify)
Depends on: Stage 5

Considerations:
- Keep the update minimal -- just the table and the open decisions list
- The ADR in `.state/refactor/db-adapter-pattern/ADR.md` has the full decision record

## Dependencies

```
Stage 1 ──┐
           ├──> Stage 3 ──> Stage 4 ──> Stage 5 ──> Stage 6
Stage 2 ──┘
```

- Stages 1 and 2 are independent and can run in parallel
- Stage 3 depends on both Stage 1 and Stage 2 (needs both interfaces)
- Stage 4 depends on Stage 3 (needs the adapter to wire up)
- Stage 5 depends on Stage 4 (can only delete old code after consumers are updated)
- Stage 6 depends on Stage 5 (documentation reflects final state)

## Progress

Updated by implementer as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | complete | Extract SectionAdapter interface |
| 2 | complete | Create StorageAdapter + FsStorageImpl |
| 3 | complete | Create DatabaseAdapter + SqliteDatabaseImpl |
| 4 | complete | Update all consumers to interfaces |
| 5 | complete | Clean up old code, update tests |
| 6 | complete | Update ARCHITECTURE.md |

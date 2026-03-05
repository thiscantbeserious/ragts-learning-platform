/**
 * Barrel export for the database layer.
 * Exports all public interfaces and the SQLite implementation.
 * Concrete implementation classes are intentionally not re-exported here —
 * consumers should obtain repositories through SqliteDatabaseImpl.
 */

export type { SessionAdapter } from './session-adapter.js';
export type { SectionAdapter, SectionRow, CreateSectionInput } from './section-adapter.js';
export type { StorageAdapter } from '../storage/storage-adapter.js';
export type { DatabaseAdapter, DatabaseContext } from './database-adapter.js';
export { SqliteDatabaseImpl } from './sqlite-database-impl.js';

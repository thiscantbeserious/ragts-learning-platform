/**
 * Thin compatibility wrapper around node:sqlite's DatabaseSync.
 * Provides the same API surface as better-sqlite3 so all downstream consumers
 * can swap to this module with only an import path change.
 *
 * This is the ONLY file that knows about node:sqlite internals.
 * All better-sqlite3 API differences are normalised here:
 *   - .pragma() always returns an array, matching better-sqlite3's behaviour
 *   - .transaction() returning a reusable callable (not just BEGIN/COMMIT)
 *   - .open property tracking close state
 *   - result.lastInsertRowid normalised to number (node:sqlite returns bigint)
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';

/** SQLite parameter types accepted by node:sqlite's StatementSync. */
type SqlParam = string | number | bigint | Buffer | null;

/** Run result matching better-sqlite3's RunResult shape. */
export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/** Statement wrapper matching better-sqlite3's Statement interface. */
export interface CompatStatement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/** Wraps a StatementSync to produce RunResult with number lastInsertRowid. */
function wrapStatement(stmt: StatementSync): CompatStatement {
  return {
    run(...params: unknown[]): RunResult {
      const raw = stmt.run(...(params as SqlParam[]));
      return {
        changes: Number(raw.changes),
        lastInsertRowid: Number(raw.lastInsertRowid),
      };
    },
    get(...params: unknown[]): unknown {
      return stmt.get(...(params as SqlParam[])) ?? undefined;
    },
    all(...params: unknown[]): unknown[] {
      return stmt.all(...(params as SqlParam[]));
    },
  };
}

/**
 * Compatibility wrapper for node:sqlite's DatabaseSync.
 * Implements the better-sqlite3 Database API surface used across this codebase.
 */
export class NodeSqliteDatabase {
  private readonly _db: DatabaseSync;
  private _open: boolean = true;

  /** Opens a database at `path`. Use ':memory:' for in-memory databases. */
  constructor(path: string) {
    this._db = new DatabaseSync(path);
  }

  /** True while the database connection is open. */
  get open(): boolean {
    return this._open;
  }

  /**
   * Execute one or more SQL statements separated by semicolons.
   * Matches better-sqlite3's db.exec() — no return value.
   */
  exec(sql: string): void {
    this._db.exec(sql);
  }

  /**
   * Prepare a SQL statement for repeated execution.
   * Returns a CompatStatement with run/get/all matching better-sqlite3.
   */
  prepare(sql: string): CompatStatement {
    return wrapStatement(this._db.prepare(sql));
  }

  /**
   * Execute a PRAGMA statement, matching better-sqlite3's db.pragma() exactly.
   *
   * better-sqlite3 always returns an array of row objects from db.pragma():
   *   - Query pragma ('table_info(t)'): array of descriptors
   *   - Setter pragma ('journal_mode = WAL'): array with result row, or []
   *   - Bare read pragma ('journal_mode'): array with one row, or []
   *
   * Callers in this codebase either ignore the return value (setter pragmas
   * used for configuration) or cast to Array<{name:string}> (table_info queries).
   */
  pragma(pragmaStr: string): unknown[] {
    return this._db.prepare(`PRAGMA ${pragmaStr}`).all();
  }

  /**
   * Creates a reusable transaction wrapper, matching better-sqlite3's db.transaction().
   * Returns a callable function that wraps `fn` in BEGIN/COMMIT/ROLLBACK.
   * The wrapper can be called multiple times — each call is its own transaction.
   * Arguments passed to the wrapper are forwarded to `fn`.
   */
  transaction<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => TReturn
  ): (...args: TArgs) => TReturn {
    return (...args: TArgs): TReturn => {
      this._db.exec('BEGIN');
      try {
        const result = fn(...args);
        this._db.exec('COMMIT');
        return result;
      } catch (err) {
        this._db.exec('ROLLBACK');
        throw err;
      }
    };
  }

  /**
   * Closes the database connection.
   * Idempotent — safe to call multiple times.
   */
  close(): void {
    if (!this._open) return;
    this._open = false;
    this._db.close();
  }
}

/**
 * Default export with merged namespace — mirrors better-sqlite3's pattern.
 * Consumers can swap `import Database from 'better-sqlite3'`
 * to `import Database from './node_sqlite_compat.js'`
 * and continue using `Database.Database` and `Database.Statement` as types.
 *
 * TypeScript merges a class and namespace with the same name automatically.
 */
class Database extends NodeSqliteDatabase {}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Database {
  export type Database = NodeSqliteDatabase;
  export type Statement = CompatStatement;
}

export default Database;

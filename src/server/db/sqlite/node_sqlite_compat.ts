/**
 * Thin compatibility wrapper around node:sqlite's DatabaseSync.
 * Provides the same API surface as better-sqlite3 so all downstream consumers
 * can swap to this module with only an import path change.
 *
 * This is the ONLY file that knows about node:sqlite internals.
 * All better-sqlite3 API differences are normalised here:
 *   - .pragma() helper (node:sqlite has no built-in pragma method)
 *   - .transaction() returning a reusable callable (not just BEGIN/COMMIT)
 *   - .open property tracking close state
 *   - result.lastInsertRowid normalised to number (node:sqlite returns bigint)
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';

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
      const raw = stmt.run(...params);
      return {
        changes: raw.changes,
        lastInsertRowid: Number(raw.lastInsertRowid),
      };
    },
    get(...params: unknown[]): unknown {
      return stmt.get(...params) ?? undefined;
    },
    all(...params: unknown[]): unknown[] {
      return stmt.all(...params);
    },
  };
}

/**
 * Determines whether a pragma string is a query (returns rows) or a setter.
 * Queries include table_info, index_list, etc. — they contain a parenthesised
 * argument. Setters use `key = value` or bare keys like `optimize`.
 */
function isPragmaQuery(pragmaStr: string): boolean {
  const trimmed = pragmaStr.trim();
  // table_info(t), index_list(t), etc.
  return /\(/.test(trimmed);
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
   * Execute a PRAGMA statement, matching better-sqlite3's db.pragma().
   * For query pragmas (e.g. table_info(t)) returns an array of row objects.
   * For setter pragmas (e.g. journal_mode = WAL) executes the pragma and
   * returns undefined (callers in this codebase do not use the return value).
   */
  pragma(pragmaStr: string): unknown[] | undefined {
    if (isPragmaQuery(pragmaStr)) {
      return this._db.prepare(`PRAGMA ${pragmaStr}`).all();
    }
    this._db.exec(`PRAGMA ${pragmaStr}`);
    return undefined;
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

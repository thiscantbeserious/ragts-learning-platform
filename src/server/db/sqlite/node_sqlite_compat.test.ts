// @vitest-environment node
/**
 * Unit tests for the node:sqlite compatibility wrapper.
 * Covers all API surface consumed by the existing codebase:
 * pragma, transaction, prepare/run/get/all, close, and .open.
 *
 * All pragma tests verify the array return shape that matches
 * better-sqlite3's db.pragma() behaviour exactly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database, { NodeSqliteDatabase, type RunResult, type CompatStatement } from './node_sqlite_compat.js';
import type { } from './node_sqlite_compat.js';

describe('Database namespace export', () => {
  it('default export is constructable (matches better-sqlite3 usage pattern)', () => {
    // Consumer pattern: import Database from './node_sqlite_compat'
    // Then: new Database(':memory:') and use Database.Database / Database.Statement types
    const db = new Database(':memory:');
    expect(db).toBeInstanceOf(NodeSqliteDatabase);
    db.close();
  });

  it('Database.Database type is assignable (namespace type export works)', () => {
    // Verify the namespace type is usable — no runtime assertion needed,
    // but we construct via the default export to simulate consumer usage.
    const db: Database.Database = new Database(':memory:');
    expect(db.open).toBe(true);
    db.close();
  });

  it('Database.Statement type is usable as annotation (prepare returns compatible type)', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (n INTEGER)');
    // Assigning prepare() result to Database.Statement annotation must compile
    const stmt: Database.Statement = db.prepare('SELECT 1');
    expect(typeof stmt.run).toBe('function');
    expect(typeof stmt.get).toBe('function');
    expect(typeof stmt.all).toBe('function');
    db.close();
  });

  it('RunResult and CompatStatement named exports are accessible', () => {
    // Verify structural correctness: these are interface types, checked by TS compiler.
    // At runtime we just confirm the values behave correctly.
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)');
    const result: RunResult = db.prepare('INSERT INTO t VALUES (NULL)').run();
    expect(typeof result.changes).toBe('number');
    expect(typeof result.lastInsertRowid).toBe('number');
    const stmt: CompatStatement = db.prepare('SELECT 1');
    expect(Array.isArray(stmt.all())).toBe(true);
    db.close();
  });
});

describe('NodeSqliteDatabase — constructor', () => {
  it('opens an in-memory database without throwing', () => {
    const db = new NodeSqliteDatabase(':memory:');
    expect(db.open).toBe(true);
    db.close();
  });
});

describe('NodeSqliteDatabase — exec and prepare/run/get/all', () => {
  let db: NodeSqliteDatabase;

  beforeEach(() => {
    db = new NodeSqliteDatabase(':memory:');
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it('exec creates a table without throwing', () => {
    expect(() =>
      db.exec('CREATE TABLE IF NOT EXISTS other (id INTEGER PRIMARY KEY)')
    ).not.toThrow();
  });

  it('prepare + run inserts a row and returns changes = 1', () => {
    const stmt = db.prepare('INSERT INTO items (name) VALUES (?)');
    const result = stmt.run('hello');
    expect(result.changes).toBe(1);
  });

  it('run returns lastInsertRowid as a number (not bigint)', () => {
    const stmt = db.prepare('INSERT INTO items (name) VALUES (?)');
    const result = stmt.run('world');
    expect(typeof result.lastInsertRowid).toBe('number');
    expect(result.lastInsertRowid).toBeGreaterThan(0);
  });

  it('get returns the inserted row', () => {
    const insert = db.prepare('INSERT INTO items (name) VALUES (?)');
    insert.run('alpha');
    const row = db.prepare('SELECT * FROM items WHERE name = ?').get('alpha') as { id: number; name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('alpha');
  });

  it('get returns undefined when no row matches', () => {
    const row = db.prepare('SELECT * FROM items WHERE name = ?').get('missing');
    expect(row).toBeUndefined();
  });

  it('all returns all inserted rows', () => {
    const insert = db.prepare('INSERT INTO items (name) VALUES (?)');
    insert.run('a');
    insert.run('b');
    insert.run('c');
    const rows = db.prepare('SELECT * FROM items ORDER BY name ASC').all() as Array<{ name: string }>;
    expect(rows.length).toBe(3);
    expect(rows.map(r => r.name)).toEqual(['a', 'b', 'c']);
  });

  it('all returns empty array when table is empty', () => {
    const rows = db.prepare('SELECT * FROM items').all();
    expect(rows).toEqual([]);
  });

  it('run on DELETE returns changes count', () => {
    const insert = db.prepare('INSERT INTO items (name) VALUES (?)');
    insert.run('to-delete');
    const result = db.prepare('DELETE FROM items WHERE name = ?').run('to-delete');
    expect(result.changes).toBe(1);
  });

  it('lastInsertRowid increments on each insert', () => {
    const stmt = db.prepare('INSERT INTO items (name) VALUES (?)');
    const r1 = stmt.run('first');
    const r2 = stmt.run('second');
    expect(r2.lastInsertRowid).toBeGreaterThan(r1.lastInsertRowid);
  });
});

describe('NodeSqliteDatabase — pragma', () => {
  let db: NodeSqliteDatabase;

  beforeEach(() => {
    db = new NodeSqliteDatabase(':memory:');
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  // Setter pragmas: better-sqlite3 always returns an array (some empty, some with a row)
  it('pragma setter (journal_mode = WAL) returns an array', () => {
    const result = db.pragma('journal_mode = WAL');
    // In-memory databases do not support WAL — SQLite returns current mode
    expect(Array.isArray(result)).toBe(true);
  });

  it('pragma setter (journal_mode = WAL) returns the resulting mode object', () => {
    const result = db.pragma('journal_mode = WAL') as Array<{ journal_mode: string }>;
    // In-memory databases fall back to 'memory'
    expect(result.length).toBe(1);
    expect(typeof result[0]!.journal_mode).toBe('string');
  });

  it('pragma setter (foreign_keys = ON) returns an array (empty — no result row)', () => {
    // foreign_keys pragma returns no result row in SQLite; better-sqlite3 returns []
    const result = db.pragma('foreign_keys = ON');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('pragma setter (auto_vacuum = FULL) returns an array', () => {
    expect(Array.isArray(db.pragma('auto_vacuum = FULL'))).toBe(true);
  });

  it('pragma setter (busy_timeout = 5000) returns an array with result row', () => {
    const result = db.pragma('busy_timeout = 5000') as Array<{ timeout: number }>;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.timeout).toBe(5000);
  });

  it('pragma setter (synchronous = NORMAL) returns an array', () => {
    expect(Array.isArray(db.pragma('synchronous = NORMAL'))).toBe(true);
  });

  it('pragma setter (cache_size = -20000) returns an array', () => {
    expect(Array.isArray(db.pragma('cache_size = -20000'))).toBe(true);
  });

  it('pragma setter (temp_store = MEMORY) returns an array', () => {
    expect(Array.isArray(db.pragma('temp_store = MEMORY'))).toBe(true);
  });

  // Query pragmas: always return an array of descriptor objects
  it('pragma table_info returns array of column descriptor objects', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const cols = db.pragma('table_info(t)') as Array<{ name: string; type: string }>;
    expect(Array.isArray(cols)).toBe(true);
    expect(cols.length).toBe(2);
    const names = cols.map(c => c.name);
    expect(names).toContain('id');
    expect(names).toContain('val');
  });

  it('pragma table_info has correct column metadata shape', () => {
    db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    const cols = db.pragma('table_info(sessions)') as Array<{ name: string; type: string; notnull: number }>;
    const nameCol = cols.find(c => c.name === 'name');
    expect(nameCol).toBeDefined();
    expect(nameCol!.type).toBe('TEXT');
    expect(nameCol!.notnull).toBe(1);
  });

  // Bare read pragmas: return an array with a single row
  it('pragma bare read (journal_mode) returns array with single row', () => {
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.journal_mode).toBe('memory');
  });

  it('pragma bare read (foreign_keys) reflects previous setter', () => {
    db.pragma('foreign_keys = ON');
    const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]!.foreign_keys).toBe(1);
  });

  // Bare pragmas with no result (optimize): return empty array
  it('pragma optimize returns an array (may be empty)', () => {
    expect(Array.isArray(db.pragma('optimize'))).toBe(true);
  });

  // Migration pattern: cast to Array<{name: string}> and use Set of names
  it('pragma table_info usable in migration column-check pattern', () => {
    db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT)');
    const sessionColumns = db.pragma('table_info(sessions)') as Array<{ name: string }>;
    const columnNames = new Set(sessionColumns.map(col => col.name));
    expect(columnNames.has('id')).toBe(true);
    expect(columnNames.has('name')).toBe(true);
    expect(columnNames.has('nonexistent')).toBe(false);
  });
});

describe('NodeSqliteDatabase — transaction', () => {
  let db: NodeSqliteDatabase;

  beforeEach(() => {
    db = new NodeSqliteDatabase(':memory:');
    db.exec('CREATE TABLE counter (n INTEGER NOT NULL)');
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it('transaction commits all writes on success', () => {
    const insert = db.prepare('INSERT INTO counter (n) VALUES (?)');
    const txn = db.transaction(() => {
      insert.run(1);
      insert.run(2);
      insert.run(3);
    });
    txn();
    const rows = db.prepare('SELECT * FROM counter').all() as Array<{ n: number }>;
    expect(rows.length).toBe(3);
  });

  it('transaction rolls back on thrown error', () => {
    const insert = db.prepare('INSERT INTO counter (n) VALUES (?)');
    const txn = db.transaction(() => {
      insert.run(10);
      throw new Error('intentional failure');
    });
    expect(() => txn()).toThrow('intentional failure');
    const rows = db.prepare('SELECT * FROM counter').all();
    expect(rows.length).toBe(0);
  });

  it('transaction returns a reusable function that can be called multiple times', () => {
    const insert = db.prepare('INSERT INTO counter (n) VALUES (?)');
    const txn = db.transaction((val: number) => {
      insert.run(val);
    });
    txn(100);
    txn(200);
    const rows = db.prepare('SELECT n FROM counter ORDER BY n ASC').all() as Array<{ n: number }>;
    expect(rows.length).toBe(2);
    expect(rows[0]!.n).toBe(100);
    expect(rows[1]!.n).toBe(200);
  });

  it('transaction passes arguments through to the wrapped function', () => {
    const insert = db.prepare('INSERT INTO counter (n) VALUES (?)');
    const txn = db.transaction((a: number, b: number) => {
      insert.run(a);
      insert.run(b);
    });
    txn(42, 99);
    const rows = db.prepare('SELECT n FROM counter ORDER BY n ASC').all() as Array<{ n: number }>;
    expect(rows.map(r => r.n)).toEqual([42, 99]);
  });

  it('second call after a rollback leaves DB clean for next transaction', () => {
    const insert = db.prepare('INSERT INTO counter (n) VALUES (?)');
    const failTxn = db.transaction(() => {
      insert.run(1);
      throw new Error('fail');
    });
    const goodTxn = db.transaction((val: number) => {
      insert.run(val);
    });

    expect(() => failTxn()).toThrow();
    goodTxn(7);

    const rows = db.prepare('SELECT n FROM counter').all() as Array<{ n: number }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.n).toBe(7);
  });

  it('transaction wraps callback return value', () => {
    const insert = db.prepare('INSERT INTO counter (n) VALUES (?)');
    const txn = db.transaction((val: number): string => {
      insert.run(val);
      return `inserted ${val}`;
    });
    const result = txn(55);
    expect(result).toBe('inserted 55');
  });
});

describe('NodeSqliteDatabase — close and .open', () => {
  it('open is true after construction', () => {
    const db = new NodeSqliteDatabase(':memory:');
    expect(db.open).toBe(true);
    db.close();
  });

  it('open is false after close', () => {
    const db = new NodeSqliteDatabase(':memory:');
    db.close();
    expect(db.open).toBe(false);
  });

  it('close is idempotent — second close does not throw', () => {
    const db = new NodeSqliteDatabase(':memory:');
    db.close();
    expect(() => db.close()).not.toThrow();
  });
});

describe('NodeSqliteDatabase — sqlite_master introspection', () => {
  let db: NodeSqliteDatabase;

  beforeEach(() => {
    db = new NodeSqliteDatabase(':memory:');
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it('can query sqlite_master for table existence', () => {
    db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY)');
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('sessions');
  });

  it('returns undefined for non-existent table', () => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nonexistent'")
      .get();
    expect(row).toBeUndefined();
  });
});

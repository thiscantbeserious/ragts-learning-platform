// @vitest-environment node
/**
 * Unit tests for the node:sqlite compatibility wrapper.
 * Covers all API surface consumed by the existing codebase:
 * pragma, transaction, prepare/run/get/all, close, and .open.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDatabase } from './node_sqlite_compat.js';

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

  it('pragma write (journal_mode = WAL) does not throw', () => {
    expect(() => db.pragma('journal_mode = WAL')).not.toThrow();
  });

  it('pragma write (foreign_keys = ON) does not throw', () => {
    expect(() => db.pragma('foreign_keys = ON')).not.toThrow();
  });

  it('pragma write (auto_vacuum = FULL) does not throw', () => {
    expect(() => db.pragma('auto_vacuum = FULL')).not.toThrow();
  });

  it('pragma write (busy_timeout = 5000) does not throw', () => {
    expect(() => db.pragma('busy_timeout = 5000')).not.toThrow();
  });

  it('pragma write (synchronous = NORMAL) does not throw', () => {
    expect(() => db.pragma('synchronous = NORMAL')).not.toThrow();
  });

  it('pragma write (cache_size = -20000) does not throw', () => {
    expect(() => db.pragma('cache_size = -20000')).not.toThrow();
  });

  it('pragma write (temp_store = MEMORY) does not throw', () => {
    expect(() => db.pragma('temp_store = MEMORY')).not.toThrow();
  });

  it('pragma table_info returns array of column descriptor objects', () => {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');
    const cols = db.pragma('table_info(t)') as Array<{ name: string; type: string }>;
    expect(Array.isArray(cols)).toBe(true);
    expect(cols.length).toBe(2);
    const names = cols.map(c => c.name);
    expect(names).toContain('id');
    expect(names).toContain('val');
  });

  it('pragma optimize does not throw', () => {
    expect(() => db.pragma('optimize')).not.toThrow();
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

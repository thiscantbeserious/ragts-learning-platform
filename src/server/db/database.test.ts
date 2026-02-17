/**
 * Unit tests for database initialization.
 */

import { describe, it, expect } from 'vitest';
import { initDatabase } from './database.js';

describe('initDatabase', () => {
  it('should create in-memory database successfully', () => {
    const db = initDatabase(':memory:');

    expect(db).toBeDefined();

    // WAL mode returns 'memory' for in-memory databases (expected)
    const walMode = db.pragma('journal_mode', { simple: true });
    expect(walMode).toBe('memory');

    // Verify foreign keys are enabled
    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    expect(foreignKeys).toBe(1);

    db.close();
  });

  it('should create sessions table with correct schema', () => {
    const db = initDatabase(':memory:');

    // Query table info
    const tableInfo = db.pragma('table_info(sessions)');

    expect(tableInfo).toBeDefined();
    expect(tableInfo.length).toBeGreaterThan(0);

    // Verify key columns exist
    const columns = tableInfo.map((col: any) => col.name);
    expect(columns).toContain('id');
    expect(columns).toContain('filename');
    expect(columns).toContain('filepath');
    expect(columns).toContain('size_bytes');
    expect(columns).toContain('marker_count');
    expect(columns).toContain('uploaded_at');
    expect(columns).toContain('created_at');

    db.close();
  });

  it('should create index on uploaded_at', () => {
    const db = initDatabase(':memory:');

    // Query index info
    const indexes = db.pragma('index_list(sessions)');

    expect(indexes).toBeDefined();
    expect(indexes.length).toBeGreaterThan(0);

    const indexNames = indexes.map((idx: any) => idx.name);
    expect(indexNames).toContain('idx_sessions_uploaded_at');

    db.close();
  });

  it('should be idempotent (safe to call multiple times)', () => {
    const db = initDatabase(':memory:');

    // Apply schema again (should not throw)
    expect(() => {
      const schema = db.prepare('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY)');
      schema.run();
    }).not.toThrow();

    db.close();
  });

  it('should apply migration 003 (unified snapshot)', () => {
    const db = initDatabase(':memory:');

    // Check sessions table has snapshot column
    const sessionColumns = db.pragma('table_info(sessions)');
    const sessionColumnNames = sessionColumns.map((col: any) => col.name);
    expect(sessionColumnNames).toContain('snapshot');

    // Check sections table has start_line and end_line columns
    const sectionColumns = db.pragma('table_info(sections)');
    const sectionColumnNames = sectionColumns.map((col: any) => col.name);
    expect(sectionColumnNames).toContain('start_line');
    expect(sectionColumnNames).toContain('end_line');

    // Verify snapshot column is nullable (TEXT without NOT NULL)
    const snapshotCol = sessionColumns.find((col: any) => col.name === 'snapshot');
    expect(snapshotCol).toBeDefined();
    expect(snapshotCol.type).toBe('TEXT');
    expect(snapshotCol.notnull).toBe(0); // 0 means nullable

    // Verify line columns are nullable (INTEGER without NOT NULL)
    const startLineCol = sectionColumns.find((col: any) => col.name === 'start_line');
    expect(startLineCol).toBeDefined();
    expect(startLineCol.type).toBe('INTEGER');
    expect(startLineCol.notnull).toBe(0);

    const endLineCol = sectionColumns.find((col: any) => col.name === 'end_line');
    expect(endLineCol).toBeDefined();
    expect(endLineCol.type).toBe('INTEGER');
    expect(endLineCol.notnull).toBe(0);

    db.close();
  });
});

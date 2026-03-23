/**
 * Tests for Migration 005: section metadata columns (line_count, content_hash, preview).
 *
 * Verifies:
 * - Column addition (line_count, content_hash, preview)
 * - Idempotency (safe to run twice)
 * - Backfill correctness for line_count
 * - Backfill of CLI section snapshots (denormalization)
 * - Backfill of content_hash
 * - Sentinel hash for sections with no snapshot
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from '../node_sqlite_compat.js';
import { migrate002Sections } from './002_sections.js';
import { migrate003UnifiedSnapshot } from './003_unified_snapshot.js';
import { migrate004PipelineJobsEvents } from './004_pipeline_jobs_events.js';
import { migrate005SectionMetadata, EMPTY_CONTENT_HASH } from './005_section_metadata.js';

/** Creates a fresh in-memory DB with migrations 001-004 applied. */
function createBaseDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL,
      marker_count INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_uploaded_at ON sessions(uploaded_at DESC);
  `);

  migrate002Sections(db);
  migrate003UnifiedSnapshot(db);
  migrate004PipelineJobsEvents(db);

  return db;
}

/** Returns column names for the given table. */
function getColumns(db: Database.Database, table: string): string[] {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

/** Inserts a minimal session row and returns its id. */
function insertSession(db: Database.Database, id: string, snapshot?: string): void {
  db.prepare(
    `INSERT INTO sessions (id, filename, filepath, size_bytes, uploaded_at, snapshot)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, `${id}.cast`, `sessions/${id}.cast`, 100, '2026-01-01T00:00:00Z', snapshot ?? null);
}

/** Inserts a CLI section (no snapshot, has start_line/end_line). Returns section id. */
function insertCliSection(
  db: Database.Database,
  id: string,
  sessionId: string,
  startLine: number,
  endLine: number
): void {
  db.prepare(
    `INSERT INTO sections (id, session_id, type, start_event, end_event, label, snapshot, start_line, end_line)
     VALUES (?, ?, 'detected', 0, 10, null, null, ?, ?)`
  ).run(id, sessionId, startLine, endLine);
}

/** Inserts a TUI section (has snapshot, no start_line/end_line). */
function insertTuiSection(
  db: Database.Database,
  id: string,
  sessionId: string,
  snapshotJson: string
): void {
  db.prepare(
    `INSERT INTO sections (id, session_id, type, start_event, end_event, label, snapshot, start_line, end_line)
     VALUES (?, ?, 'detected', 0, 10, null, ?, null, null)`
  ).run(id, sessionId, snapshotJson);
}

/** Returns a section row as a plain object. */
function getSection(db: Database.Database, id: string): Record<string, unknown> {
  return db.prepare('SELECT * FROM sections WHERE id=?').get(id) as Record<string, unknown>;
}

describe('migrate005SectionMetadata', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createBaseDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('column addition', () => {
    it('adds line_count column to sections table', () => {
      migrate005SectionMetadata(db);
      expect(getColumns(db, 'sections')).toContain('line_count');
    });

    it('adds content_hash column to sections table', () => {
      migrate005SectionMetadata(db);
      expect(getColumns(db, 'sections')).toContain('content_hash');
    });

    it('adds preview column to sections table', () => {
      migrate005SectionMetadata(db);
      expect(getColumns(db, 'sections')).toContain('preview');
    });

    it('new columns are nullable (allow null values)', () => {
      migrate005SectionMetadata(db);
      insertSession(db, 's-nullable');
      // Insert section without new columns — they should default to null
      db.exec(
        `INSERT INTO sections (id, session_id, type, start_event)
         VALUES ('sec-null', 's-nullable', 'detected', 0)`
      );
      const section = getSection(db, 'sec-null');
      expect(section['line_count']).toBeNull();
      expect(section['content_hash']).toBeNull();
      expect(section['preview']).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('running migration twice does not throw', () => {
      expect(() => {
        migrate005SectionMetadata(db);
        migrate005SectionMetadata(db);
      }).not.toThrow();
    });

    it('running migration twice does not duplicate columns', () => {
      migrate005SectionMetadata(db);
      migrate005SectionMetadata(db);
      const cols = getColumns(db, 'sections');
      const lineCountOccurrences = cols.filter((c) => c === 'line_count').length;
      expect(lineCountOccurrences).toBe(1);
    });
  });

  describe('backfill: line_count', () => {
    it('backfills line_count for CLI sections from end_line - start_line', () => {
      insertSession(db, 's-cli');
      insertCliSection(db, 'cli-1', 's-cli', 0, 50);
      migrate005SectionMetadata(db);
      const section = getSection(db, 'cli-1');
      expect(section['line_count']).toBe(50);
    });

    it('backfills line_count for CLI section spanning a range', () => {
      insertSession(db, 's-cli2');
      insertCliSection(db, 'cli-2', 's-cli2', 10, 30);
      migrate005SectionMetadata(db);
      const section = getSection(db, 'cli-2');
      expect(section['line_count']).toBe(20);
    });

    it('backfills line_count for TUI sections from snapshot line count', () => {
      insertSession(db, 's-tui');
      const snapshotJson = JSON.stringify({ lines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] });
      insertTuiSection(db, 'tui-1', 's-tui', snapshotJson);
      migrate005SectionMetadata(db);
      const section = getSection(db, 'tui-1');
      expect(section['line_count']).toBe(3);
    });

    it('sets line_count to 0 for sections with null snapshot and null start/end line', () => {
      insertSession(db, 's-empty');
      db.prepare(
        `INSERT INTO sections (id, session_id, type, start_event)
         VALUES ('empty-1', 's-empty', 'detected', 0)`
      ).run();
      migrate005SectionMetadata(db);
      const section = getSection(db, 'empty-1');
      expect(section['line_count']).toBe(0);
    });
  });

  describe('backfill: CLI section denormalization', () => {
    it('populates snapshot for CLI sections by slicing session snapshot lines', () => {
      const sessionLines = Array.from({ length: 100 }, (_, i) => ({ text: `line ${i}` }));
      const sessionSnapshot = JSON.stringify({ lines: sessionLines });
      insertSession(db, 's-denorm', sessionSnapshot);
      insertCliSection(db, 'cli-denorm', 's-denorm', 10, 20);

      migrate005SectionMetadata(db);

      const section = getSection(db, 'cli-denorm');
      expect(section['snapshot']).not.toBeNull();
      const parsed = JSON.parse(section['snapshot'] as string) as { lines: unknown[] };
      expect(parsed.lines).toHaveLength(10);
    });

    it('slices the correct lines from the session snapshot', () => {
      const sessionLines = Array.from({ length: 50 }, (_, i) => ({ text: `line ${i}` }));
      const sessionSnapshot = JSON.stringify({ lines: sessionLines });
      insertSession(db, 's-slice', sessionSnapshot);
      insertCliSection(db, 'cli-slice', 's-slice', 5, 15);

      migrate005SectionMetadata(db);

      const section = getSection(db, 'cli-slice');
      const parsed = JSON.parse(section['snapshot'] as string) as { lines: Array<{ text: string }> };
      expect(parsed.lines[0]!.text).toBe('line 5');
      expect(parsed.lines[9]!.text).toBe('line 14');
    });

    it('does not overwrite existing TUI section snapshots', () => {
      const tuiSnapshot = JSON.stringify({ lines: [{ text: 'tui-line' }] });
      insertSession(db, 's-tui-keep');
      insertTuiSection(db, 'tui-keep', 's-tui-keep', tuiSnapshot);

      migrate005SectionMetadata(db);

      const section = getSection(db, 'tui-keep');
      const parsed = JSON.parse(section['snapshot'] as string) as { lines: Array<{ text: string }> };
      expect(parsed.lines[0]!.text).toBe('tui-line');
    });

    it('handles CLI sections when session has no snapshot (sets empty lines array)', () => {
      // Session with no snapshot column value
      insertSession(db, 's-no-snapshot');
      insertCliSection(db, 'cli-no-session-snap', 's-no-snapshot', 0, 10);

      migrate005SectionMetadata(db);

      const section = getSection(db, 'cli-no-session-snap');
      const parsed = JSON.parse(section['snapshot'] as string) as { lines: unknown[] };
      expect(parsed.lines).toHaveLength(0);
    });

    it('handles out-of-range end_line gracefully (clamps to available lines)', () => {
      const sessionLines = Array.from({ length: 5 }, (_, i) => ({ text: `line ${i}` }));
      const sessionSnapshot = JSON.stringify({ lines: sessionLines });
      insertSession(db, 's-oob', sessionSnapshot);
      insertCliSection(db, 'cli-oob', 's-oob', 0, 100);

      migrate005SectionMetadata(db);

      const section = getSection(db, 'cli-oob');
      const parsed = JSON.parse(section['snapshot'] as string) as { lines: unknown[] };
      // Should not throw; clamps to 5 lines
      expect(parsed.lines.length).toBeLessThanOrEqual(5);
    });
  });

  describe('backfill: content_hash', () => {
    it('populates content_hash for sections with snapshot', () => {
      const snapshotJson = JSON.stringify({ lines: [{ text: 'hello' }] });
      insertSession(db, 's-hash');
      insertTuiSection(db, 'tui-hash', 's-hash', snapshotJson);

      migrate005SectionMetadata(db);

      const section = getSection(db, 'tui-hash');
      expect(section['content_hash']).not.toBeNull();
      expect(typeof section['content_hash']).toBe('string');
      // 16 hex chars (truncated SHA-256)
      expect((section['content_hash'] as string).length).toBe(16);
    });

    it('uses sentinel hash for sections with no snapshot', () => {
      insertSession(db, 's-no-snap');
      db.prepare(
        `INSERT INTO sections (id, session_id, type, start_event)
         VALUES ('empty-hash', 's-no-snap', 'detected', 0)`
      ).run();

      migrate005SectionMetadata(db);

      const section = getSection(db, 'empty-hash');
      expect(section['content_hash']).toBe(EMPTY_CONTENT_HASH);
    });

    it('sections with the same snapshot content get the same hash', () => {
      const snapshotJson = JSON.stringify({ lines: [{ text: 'same' }] });
      insertSession(db, 's-same-hash');
      insertTuiSection(db, 'tui-same-1', 's-same-hash', snapshotJson);
      insertTuiSection(db, 'tui-same-2', 's-same-hash', snapshotJson);

      migrate005SectionMetadata(db);

      const s1 = getSection(db, 'tui-same-1');
      const s2 = getSection(db, 'tui-same-2');
      expect(s1['content_hash']).toBe(s2['content_hash']);
    });

    it('sections with different snapshot content get different hashes', () => {
      insertSession(db, 's-diff-hash');
      insertTuiSection(db, 'tui-diff-1', 's-diff-hash', JSON.stringify({ lines: [{ text: 'a' }] }));
      insertTuiSection(db, 'tui-diff-2', 's-diff-hash', JSON.stringify({ lines: [{ text: 'b' }] }));

      migrate005SectionMetadata(db);

      const s1 = getSection(db, 'tui-diff-1');
      const s2 = getSection(db, 'tui-diff-2');
      expect(s1['content_hash']).not.toBe(s2['content_hash']);
    });
  });

  describe('sections table prerequisite check', () => {
    it('throws if sections table does not exist', () => {
      const freshDb = new Database(':memory:');
      freshDb.pragma('foreign_keys = ON');
      freshDb.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          filepath TEXT NOT NULL UNIQUE,
          size_bytes INTEGER NOT NULL,
          uploaded_at TEXT NOT NULL
        )
      `);
      expect(() => migrate005SectionMetadata(freshDb)).toThrow();
      freshDb.close();
    });
  });
});

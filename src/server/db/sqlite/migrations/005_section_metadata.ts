/**
 * Migration 005: Add section metadata columns.
 *
 * This migration:
 * 1. Adds `line_count INTEGER` to the sections table (nullable)
 * 2. Adds `content_hash TEXT` to the sections table (nullable)
 * 3. Adds `preview TEXT` to the sections table (nullable) -- VISIONBOOK item 5
 * 4. Backfills `line_count` for all existing sections
 * 5. Backfills `snapshot` for CLI sections (denormalization per ADR Decision 8)
 * 6. Backfills `content_hash` for all existing sections
 *
 * Idempotent — safe to run multiple times.
 * Wrapped in a transaction for atomicity.
 */

import { createHash } from 'node:crypto';
import Database from '../node_sqlite_compat.js';

/** Sentinel hash used for sections with no snapshot content (empty lines array). */
export const EMPTY_CONTENT_HASH = computeHash('[]');

/** Computes a truncated SHA-256 hash (16 hex chars) for the given content string. */
function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Asserts sections table exists — prerequisite for this migration. */
function assertSectionsTableExists(db: Database.Database): void {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sections'")
    .get();
  if (!row) {
    throw new Error('Sections table does not exist. Run 002-sections migration first.');
  }
}

/** Adds nullable columns to sections if they do not already exist. */
function addColumns(db: Database.Database): void {
  const cols = db.pragma('table_info(sections)') as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));

  if (!existing.has('line_count')) {
    db.exec('ALTER TABLE sections ADD COLUMN line_count INTEGER');
  }
  if (!existing.has('content_hash')) {
    db.exec('ALTER TABLE sections ADD COLUMN content_hash TEXT');
  }
  if (!existing.has('preview')) {
    db.exec('ALTER TABLE sections ADD COLUMN preview TEXT');
  }
}

/** Represents a raw section row fetched for backfill. */
interface BackfillSectionRow {
  id: string;
  session_id: string;
  snapshot: string | null;
  start_line: number | null;
  end_line: number | null;
}

/** Represents a session row fetched for CLI snapshot denormalization. */
interface SessionSnapshotRow {
  snapshot: string | null;
}

/** Parses a session snapshot JSON and returns the lines array (may be empty). */
function parseSessionLines(snapshotJson: string | null): unknown[] {
  if (!snapshotJson) return [];
  try {
    const parsed = JSON.parse(snapshotJson) as { lines?: unknown[] };
    return Array.isArray(parsed.lines) ? parsed.lines : [];
  } catch {
    return [];
  }
}

/** Counts lines from a section snapshot JSON string. Returns 0 on parse failure. */
function countSnapshotLines(snapshotJson: string | null): number {
  if (!snapshotJson) return 0;
  try {
    const parsed = JSON.parse(snapshotJson) as { lines?: unknown[] };
    return Array.isArray(parsed.lines) ? parsed.lines.length : 0;
  } catch {
    return 0;
  }
}

/** Builds the denormalized snapshot JSON for a CLI section by slicing session lines. */
function buildCliSnapshot(
  sessionLines: unknown[],
  startLine: number,
  endLine: number
): string {
  const safeEnd = Math.min(endLine, sessionLines.length);
  const safeStart = Math.min(startLine, safeEnd);
  return JSON.stringify({ lines: sessionLines.slice(safeStart, safeEnd) });
}

/** Computes line_count for a section. */
function computeLineCount(section: BackfillSectionRow, denormalizedSnapshot: string | null): number {
  // TUI sections already had a snapshot before this migration.
  if (section.snapshot !== null) {
    return countSnapshotLines(section.snapshot);
  }
  // CLI section with start/end_line: use the line range (authoritative).
  // This handles both: denormalized (snapshot from session) and no-session-snapshot cases.
  if (section.start_line !== null && section.end_line !== null) {
    return Math.max(0, section.end_line - section.start_line);
  }
  // CLI section after denormalization (denormalizedSnapshot may have fewer lines due to clamping).
  if (denormalizedSnapshot) {
    return countSnapshotLines(denormalizedSnapshot);
  }
  return 0;
}

/**
 * Backfills line_count, content_hash, and CLI section snapshots for all existing sections.
 * Each CLI section (snapshot=null, has start/end_line) gets its snapshot populated
 * from the parent session's snapshot — see ADR Decision 8.
 */
function backfillSections(db: Database.Database): void {
  const sections = db
    .prepare('SELECT id, session_id, snapshot, start_line, end_line FROM sections')
    .all() as BackfillSectionRow[];

  if (sections.length === 0) return;

  const getSessionSnapshot = db.prepare('SELECT snapshot FROM sessions WHERE id = ?');
  const updateSection = db.prepare(
    'UPDATE sections SET line_count = ?, content_hash = ?, snapshot = COALESCE(?, snapshot) WHERE id = ?'
  );

  // Cache session snapshots to avoid repeated DB reads for the same session.
  const sessionSnapshotCache = new Map<string, unknown[]>();

  for (const section of sections) {
    const isCliSection = section.snapshot === null && (
      section.start_line !== null || section.end_line !== null
    );

    let denormalizedSnapshot: string | null = null;

    if (isCliSection) {
      let sessionLines = sessionSnapshotCache.get(section.session_id);
      if (!sessionLines) {
        const row = getSessionSnapshot.get(section.session_id) as SessionSnapshotRow | undefined;
        sessionLines = parseSessionLines(row?.snapshot ?? null);
        sessionSnapshotCache.set(section.session_id, sessionLines);
      }
      const startLine = section.start_line ?? 0;
      const endLine = section.end_line ?? 0;
      denormalizedSnapshot = buildCliSnapshot(sessionLines, startLine, endLine);
    }

    const effectiveSnapshot = denormalizedSnapshot ?? section.snapshot;
    const lineCount = computeLineCount(section, denormalizedSnapshot);
    const contentHash = effectiveSnapshot
      ? computeHash(effectiveSnapshot)
      : EMPTY_CONTENT_HASH;

    updateSection.run(lineCount, contentHash, denormalizedSnapshot, section.id);
  }
}

/**
 * Applies migration 005: adds line_count, content_hash, and preview columns
 * to the sections table, then backfills all existing rows.
 */
export function migrate005SectionMetadata(db: Database.Database): void {
  assertSectionsTableExists(db);

  const runMigration = db.transaction(() => {
    addColumns(db);
    backfillSections(db);
  });

  runMigration();
}

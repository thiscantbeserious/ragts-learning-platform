/**
 * SQLite implementation of SessionAdapter.
 * Uses prepared statements for performance and safety.
 */

import Database from './node_sqlite_compat.js';
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import typia from 'typia';
import type { Session, SessionCreate } from '../../../shared/types/session.js';
import type { SessionAdapter } from '../session_adapter.js';
import type { DetectionStatus } from '../../../shared/types/pipeline.js';
import type { ProcessedSession } from '../../processing/types.js';
import type { CreateSectionInput } from '../section_adapter.js';

/** Sentinel hash for sections with no content (empty lines array). */
const EMPTY_CONTENT_HASH = computeContentHash('[]');

/** Computes a truncated SHA-256 hash (16 hex chars) for the given content string. */
function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Denormalizes a CLI section's snapshot by slicing the session-level snapshot.
 * Returns the JSON string to store in sections.snapshot.
 * If no session snapshot is available, returns an empty lines array.
 */
function buildDenormalizedSnapshot(
  sessionSnapshotJson: string,
  startLine: number,
  endLine: number
): string {
  let sessionLines: unknown[] = [];
  try {
    const parsed = JSON.parse(sessionSnapshotJson) as { lines?: unknown[] };
    if (Array.isArray(parsed.lines)) {
      sessionLines = parsed.lines;
    }
  } catch {
    // malformed session snapshot — return empty
  }
  const safeEnd = Math.min(endLine, sessionLines.length);
  const safeStart = Math.min(startLine, safeEnd);
  return JSON.stringify({ lines: sessionLines.slice(safeStart, safeEnd) });
}

/**
 * Computes the denormalized section fields (snapshot, lineCount, contentHash)
 * for a single section input during completeProcessing.
 * CLI sections get their snapshot populated from the session snapshot.
 * TUI sections retain their existing snapshot.
 */
function computeSectionFields(
  section: CreateSectionInput,
  sessionSnapshotJson: string
): { snapshot: string | null; lineCount: number; contentHash: string } {
  if (section.snapshot !== null) {
    // TUI section: snapshot already populated; compute hash and count.
    const lineCount = section.lineCount ?? countSnapshotLines(section.snapshot);
    const contentHash = computeContentHash(section.snapshot);
    return { snapshot: section.snapshot, lineCount, contentHash };
  }

  if (section.startLine !== null && section.endLine !== null) {
    // CLI section: denormalize from session snapshot.
    const snapshot = buildDenormalizedSnapshot(
      sessionSnapshotJson,
      section.startLine,
      section.endLine
    );
    const lineCount = Math.max(0, section.endLine - section.startLine);
    const contentHash = computeContentHash(snapshot);
    return { snapshot, lineCount, contentHash };
  }

  // Empty section (no snapshot, no line range).
  return { snapshot: null, lineCount: 0, contentHash: EMPTY_CONTENT_HASH };
}

/** Counts lines in a JSON snapshot string. Returns 0 on parse failure. */
function countSnapshotLines(snapshotJson: string): number {
  try {
    const parsed = JSON.parse(snapshotJson) as { lines?: unknown[] };
    return Array.isArray(parsed.lines) ? parsed.lines.length : 0;
  } catch {
    return 0;
  }
}

/**
 * SQLite-backed session implementation.
 * All methods use prepared statements.
 */
export class SqliteSessionImpl implements SessionAdapter {
  private readonly insertStmt: Database.Statement;
  private readonly findAllStmt: Database.Statement;
  private readonly findByIdStmt: Database.Statement;
  private readonly deleteByIdStmt: Database.Statement;
  private readonly updateDetectionStatusStmt: Database.Statement;
  private readonly updateSnapshotStmt: Database.Statement;
  private readonly deleteSectionsStmt: Database.Statement;
  private readonly insertSectionStmt: Database.Statement;
  private readonly completeProcessingTxn: (session: ProcessedSession) => void;

  private readonly findByStatusesFn: (statuses: DetectionStatus[]) => Session[];

  constructor(db: Database.Database) {
    // Prepare statements once at construction
    this.insertStmt = db.prepare(`
      INSERT INTO sessions (id, filename, filepath, size_bytes, marker_count, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Exclude snapshot column from list view (too large)
    this.findAllStmt = db.prepare(`
      SELECT id, filename, filepath, size_bytes, marker_count, uploaded_at,
             created_at, agent_type, event_count, detected_sections_count,
             detection_status
      FROM sessions
      ORDER BY uploaded_at DESC
    `);

    // Include snapshot column for detail view
    this.findByIdStmt = db.prepare(`
      SELECT * FROM sessions
      WHERE id = ?
    `);

    this.deleteByIdStmt = db.prepare(`
      DELETE FROM sessions
      WHERE id = ?
    `);

    this.updateDetectionStatusStmt = db.prepare(`
      UPDATE sessions
      SET detection_status = ?,
          event_count = COALESCE(?, event_count),
          detected_sections_count = COALESCE(?, detected_sections_count)
      WHERE id = ?
    `);

    this.updateSnapshotStmt = db.prepare(`
      UPDATE sessions
      SET snapshot = ?
      WHERE id = ?
    `);

    // Section statements for completeProcessing — duplicated from SqliteSectionImpl
    // to keep adapter implementations decoupled. This is intentional (see ADR decision #7).
    this.deleteSectionsStmt = db.prepare(`
      DELETE FROM sections WHERE session_id = ?
    `);

    this.insertSectionStmt = db.prepare(`
      INSERT INTO sections (id, session_id, type, start_event, end_event, label, snapshot, start_line, end_line, line_count, content_hash, preview)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Pre-prepare statements for status filtering. Closure captures db without
    // storing it as a class field (adapter pattern). Typia validates each status
    // at runtime against the DetectionStatus union — rejects invalid values before
    // they reach SQL. Statements are cached per cardinality to avoid re-preparing.
    const statusStmtCache = new Map<number, Database.Statement>();
    this.findByStatusesFn = (statuses: DetectionStatus[]) => {
      if (statuses.length === 0) return [];
      // Runtime type guard via typia — ensures only valid DetectionStatus values reach SQL
      for (const s of statuses) {
        if (!typia.is<DetectionStatus>(s)) {
          throw new Error(`Invalid detection status: ${String(s)}`);
        }
      }
      const n = statuses.length;
      let stmt = statusStmtCache.get(n);
      if (!stmt) {
        const placeholders = Array.from({ length: n }, () => '?').join(', ');
        stmt = db.prepare(
          `SELECT * FROM sessions WHERE detection_status IN (${placeholders}) ORDER BY created_at DESC`
        );
        statusStmtCache.set(n, stmt);
      }
      return stmt.all(...statuses) as Session[];
    };

    this.completeProcessingTxn = db.transaction((session: ProcessedSession) => {
      this.deleteSectionsStmt.run(session.sessionId);
      for (const section of session.sections) {
        // Denormalize CLI sections and compute metadata for all sections.
        // session.snapshot is already available in this transaction.
        const { snapshot, lineCount, contentHash } = computeSectionFields(
          section,
          session.snapshot
        );
        this.insertSectionStmt.run(
          nanoid(),
          section.sessionId,
          section.type,
          section.startEvent,
          section.endEvent,
          section.label,
          snapshot,
          section.startLine,
          section.endLine,
          lineCount,
          contentHash,
          section.preview ?? null
        );
      }
      this.updateSnapshotStmt.run(session.snapshot, session.sessionId);
      this.updateDetectionStatusStmt.run(
        'completed',
        session.eventCount,
        session.detectedSectionsCount,
        session.sessionId
      );
    });
  }

  async create(data: SessionCreate): Promise<Session> {
    const id = nanoid();
    return this.createWithId(id, data);
  }

  async createWithId(id: string, data: SessionCreate): Promise<Session> {
    this.insertStmt.run(
      id,
      data.filename,
      data.filepath,
      data.size_bytes,
      data.marker_count,
      data.uploaded_at
    );

    // Retrieve the created session to get generated created_at
    const session = this.findByIdStmt.get(id) as Session;
    return session;
  }

  async findAll(): Promise<Session[]> {
    return this.findAllStmt.all() as Session[];
  }

  async findByStatuses(statuses: DetectionStatus[]): Promise<Session[]> {
    return this.findByStatusesFn(statuses);
  }

  async findById(id: string): Promise<Session | null> {
    const session = this.findByIdStmt.get(id) as Session | undefined;
    return session || null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update session detection status and metadata.
   * Used after processing a session for section detection.
   */
  async updateDetectionStatus(
    id: string,
    status: DetectionStatus,
    eventCount?: number,
    detectedSectionsCount?: number
  ): Promise<void> {
    this.updateDetectionStatusStmt.run(
      status,
      eventCount ?? null,
      detectedSectionsCount ?? null,
      id
    );
  }

  /**
   * Update the unified snapshot for a session.
   * Stores the full getAllLines() JSON from the VT terminal.
   */
  async updateSnapshot(id: string, snapshot: string): Promise<void> {
    this.updateSnapshotStmt.run(snapshot, id);
  }

  /**
   * Complete session processing atomically.
   * Replaces all sections, stores the snapshot, and marks the session as completed
   * in a single synchronous db.transaction() — no partial state possible.
   */
  async completeProcessing(session: ProcessedSession): Promise<void> {
    this.completeProcessingTxn(session);
  }
}

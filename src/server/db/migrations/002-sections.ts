/**
 * Migration 002: Add sections table and session processing metadata.
 *
 * This migration:
 * 1. Adds processing metadata columns to sessions table (agent_type, event_count, detection metadata)
 * 2. Creates sections table for storing both marker-based and detected sections
 * 3. Creates indexes for efficient querying
 *
 * Idempotent - safe to run multiple times.
 */

import type Database from 'better-sqlite3';

export function migrate002Sections(db: Database.Database): void {
  // Check if sessions table exists before altering
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get();

  if (!tableExists) {
    throw new Error('Sessions table does not exist. Run base schema first.');
  }

  // Add new columns to sessions table
  // Check if each column exists before adding it (idempotency)
  const sessionColumns = db.pragma('table_info(sessions)');
  const columnNames = sessionColumns.map((col: any) => col.name);

  if (!columnNames.includes('agent_type')) {
    db.exec('ALTER TABLE sessions ADD COLUMN agent_type TEXT');
  }

  if (!columnNames.includes('event_count')) {
    db.exec('ALTER TABLE sessions ADD COLUMN event_count INTEGER');
  }

  if (!columnNames.includes('detected_sections_count')) {
    db.exec('ALTER TABLE sessions ADD COLUMN detected_sections_count INTEGER DEFAULT 0');
  }

  if (!columnNames.includes('detection_status')) {
    db.exec('ALTER TABLE sessions ADD COLUMN detection_status TEXT DEFAULT \'pending\'');
  }

  // Create sections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      start_event INTEGER NOT NULL,
      end_event INTEGER,
      label TEXT,
      snapshot TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for efficient querying
  db.exec('CREATE INDEX IF NOT EXISTS idx_sections_session_id ON sections(session_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sections_start_event ON sections(session_id, start_event)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_agent_type ON sessions(agent_type)');
}

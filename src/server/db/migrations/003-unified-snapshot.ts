/**
 * Migration 003: Add unified snapshot model.
 *
 * This migration:
 * 1. Adds snapshot column to sessions table (stores full getAllLines() JSON)
 * 2. Adds start_line and end_line columns to sections table for line-range based rendering
 *
 * The existing sections.snapshot column is kept and repurposed for TUI sections
 * where viewport rendering is still needed. For CLI sessions, the unified snapshot
 * in sessions table + line ranges in sections table is sufficient.
 *
 * Idempotent - safe to run multiple times.
 */

import type Database from 'better-sqlite3';

export function migrate003UnifiedSnapshot(db: Database.Database): void {
  // Check if sessions table exists before altering
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
    .get();

  if (!tableExists) {
    throw new Error('Sessions table does not exist. Run base schema first.');
  }

  // Check if sections table exists
  const sectionsTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sections'")
    .get();

  if (!sectionsTableExists) {
    throw new Error('Sections table does not exist. Run 002-sections migration first.');
  }

  // Add snapshot column to sessions table
  const sessionColumns = db.pragma('table_info(sessions)');
  const sessionColumnNames = sessionColumns.map((col: any) => col.name);

  if (!sessionColumnNames.includes('snapshot')) {
    db.exec('ALTER TABLE sessions ADD COLUMN snapshot TEXT');
  }

  // Add start_line and end_line columns to sections table
  const sectionColumns = db.pragma('table_info(sections)');
  const sectionColumnNames = sectionColumns.map((col: any) => col.name);

  if (!sectionColumnNames.includes('start_line')) {
    db.exec('ALTER TABLE sections ADD COLUMN start_line INTEGER');
  }

  if (!sectionColumnNames.includes('end_line')) {
    db.exec('ALTER TABLE sections ADD COLUMN end_line INTEGER');
  }
}

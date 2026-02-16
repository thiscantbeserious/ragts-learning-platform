/**
 * Database initialization and connection management.
 * Creates SQLite database, applies schema, and enables recommended settings.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize SQLite database with schema and recommended settings.
 * Creates data directory if it doesn't exist.
 * Enables WAL mode for better concurrent read performance.
 * Enables foreign key constraints.
 */
export function initDatabase(dbPath: string): Database.Database {
  // Create parent directory if it doesn't exist
  const dbDir = dirname(dbPath);
  mkdirSync(dbDir, { recursive: true });

  // Open database connection
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign key constraints
  db.pragma('foreign_keys = ON');

  // Apply schema from schema.sql
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  return db;
}

/**
 * Migration integration test script.
 *
 * Creates a fresh in-memory SQLite database, auto-discovers all migration
 * files in src/server/db/sqlite/migrations/, runs them in order with timing,
 * then reports the resulting schema. Exits 0 on success, 1 on failure.
 *
 * New migrations are picked up automatically — no edits to this file needed.
 *
 * Run with: npx tsx scripts/test_migrations.ts
 */

import Database from 'better-sqlite3';
import { readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = resolve(__dirname, '../src/server/db/sqlite/migrations');

// Base schema mirrors SqliteDatabaseImpl.BASE_SCHEMA in sqlite_database_impl.ts
const BASE_SCHEMA = `
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
`.trim();

// ---------------------------------------------------------------------------
// Migration discovery
// ---------------------------------------------------------------------------

/** Resolves all migration files sorted by filename (excludes test files). */
function discoverMigrationFiles(): string[] {
  const entries = readdirSync(MIGRATIONS_DIR);
  return entries
    .filter((f) => /^\d{3}_/.test(f) && f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

type SqliteMasterRow = { name: string; tbl_name: string };
type PragmaTableInfoRow = { cid: number; name: string; type: string };

/** Returns all user table names from sqlite_master, sorted. */
function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as SqliteMasterRow[];
  return rows.map((r) => r.name);
}

/** Returns all user index names from sqlite_master, sorted. */
function listIndexes(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as SqliteMasterRow[];
  return rows.map((r) => r.name);
}

/** Returns column definitions for a table as "name TYPE" strings, ordered by cid. */
function listColumns(db: Database.Database, tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as PragmaTableInfoRow[];
  return rows.map((r) => `${r.name} ${r.type}`);
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/** Applies the base schema as step 1, then runs each discovered migration. */
async function runMigrations(db: Database.Database): Promise<number> {
  console.log('\nRunning migrations on fresh database...');

  const t0 = Date.now();
  db.exec(BASE_SCHEMA);
  console.log(`  Step 1: base schema ... OK (${Date.now() - t0}ms)`);

  const migrationFiles = discoverMigrationFiles();

  for (let i = 0; i < migrationFiles.length; i++) {
    const filePath = migrationFiles[i];
    const label = filePath.split('/').pop() ?? filePath;
    const stepStart = Date.now();

    const mod = await import(filePath) as Record<string, unknown>;
    const migrateFn = findMigrateFunction(mod, label);
    migrateFn(db);

    console.log(`  Step ${i + 2}: ${label} ... OK (${Date.now() - stepStart}ms)`);
  }

  // +1 for base schema
  return migrationFiles.length + 1;
}

/** Extracts the single exported migration function from a module. */
function findMigrateFunction(mod: Record<string, unknown>, label: string): (db: Database.Database) => void {
  const fns = Object.values(mod).filter((v) => typeof v === 'function');
  if (fns.length === 0) {
    throw new Error(`Migration ${label} exports no functions.`);
  }
  return fns[0] as (db: Database.Database) => void;
}

// ---------------------------------------------------------------------------
// Schema reporter
// ---------------------------------------------------------------------------

/** Prints schema summary and returns counts. */
function reportSchema(db: Database.Database): { tableCount: number; indexCount: number } {
  const tables = listTables(db);
  const indexes = listIndexes(db);

  console.log('\nSchema after all migrations:');
  console.log(`  Tables:  ${tables.join(', ')}`);
  console.log(`  Indexes: ${indexes.join(', ')}`);

  console.log('\nColumn schemas:');
  for (const table of tables) {
    const cols = listColumns(db, table);
    console.log(`  Table '${table}':`);
    console.log(`    ${cols.join(', ')}`);
  }

  return { tableCount: tables.length, indexCount: indexes.length };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

try {
  const stepCount = await runMigrations(db);
  const { tableCount, indexCount } = reportSchema(db);

  console.log(`\n[SUCCESS] ${stepCount} migrations applied, ${tableCount} tables, ${indexCount} indexes\n`);
  process.exit(0);
} catch (err) {
  console.error('\n[ERROR] Migration run failed:', err);
  process.exit(1);
} finally {
  db.close();
}

/**
 * Schema snapshot test for SQLite migrations.
 *
 * Auto-discovers migration files from src/server/db/sqlite/migrations/,
 * applies base schema + each migration sequentially on a single in-memory DB
 * (mirroring the production migration path), and snapshots the full schema
 * state after each step.
 *
 * The committed .snap file serves as the schema record — git diff shows
 * exactly what each migration changes.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { BASE_SCHEMA } from '../../src/server/db/sqlite/sqlite_database_impl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'src/server/db/sqlite/migrations');

// ---------------------------------------------------------------------------
// Schema capture
// ---------------------------------------------------------------------------

interface SchemaEntry {
  type: string;
  name: string;
  table_name: string;
  sql: string | null;
}

interface SchemaSnapshot {
  entries: SchemaEntry[];
}

/**
 * Captures the full schema from sqlite_master.
 * Includes complete DDL for tables, indexes, triggers, and views.
 */
function capture_schema(db: DatabaseType): SchemaSnapshot {
  const entries = db
    .prepare(
      `SELECT type, name, tbl_name AS table_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all() as SchemaEntry[];
  return { entries };
}

// ---------------------------------------------------------------------------
// Migration discovery
// ---------------------------------------------------------------------------

interface MigrationModule {
  [key: string]: (db: DatabaseType) => void;
}

/** Discovers migration files matching /^\d{3}_.*\.ts$/ excluding .test.ts files. */
function discover_migration_files(): string[] {
  const entries = readdirSync(MIGRATIONS_DIR);
  return entries
    .filter((f) => /^\d{3}_.*\.ts$/.test(f) && !f.endsWith('.test.ts'))
    .sort();
}

/** Loads and returns the single exported migration function from a file. */
async function load_migration_fn(
  file_name: string,
): Promise<(db: DatabaseType) => void> {
  const file_path = join(MIGRATIONS_DIR, file_name);
  const mod = (await import(file_path)) as MigrationModule;
  const fn_keys = Object.keys(mod).filter((k) => typeof mod[k] === 'function');

  if (fn_keys.length !== 1) {
    throw new Error(
      `Migration ${file_name} must export exactly one function, found: ${fn_keys.join(', ')}`,
    );
  }

  return mod[fn_keys[0] as string] as (db: DatabaseType) => void;
}

// ---------------------------------------------------------------------------
// Schema logging
// ---------------------------------------------------------------------------

/** Logs the full schema DDL after each migration step. */
function log_schema_summary(label: string, schema: SchemaSnapshot): void {
  const tables = schema.entries.filter((e) => e.type === 'table');
  const indexes = schema.entries.filter((e) => e.type === 'index');
  console.log(`\n  ${label}: ${tables.length} tables, ${indexes.length} indexes\n`);
  for (const entry of schema.entries) {
    if (entry.sql) {
      console.log(`    [${entry.type}] ${entry.sql};\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.sequential('SQLite schema migrations', () => {
  const migration_files = discover_migration_files();
  const db = new Database(':memory:');

  console.log(`\nDiscovered ${migration_files.length} migrations:`);
  for (const f of migration_files) {
    console.log(`  - ${f}`);
  }

  afterAll(() => {
    db.close();
    console.log(`\n[OK] ${migration_files.length + 1} schema snapshots verified\n`);
  });

  it('step 0: base schema', () => {
    db.exec(BASE_SCHEMA);
    const schema = capture_schema(db);
    expect(schema).toMatchSnapshot();
    log_schema_summary('base schema', schema);
  });

  for (const [index, file_name] of migration_files.entries()) {
    it(`step ${index + 1}: ${file_name}`, async () => {
      const migrate = await load_migration_fn(file_name);
      migrate(db);
      const schema = capture_schema(db);
      expect(schema).toMatchSnapshot();
      log_schema_summary(`after ${file_name}`, schema);
    });
  }
});

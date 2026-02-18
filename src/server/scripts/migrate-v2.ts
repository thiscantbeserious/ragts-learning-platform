/**
 * Migration CLI for v2 schema - processes existing sessions through the pipeline.
 *
 * This script iterates over all sessions with detection_status != 'completed'
 * and runs them through the session processing pipeline to populate sections
 * and snapshots.
 *
 * Usage:
 *   npm run migrate:v2
 *   or
 *   npx tsx src/server/scripts/migrate-v2.ts
 */

import type Database from 'better-sqlite3';
import { initDatabase } from '../db/database.js';
import { SqliteSessionRepository } from '../db/sqlite-session-repository.js';
import { SqliteSectionRepository } from '../db/sqlite-section-repository.js';
import { processSessionPipeline } from '../processing/session-pipeline.js';
import { NdjsonStream } from '../processing/ndjson-stream.js';
import { extractMarkers, computeCumulativeTimes } from '../../shared/asciicast.js';
import type { AsciicastEvent, AsciicastHeader, Marker } from '../../shared/asciicast-types.js';
import { loadConfig } from '../config.js';
import { join } from 'path';

/**
 * Result of the migration operation.
 */
export interface MigrationResult {
  processed: number;
  skipped: number;
  failed: number;
}

/**
 * Core migration function - testable without CLI dependencies.
 *
 * Processes all sessions where detection_status is NOT 'completed'.
 * For each session:
 * 1. Reads the .cast file to extract markers
 * 2. Calls processSessionPipeline to detect sections and generate snapshots
 * 3. Updates session metadata (detection_status, event_count, detected_sections_count)
 *
 * Error handling:
 * - If a session fails, logs the error and continues with the next session
 * - Sets detection_status to 'failed' for sessions that error
 * - Returns summary of processed/skipped/failed sessions
 *
 * @param db - Database connection
 * @returns Migration result summary
 */
export async function migrateV2(db: Database.Database): Promise<MigrationResult> {
  const sessionRepo = new SqliteSessionRepository(db);
  const sectionRepo = new SqliteSectionRepository(db);

  // Get all sessions
  const allSessions = sessionRepo.findAll();

  // Filter sessions that need processing (not yet completed)
  const sessionsToProcess = allSessions.filter(
    (s) => s.detection_status !== 'completed'
  );

  const total = sessionsToProcess.length;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Migration v2: Found ${total} sessions to process`);

  for (let i = 0; i < sessionsToProcess.length; i++) {
    const session = sessionsToProcess[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      console.log(`${progress} Processing session: ${session.filename} (${session.id})`);

      // Read .cast file to extract markers
      const markers = await extractMarkersFromFile(session.filepath);

      // Run pipeline
      await processSessionPipeline(
        session.filepath,
        session.id,
        markers,
        sectionRepo,
        sessionRepo
      );

      processed++;
      console.log(`${progress} Success: ${session.filename}`);
    } catch (error) {
      failed++;
      console.error(
        `${progress} Failed: ${session.filename} - ${error instanceof Error ? error.message : String(error)}`
      );
      // Pipeline sets detection_status to 'failed', but ensure it's set even if pipeline doesn't run
      try {
        sessionRepo.updateDetectionStatus(session.id, 'failed');
      } catch (updateError) {
        // Ignore update errors
      }
    }
  }

  // After existing migration, reprocess sessions missing unified snapshot
  console.log('');
  console.log('Checking for sessions without unified snapshot...');
  const allSessionsAfterMigration = sessionRepo.findAll();
  let reprocessed = 0;

  for (let i = 0; i < allSessionsAfterMigration.length; i++) {
    const sessionSummary = allSessionsAfterMigration[i];
    const fullSession = sessionRepo.findById(sessionSummary.id);

    if (!fullSession) {
      console.log(`Session ${sessionSummary.id} not found, skipping`);
      continue;
    }

    // Check if session lacks snapshot
    if (!fullSession.snapshot) {
      const progress = `[${i + 1}/${allSessionsAfterMigration.length}]`;
      console.log(`${progress} Reprocessing session ${fullSession.id} (${fullSession.filename}) for unified snapshot...`);

      try {
        // Read .cast file to extract markers
        const markers = await extractMarkersFromFile(fullSession.filepath);

        // Re-run pipeline to generate the new hybrid data
        await processSessionPipeline(
          fullSession.filepath,
          fullSession.id,
          markers,
          sectionRepo,
          sessionRepo
        );

        reprocessed++;
        console.log(`${progress} Reprocessed: ${fullSession.filename}`);
      } catch (error) {
        console.error(
          `${progress} Reprocess failed: ${fullSession.filename} - ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const result: MigrationResult = {
    processed,
    skipped: allSessions.length - sessionsToProcess.length,
    failed,
  };

  console.log('');
  console.log('Migration v2 complete:');
  console.log(`  Processed:    ${result.processed}`);
  console.log(`  Skipped:      ${result.skipped}`);
  console.log(`  Failed:       ${result.failed}`);
  console.log(`  Reprocessed:  ${reprocessed}`);

  return result;
}

/**
 * Extract markers from a .cast file by parsing events.
 *
 * @param filePath - Path to .cast file
 * @returns Array of markers with event indices
 */
async function extractMarkersFromFile(filePath: string): Promise<Marker[]> {
  let header: AsciicastHeader | null = null;
  const events: AsciicastEvent[] = [];
  const stream = new NdjsonStream(filePath);

  for await (const item of stream) {
    if (item.header) {
      header = item.header as AsciicastHeader;
    }
    if (item.event) {
      events.push(item.event as AsciicastEvent);
    }
  }

  if (!header) {
    throw new Error('No header found in .cast file');
  }

  // Convert relative timestamps to cumulative
  const parsedEvents = computeCumulativeTimes(events);

  // Extract markers
  const markers = extractMarkers(parsedEvents);

  return markers;
}

/**
 * CLI entry point - called when script is run directly.
 */
async function main() {
  const config = loadConfig();
  const dbPath = join(config.dataDir, 'ragts.db');

  console.log('RAGTS v2 Migration Tool');
  console.log('=======================');
  console.log(`Database: ${dbPath}`);
  console.log('');

  const db = initDatabase(dbPath);

  try {
    await migrateV2(db);
  } finally {
    db.close();
  }

  console.log('');
  console.log('Migration complete!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

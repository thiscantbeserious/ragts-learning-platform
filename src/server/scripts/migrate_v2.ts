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

import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import { processSessionPipeline } from '../processing/session_pipeline.js';
import { NdjsonStream } from '../processing/ndjson_stream.js';
import { extractMarkers, computeCumulativeTimes } from '../../shared/parsers/asciicast.js';
import type { AsciicastEvent, AsciicastHeader, Marker } from '../../shared/types/asciicast.js';
import { loadConfig } from '../config.js';

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
 * @param sessionRepo - Session adapter
 * @returns Migration result summary
 */
export async function migrateV2(
  sessionRepo: SessionAdapter
): Promise<MigrationResult> {
  const allSessions = await sessionRepo.findAll();
  const sessionsToProcess = allSessions.filter(
    (s) => s.detection_status !== 'completed'
  );

  console.log(`Migration v2: Found ${sessionsToProcess.length} sessions to process`);

  const { processed, failed } = await processPendingSessions(
    sessionsToProcess, sessionRepo
  );

  console.log('');
  console.log('Checking for sessions without unified snapshot...');

  const reprocessed = await reprocessMissingSnapshots(sessionRepo);

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

async function processPendingSessions(
  sessions: import('../../shared/types/session.js').Session[],
  sessionRepo: SessionAdapter
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (session === undefined) continue;
    const progress = `[${i + 1}/${sessions.length}]`;

    try {
      console.log(`${progress} Processing session: ${session.filename} (${session.id})`);
      const markers = await extractMarkersFromFile(session.filepath);
      await processSessionPipeline(session.filepath, session.id, markers, sessionRepo);
      processed++;
      console.log(`${progress} Success: ${session.filename}`);
    } catch (error) {
      failed++;
      console.error(`${progress} Failed: ${session.filename} - ${error instanceof Error ? error.message : String(error)}`);
      try {
        await sessionRepo.updateDetectionStatus(session.id, 'failed');
      } catch {
        // Ignore update errors
      }
    }
  }

  return { processed, failed };
}

async function reprocessMissingSnapshots(
  sessionRepo: SessionAdapter
): Promise<number> {
  const allSessions = await sessionRepo.findAll();
  let reprocessed = 0;

  for (let i = 0; i < allSessions.length; i++) {
    const sessionEntry = allSessions[i];
    if (sessionEntry === undefined) continue;
    const fullSession = await sessionRepo.findById(sessionEntry.id);
    if (!fullSession || fullSession.snapshot) continue;

    const progress = `[${i + 1}/${allSessions.length}]`;
    console.log(`${progress} Reprocessing session ${fullSession.id} (${fullSession.filename}) for unified snapshot...`);

    try {
      const markers = await extractMarkersFromFile(fullSession.filepath);
      await processSessionPipeline(fullSession.filepath, fullSession.id, markers, sessionRepo);
      reprocessed++;
      console.log(`${progress} Reprocessed: ${fullSession.filename}`);
    } catch (error) {
      console.error(`${progress} Reprocess failed: ${fullSession.filename} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return reprocessed;
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

  console.log('RAGTS v2 Migration Tool');
  console.log('=======================');
  console.log(`Data directory: ${config.dataDir}`);
  console.log('');

  const impl = new SqliteDatabaseImpl();
  const ctx = await impl.initialize({ dataDir: config.dataDir });

  try {
    await migrateV2(ctx.sessionRepository);
  } finally {
    await ctx.close();
  }

  console.log('');
  console.log('Migration complete!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

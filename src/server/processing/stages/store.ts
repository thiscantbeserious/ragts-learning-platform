/**
 * Store stage: atomically persists the ProcessedSession via sessionRepository.
 *
 * Extracted from processSessionPipeline step 5 (sessionRepo.completeProcessing).
 * Pure async function — no parsing, no WASM, just DB persistence.
 * The orchestrator emits `session.ready` after this stage succeeds.
 */

import type { SessionAdapter } from '../../db/session_adapter.js';
import type { ProcessedSession } from '../types.js';

/**
 * Persist a processed session atomically.
 * Delegates to sessionAdapter.completeProcessing — all sections, snapshot,
 * and detection_status are written in a single transaction.
 */
export async function store(
  processed: ProcessedSession,
  sessionAdapter: SessionAdapter
): Promise<void> {
  await sessionAdapter.completeProcessing(processed);
}

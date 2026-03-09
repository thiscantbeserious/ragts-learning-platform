/**
 * Output types for the session processing pipeline.
 *
 * ProcessedSession is the complete result of processing a .cast file:
 * sections detected, snapshot captured, and metadata computed.
 * It is the payload passed to SessionAdapter.completeProcessing() for atomic persistence.
 */

import type { CreateSectionInput } from '../db/section_adapter.js';

/**
 * Complete output of session processing.
 * Passed to SessionAdapter.completeProcessing() to atomically persist
 * the snapshot, sections, and status in one transaction.
 */
export interface ProcessedSession {
  sessionId: string;
  /** JSON-serialized TerminalSnapshot from the full session document. */
  snapshot: string;
  /** All sections to persist (replaces any existing sections). */
  sections: CreateSectionInput[];
  eventCount: number;
  detectedSectionsCount: number;
}

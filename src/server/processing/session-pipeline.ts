/**
 * Session Processing Pipeline - Orchestrates detection + snapshot generation + DB storage.
 *
 * Single-pass file read: reads the .cast file once, collecting both the header
 * and events. Then runs detection on the in-memory events, generates snapshots
 * using the VT engine, and stores everything in the DB.
 *
 * High-level flow:
 * 1. Set detection_status to 'processing'
 * 2. Read header + events from .cast file (single pass)
 * 3. Run SectionDetector to get boundaries
 * 4. Generate snapshots by replaying events through VT at boundary indices
 * 5. Delete existing sections for this session
 * 6. Create sections in DB (markers + detected) with snapshots
 * 7. Update session metadata (detection_status, event_count, detected_sections_count)
 * 8. On error: set detection_status to 'failed'
 */

import type { SqliteSectionRepository } from '../db/sqlite-section-repository.js';
import type { SessionRepository } from '../db/session-repository.js';
import type { Marker, AsciicastEvent, AsciicastHeader } from '../../shared/asciicast-types.js';
import { NdjsonStream } from './ndjson-stream.js';
import { SectionDetector } from './section-detector.js';
import { createVt, initVt, type TerminalSnapshot } from '../../../packages/vt-wasm/index.js';

/**
 * Process a session: detect sections, capture snapshots, store in DB.
 *
 * This function is async and should be called with fire-and-forget semantics
 * (e.g., via setImmediate or setTimeout) after upload succeeds.
 *
 * @param filePath - Path to the .cast file
 * @param sessionId - Session ID in database
 * @param markers - Array of markers from the .cast file
 * @param sectionRepo - Section repository for DB operations
 * @param sessionRepo - Session repository for DB operations
 */
export async function processSessionPipeline(
  filePath: string,
  sessionId: string,
  markers: Marker[],
  sectionRepo: SqliteSectionRepository,
  sessionRepo: SessionRepository
): Promise<void> {
  try {
    // Initialize WASM module (safe to call multiple times)
    await initVt();

    // Set status to processing
    sessionRepo.updateDetectionStatus(sessionId, 'processing');

    // Step 1: Read header + events from .cast file (single pass)
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

    const eventCount = events.length;

    // Step 2: Run SectionDetector to get boundaries
    const detector = new SectionDetector(events);
    const boundaries = detector.detectWithMarkers(markers);

    // Step 3: Generate snapshots by replaying events through VT
    const boundarySet = new Set(boundaries.map((b) => b.eventIndex));
    const snapshotMap = new Map<number, TerminalSnapshot>();
    const vt = createVt(header.width, header.height);

    for (let i = 0; i < events.length; i++) {
      const [, eventType, data] = events[i];
      if (eventType === 'o') {
        vt.feed(String(data));
      }
      if (boundarySet.has(i)) {
        snapshotMap.set(i, vt.getView());
      }
    }

    // Step 4: Delete existing sections for this session (replace all)
    sectionRepo.deleteBySessionId(sessionId);

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const snapshot = snapshotMap.get(boundary.eventIndex);

      // Calculate end_event: next boundary's start or total event count
      const endEvent = i < boundaries.length - 1
        ? boundaries[i + 1].eventIndex
        : eventCount;

      // Determine section type: marker if it came from a marker, detected otherwise
      const isMarker = boundary.signals.includes('marker');
      const type = isMarker ? 'marker' : 'detected';

      sectionRepo.create({
        sessionId,
        type,
        startEvent: boundary.eventIndex,
        endEvent,
        label: boundary.label,
        snapshot: snapshot ? JSON.stringify(snapshot) : null,
      });
    }

    // Step 6: Count detected sections (exclude markers)
    const detectedSectionsCount = boundaries.filter(
      (b) => !b.signals.includes('marker')
    ).length;

    // Step 7: Update session metadata
    sessionRepo.updateDetectionStatus(
      sessionId,
      'completed',
      eventCount,
      detectedSectionsCount
    );
  } catch (error) {
    // On error: set detection_status to 'failed'
    console.error(`Session processing failed for ${sessionId}:`, error);
    sessionRepo.updateDetectionStatus(sessionId, 'failed');
  }
}

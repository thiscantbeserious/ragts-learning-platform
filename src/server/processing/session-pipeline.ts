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
import { normalizeHeader } from '../../shared/asciicast.js';
import { NdjsonStream } from './ndjson-stream.js';
import { SectionDetector } from './section-detector.js';
import { createVt, initVt, type TerminalSnapshot } from '../../../packages/vt-wasm/index.js';
import { buildCleanDocument, type EpochBoundary } from './scrollback-dedup.js';

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

    // Normalize header (v3 term.cols/rows → width/height)
    header = normalizeHeader(header as Record<string, any>);

    const eventCount = events.length;

    // Step 2: Run SectionDetector to get boundaries
    const detector = new SectionDetector(events);
    const boundaries = detector.detectWithMarkers(markers);

    // Synthesize preamble boundary when markers exist and first marker isn't at event 0.
    // Only for marker-based sessions — for pure auto-detected sections, the detector
    // already determines where content starts; adding a preamble would just dump
    // the entire scrollback buffer into one massive section.
    const hasMarkerBoundary = boundaries.some(b => b.signals.includes('marker'));
    if (hasMarkerBoundary && boundaries.length > 0 && boundaries[0].eventIndex > 0) {
      const hasPreContent = events.slice(0, boundaries[0].eventIndex).some(e => e[1] === 'o');
      if (hasPreContent) {
        boundaries.unshift({
          eventIndex: 0,
          score: Infinity,
          signals: ['preamble'],
          label: 'Preamble',
        });
      }
    }

    // Step 3: Hybrid snapshot capture - CLI sections get line ranges, TUI sections get viewport snapshots.
    // Track alt-screen state during VT replay:
    // - At CLI boundaries: record line count from getAllLines() for range calculation
    // - At TUI boundaries (during alt-screen): capture getView() as section viewport snapshot
    // - At end: capture getAllLines() as full session document
    //
    // Previous approaches that failed:
    // - Delta (nextSnapshot.lines.slice(currentSnapshot.lines.length)): breaks
    //   when scrollback hits the limit — both snapshots have same line count.
    // - Fresh VT per section: loses terminal state, TUI sections all look identical.
    // - All sections as viewport snapshots: produces duplicate content for CLI sessions.

    // Step 4: Delete existing sections for this session (replace all)
    sectionRepo.deleteBySessionId(sessionId);

    // Always replay events through VT to capture the full session document.
    // Even with zero boundaries, the session needs its full snapshot for rendering.
    // Large scrollback ensures getAllLines() captures the full session document.
    // Without this, line counts plateau and sections beyond the limit get degraded
    // to viewport-only snapshots (terminal height lines instead of full content).
    const vt = createVt(header.width, header.height, 200000);

    // Build a map of section end events → boundary index for O(1) lookup during replay
    const sectionEndEvents: Map<number, number> = new Map();
    for (let i = 0; i < boundaries.length; i++) {
      const endEvent = i < boundaries.length - 1
        ? boundaries[i + 1].eventIndex
        : eventCount;
      sectionEndEvents.set(endEvent, i);
    }

    // Track alt-screen state during replay
    let inAltScreen = false;
    // highWaterLineCount tracks the max line count seen across boundaries during replay.
    // When getAllLines().length stops growing (scrollback full), we detect overflow
    // and fall back to capturing viewport snapshots instead of empty line ranges.
    let highWaterLineCount = 0;
    // Track epoch boundaries for scrollback deduplication.
    // TUI apps (Claude Code, Gemini CLI) clear the screen and redraw, pushing
    // duplicate content into scrollback. Epoch boundaries mark clear-screen events.
    const epochBoundaries: EpochBoundary[] = [];
    const sectionData: Array<{
      lineCount: number | null;    // null = TUI or overflow section
      snapshot: TerminalSnapshot | null;  // non-null = TUI or overflow fallback section
    }> = new Array(boundaries.length).fill(null).map(() => ({ lineCount: null, snapshot: null }));

    for (let j = 0; j < eventCount; j++) {
      const [, eventType, data] = events[j];
      if (eventType === 'r') {
        // Resize event: asciicast v3 format is [timestamp, "r", "COLSxROWS"]
        const sizeStr = String(data);
        const match = sizeStr.match(/^(\d+)x(\d+)$/);
        if (match) {
          vt.resize(parseInt(match[1], 10), parseInt(match[2], 10));
        }
      } else if (eventType === 'o') {
        const str = String(data);
        // Strip \x1b[3J (erase scrollback) before feeding to VT so scrollback
        // accumulates fully for epoch-based deduplication. \x1b[3J only affects
        // scrollback (not viewport), so getView() results are unchanged.
        vt.feed(str.replaceAll('\x1b[3J', ''));
        // Track alt-screen transitions
        if (str.includes('\x1b[?1049h')) inAltScreen = true;
        if (str.includes('\x1b[?1049l')) inAltScreen = false;
        // Track clear-screen events for epoch-based scrollback dedup.
        // Detect ESC[2J (erase display) and ESC[3J (erase scrollback) — both
        // used by TUI apps on the primary buffer (Claude Code, Gemini CLI, Codex).
        if (!inAltScreen && (str.includes('\x1b[2J') || str.includes('\x1b[3J'))) {
          const lineCount = vt.getAllLines().lines.length;
          // Avoid duplicate boundaries at the same line count (e.g., 2J+3J in same event)
          if (epochBoundaries.length === 0 || epochBoundaries[epochBoundaries.length - 1].rawLineCount !== lineCount) {
            epochBoundaries.push({ eventIndex: j, rawLineCount: lineCount });
          }
        }
      }

      const boundaryIdx = sectionEndEvents.get(j + 1);
      if (boundaryIdx !== undefined) {
        if (inAltScreen) {
          // TUI section: capture viewport snapshot
          sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
        } else {
          // CLI section: record line count AND capture viewport as fallback.
          // When scrollback is full, getAllLines() plateaus and line ranges become empty.
          // The viewport fallback ensures we always have something to show.
          const lines = vt.getAllLines();
          const currentLineCount = lines.lines.length;

          if (currentLineCount <= highWaterLineCount) {
            // Scrollback overflow: line count didn't grow since last boundary → capture viewport
            sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
          } else {
            sectionData[boundaryIdx] = { lineCount: currentLineCount, snapshot: null };
            highWaterLineCount = currentLineCount;
          }
        }
      }
    }

    // Full session document (getAllLines at end of replay)
    const rawSnapshot = vt.getAllLines();

    // Free WASM resources now that we have the final snapshot
    vt.free();

    // Deduplicate scrollback if clear-screen epochs were detected.
    // For CLI sessions (zero clears): identity transform, no change.
    // For TUI sessions: removes re-rendered content, keeps only unique lines.
    const { cleanSnapshot, rawLineCountToClean } = buildCleanDocument(rawSnapshot, epochBoundaries);

    // Store deduplicated snapshot on session (always, even with zero boundaries)
    sessionRepo.updateSnapshot(sessionId, JSON.stringify(cleanSnapshot));

    // Compute line ranges and store sections.
    // previousCleanLineCount tracks the end of the last CLI section for contiguous ranges.
    // Line counts are remapped through the dedup mapping so ranges index into the clean snapshot.
    let previousCleanLineCount = 0;
    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const endEvent = i < boundaries.length - 1
        ? boundaries[i + 1].eventIndex
        : eventCount;
      const sd = sectionData[i];
      const isMarker = boundary.signals.includes('marker');

      if (sd.snapshot) {
        // TUI section or scrollback overflow: store viewport snapshot, no line range
        sectionRepo.create({
          sessionId, type: isMarker ? 'marker' : 'detected',
          startEvent: boundary.eventIndex, endEvent,
          label: boundary.label,
          snapshot: JSON.stringify(sd.snapshot),
          startLine: null, endLine: null,
        });
      } else {
        // CLI section: store line range into the clean (deduplicated) snapshot.
        // Remap raw line counts through the dedup mapping.
        const rawEndLine = sd.lineCount ?? rawSnapshot.lines.length;
        const endLine = rawLineCountToClean(rawEndLine);
        const startLine = Math.min(previousCleanLineCount, endLine);
        previousCleanLineCount = endLine;

        sectionRepo.create({
          sessionId, type: isMarker ? 'marker' : 'detected',
          startEvent: boundary.eventIndex, endEvent,
          label: boundary.label,
          snapshot: null,
          startLine, endLine,
        });
      }
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

/**
 * Session Processing Pipeline - Orchestrates detection + snapshot generation + DB storage.
 *
 * Single-pass file read: reads the .cast file once, collecting both the header
 * and events. Then runs detection on the in-memory events, generates snapshots
 * using the VT engine, and stores everything in the DB.
 *
 * High-level flow:
 * 1. Set detection_status to 'processing'
 * 2. Read header + events from .cast file (single pass) via readCastFile()
 * 3. Detect section boundaries via detectBoundaries()
 * 4. Replay events through VT to capture snapshots via replaySession()
 * 5. Build ProcessedSession result via buildProcessedSession()
 * 6. Atomically persist via sessionRepo.completeProcessing()
 * 7. On error: set detection_status to 'failed'
 */

import type { SessionAdapter } from '../db/session_adapter.js';
import type { Marker, AsciicastEvent, AsciicastHeader } from '../../shared/types/asciicast.js';
import type { CreateSectionInput } from '../db/section_adapter.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'pipeline' });
import { normalizeHeader } from '../../shared/parsers/asciicast.js';
import { NdjsonStream } from './ndjson_stream.js';
import { SectionDetector, type SectionBoundary } from './section_detector.js';
import { createVt, initVt, type TerminalSnapshot } from '#vt-wasm';
import { buildCleanDocument, type EpochBoundary } from './scrollback_dedup.js';
import type { ProcessedSession } from './types.js';

/**
 * Process a session: detect sections, capture snapshots, store in DB atomically.
 *
 * This function is async and should be called via runPipeline() for bounded concurrency.
 * Errors are handled internally — the session is marked 'failed' on any error.
 *
 * @param filePath - Path to the .cast file
 * @param sessionId - Session ID in database
 * @param markers - Array of markers from the .cast file
 * @param sessionRepo - Session repository for DB operations
 */
export async function processSessionPipeline(
  filePath: string,
  sessionId: string,
  markers: Marker[],
  sessionRepo: SessionAdapter
): Promise<void> {
  try {
    // Initialize WASM module (safe to call multiple times)
    await initVt();
    await sessionRepo.updateDetectionStatus(sessionId, 'processing');

    const { header, events } = await readCastFile(filePath, sessionId);
    const boundaries = detectBoundaries(events, markers);
    const { rawSnapshot, sectionData, epochBoundaries } = replaySession(header, events, boundaries);
    const processed = buildProcessedSession(
      sessionId, rawSnapshot, sectionData, epochBoundaries, boundaries, events.length
    );

    await sessionRepo.completeProcessing(processed);
  } catch (error) {
    log.error({ err: error, sessionId }, 'Session processing failed');
    await sessionRepo.updateDetectionStatus(sessionId, 'failed');
  }
}

// --- Module-private pipeline functions ---

/** Reads a .cast file and returns the normalized header and events. */
async function readCastFile(
  filePath: string,
  sessionId: string
): Promise<{ header: AsciicastHeader; events: AsciicastEvent[] }> {
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

  if (stream.malformedLineCount > 0) {
    log.warn({ sessionId, malformedLines: stream.malformedLineCount }, 'Skipped malformed lines in .cast file');
  }

  if (!header) {
    throw new Error('No header found in .cast file');
  }

  // Normalize header (v3 term.cols/rows → width/height)
  header = normalizeHeader(header as Record<string, any>);

  return { header, events };
}

/**
 * Detects section boundaries from events and markers.
 * Synthesizes a preamble boundary when marker-based sessions have pre-marker output.
 *
 * Only for marker-based sessions — for pure auto-detected sections, the detector
 * already determines where content starts; adding a preamble would just dump
 * the entire scrollback buffer into one massive section.
 */
function detectBoundaries(events: AsciicastEvent[], markers: Marker[]): SectionBoundary[] {
  const detector = new SectionDetector(events);
  const boundaries = detector.detectWithMarkers(markers);

  const hasMarkerBoundary = boundaries.some(b => b.signals.includes('marker'));
  const firstBoundary = boundaries[0];
  if (hasMarkerBoundary && firstBoundary !== undefined && firstBoundary.eventIndex > 0) {
    const hasPreContent = events.slice(0, firstBoundary.eventIndex).some(e => e[1] === 'o');
    if (hasPreContent) {
      boundaries.unshift({
        eventIndex: 0,
        score: Infinity,
        signals: ['preamble'],
        label: 'Preamble',
      });
    }
  }

  return boundaries;
}

/** Builds a map of (section end event index) → boundary index for O(1) lookup during replay. */
function buildSectionEndMap(boundaries: SectionBoundary[], eventCount: number): Map<number, number> {
  const sectionEndEvents: Map<number, number> = new Map();
  for (let i = 0; i < boundaries.length; i++) {
    const nextBoundary = boundaries[i + 1];
    const endEvent = i < boundaries.length - 1 && nextBoundary !== undefined
      ? nextBoundary.eventIndex
      : eventCount;
    sectionEndEvents.set(endEvent, i);
  }
  return sectionEndEvents;
}

/** Handles a resize event ('r'): parses COLSxROWS and calls vt.resize(). */
function handleResizeEvent(vt: ReturnType<typeof createVt>, data: unknown): void {
  const sizeStr = String(data);
  const match = /^(\d+)x(\d+)$/.exec(sizeStr);
  if (match?.[1] !== undefined && match?.[2] !== undefined) {
    vt.resize(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
  }
}

/**
 * Tracks clear-screen events for epoch-based scrollback deduplication.
 * Detects ESC[2J (erase display) and ESC[3J (erase scrollback) — both
 * used by TUI apps on the primary buffer (Claude Code, Gemini CLI, Codex).
 */
function handleEpochTracking(
  vt: ReturnType<typeof createVt>,
  str: string,
  inAltScreen: boolean,
  eventIndex: number,
  epochBoundaries: EpochBoundary[]
): void {
  if (inAltScreen) return;
  if (!str.includes('\x1b[2J') && !str.includes('\x1b[3J')) return;

  const lineCount = vt.getAllLines().lines.length;
  // Avoid duplicate boundaries at the same line count (e.g., 2J+3J in same event)
  if (epochBoundaries.at(-1)?.rawLineCount !== lineCount) {
    epochBoundaries.push({ eventIndex, rawLineCount: lineCount });
  }
}

/**
 * Captures section data at a CLI/TUI boundary.
 * TUI sections get a viewport snapshot; CLI sections get a line count (with viewport fallback
 * when scrollback is full and getAllLines() has stopped growing).
 */
function captureSectionData(
  vt: ReturnType<typeof createVt>,
  inAltScreen: boolean,
  boundaryIdx: number,
  highWaterLineCount: number,
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>
): number {
  if (inAltScreen) {
    // TUI section: capture viewport snapshot
    sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
    return highWaterLineCount;
  }

  // CLI section: record line count AND capture viewport as fallback.
  // When scrollback is full, getAllLines() plateaus and line ranges become empty.
  // The viewport fallback ensures we always have something to show.
  const currentLineCount = vt.getAllLines().lines.length;
  if (currentLineCount <= highWaterLineCount) {
    // Scrollback overflow: line count didn't grow since last boundary → capture viewport
    sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
    return highWaterLineCount;
  }

  sectionData[boundaryIdx] = { lineCount: currentLineCount, snapshot: null };
  return currentLineCount;
}

/**
 * Replays events through the VT terminal engine, capturing snapshots at section boundaries.
 *
 * Hybrid snapshot capture — CLI sections get line ranges, TUI sections get viewport snapshots:
 * - At CLI boundaries: record line count from getAllLines() for range calculation
 * - At TUI boundaries (during alt-screen): capture getView() as section viewport snapshot
 * - At end: capture getAllLines() as full session document
 *
 * Previous approaches that failed:
 * - Delta (nextSnapshot.lines.slice(currentSnapshot.lines.length)): breaks
 *   when scrollback hits the limit — both snapshots have same line count.
 * - Fresh VT per section: loses terminal state, TUI sections all look identical.
 * - All sections as viewport snapshots: produces duplicate content for CLI sessions.
 *
 * WASM guard: vt.free() is always called via try/finally, preventing WASM memory leaks.
 */
function replaySession(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  boundaries: SectionBoundary[]
): {
  rawSnapshot: TerminalSnapshot;
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>;
  epochBoundaries: EpochBoundary[];
} {
  const eventCount = events.length;

  // Always replay events through VT to capture the full session document.
  // Even with zero boundaries, the session needs its full snapshot for rendering.
  // Large scrollback ensures getAllLines() captures the full session document.
  // Without this, line counts plateau and sections beyond the limit get degraded
  // to viewport-only snapshots (terminal height lines instead of full content).
  const vt = createVt(header.width, header.height, 200000);

  try {
    const sectionEndEvents = buildSectionEndMap(boundaries, eventCount);

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
      lineCount: number | null;
      snapshot: TerminalSnapshot | null;
    }> = new Array(boundaries.length).fill(null).map(() => ({ lineCount: null, snapshot: null }));

    for (let j = 0; j < eventCount; j++) {
      const event = events[j];
      if (event === undefined) continue;
      const [, eventType, data] = event;

      if (eventType === 'r') {
        // Resize event: asciicast v3 format is [timestamp, "r", "COLSxROWS"]
        handleResizeEvent(vt, data);
      } else if (eventType === 'o') {
        const str = String(data);
        // Strip \x1b[3J (erase scrollback) before feeding to VT so scrollback
        // accumulates fully for epoch-based deduplication. \x1b[3J only affects
        // scrollback (not viewport), so getView() results are unchanged.
        vt.feed(str.replaceAll('\x1b[3J', ''));
        // Track alt-screen transitions
        if (str.includes('\x1b[?1049h')) inAltScreen = true;
        if (str.includes('\x1b[?1049l')) inAltScreen = false;
        handleEpochTracking(vt, str, inAltScreen, j, epochBoundaries);
      }

      const boundaryIdx = sectionEndEvents.get(j + 1);
      if (boundaryIdx !== undefined) {
        highWaterLineCount = captureSectionData(vt, inAltScreen, boundaryIdx, highWaterLineCount, sectionData);
      }
    }

    // Full session document (getAllLines at end of replay)
    const rawSnapshot = vt.getAllLines();
    return { rawSnapshot, sectionData, epochBoundaries };
  } finally {
    // Free WASM resources — always runs, even if replay throws (H3 WASM guard)
    vt.free();
  }
}

/**
 * Builds a ProcessedSession from raw replay data.
 * Runs scrollback deduplication and constructs section inputs with line range remapping.
 * Pure function — no I/O, no DB calls, no WASM.
 */
function buildProcessedSession(
  sessionId: string,
  rawSnapshot: TerminalSnapshot,
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>,
  epochBoundaries: EpochBoundary[],
  boundaries: SectionBoundary[],
  eventCount: number
): ProcessedSession {
  // Deduplicate scrollback if clear-screen epochs were detected.
  // For CLI sessions (zero clears): identity transform, no change.
  // For TUI sessions: removes re-rendered content, keeps only unique lines.
  const { cleanSnapshot, rawLineCountToClean } = buildCleanDocument(rawSnapshot, epochBoundaries);

  const sections: CreateSectionInput[] = [];
  // previousCleanLineCount tracks the end of the last CLI section for contiguous ranges.
  // Line counts are remapped through the dedup mapping so ranges index into the clean snapshot.
  let previousCleanLineCount = 0;

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    const sd = sectionData[i];
    if (boundary === undefined || sd === undefined) continue;

    const endEvent = i < boundaries.length - 1 && nextBoundary !== undefined
      ? nextBoundary.eventIndex
      : eventCount;
    const isMarker = boundary.signals.includes('marker');

    if (sd.snapshot) {
      // TUI section or scrollback overflow: store viewport snapshot, no line range
      sections.push({
        sessionId,
        type: isMarker ? 'marker' : 'detected',
        startEvent: boundary.eventIndex,
        endEvent,
        label: boundary.label,
        snapshot: JSON.stringify(sd.snapshot),
        startLine: null,
        endLine: null,
      });
    } else {
      // CLI section: store line range into the clean (deduplicated) snapshot.
      // Remap raw line counts through the dedup mapping.
      const rawEndLine = sd.lineCount ?? rawSnapshot.lines.length;
      const endLine = rawLineCountToClean(rawEndLine);
      const startLine = Math.min(previousCleanLineCount, endLine);
      previousCleanLineCount = endLine;

      sections.push({
        sessionId,
        type: isMarker ? 'marker' : 'detected',
        startEvent: boundary.eventIndex,
        endEvent,
        label: boundary.label,
        snapshot: null,
        startLine,
        endLine,
      });
    }
  }

  const detectedSectionsCount = boundaries.filter(
    b => !b.signals.includes('marker')
  ).length;

  return {
    sessionId,
    snapshot: JSON.stringify(cleanSnapshot),
    sections,
    eventCount,
    detectedSectionsCount,
  };
}

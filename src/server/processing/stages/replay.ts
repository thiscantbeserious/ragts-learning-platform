/**
 * Replay stage: replays events through the VT terminal engine, capturing snapshots at section boundaries.
 *
 * Extracted from processSessionPipeline step 3 (replaySession).
 * Pure synchronous function — no I/O, no DB calls.
 * Requires initVt() to have been called before first use.
 * The orchestrator emits `session.replayed` after this stage succeeds.
 *
 * WASM guard: vt.free() is always called via try/finally, preventing WASM memory leaks.
 */

import type { AsciicastEvent, AsciicastHeader } from '../../../shared/asciicast-types.js';
import { createVt, type TerminalSnapshot } from '#vt-wasm';
import type { SectionBoundary } from '../section_detector.js';
import type { EpochBoundary } from '../scrollback_dedup.js';

/** Output of the replay stage. */
export interface ReplayResult {
  rawSnapshot: TerminalSnapshot;
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>;
  epochBoundaries: EpochBoundary[];
}

const SCROLLBACK_SIZE = 200000;

/**
 * Replay events through the VT engine, capturing snapshots at section boundaries.
 * Returns the full session document and per-section data for dedup stage.
 */
export function replay(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  boundaries: SectionBoundary[]
): ReplayResult {
  const vt = createVt(header.width, header.height, SCROLLBACK_SIZE);

  try {
    return replayEvents(vt, events, boundaries);
  } finally {
    vt.free();
  }
}

/** Drives the VT replay loop and captures section snapshots. */
function replayEvents(
  vt: ReturnType<typeof createVt>,
  events: AsciicastEvent[],
  boundaries: SectionBoundary[]
): ReplayResult {
  const eventCount = events.length;
  const sectionEndMap = buildSectionEndMap(boundaries, eventCount);
  const sectionData = initSectionData(boundaries.length);
  const epochBoundaries: EpochBoundary[] = [];

  let inAltScreen = false;
  let highWaterLineCount = 0;

  for (let j = 0; j < eventCount; j++) {
    const event = events[j];
    if (event === undefined) continue;
    const [, eventType, data] = event;

    if (eventType === 'r') {
      handleResizeEvent(vt, data);
    } else if (eventType === 'o') {
      const str = String(data);
      vt.feed(str.replaceAll('\x1b[3J', ''));
      if (str.includes('\x1b[?1049h')) inAltScreen = true;
      if (str.includes('\x1b[?1049l')) inAltScreen = false;
      trackEpochBoundary(vt, str, inAltScreen, j, epochBoundaries);
    }

    const boundaryIdx = sectionEndMap.get(j + 1);
    if (boundaryIdx !== undefined) {
      highWaterLineCount = captureSectionSnapshot(vt, inAltScreen, boundaryIdx, highWaterLineCount, sectionData);
    }
  }

  return { rawSnapshot: vt.getAllLines(), sectionData, epochBoundaries };
}

/** Builds a map from (next event index) → boundary index for O(1) lookup. */
function buildSectionEndMap(boundaries: SectionBoundary[], eventCount: number): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < boundaries.length; i++) {
    const next = boundaries[i + 1];
    const endEvent = i < boundaries.length - 1 && next !== undefined ? next.eventIndex : eventCount;
    map.set(endEvent, i);
  }
  return map;
}

/** Allocates empty section data slots. */
function initSectionData(
  count: number
): Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }> {
  return new Array(count).fill(null).map(() => ({ lineCount: null, snapshot: null }));
}

/** Handles resize events: parses COLSxROWS format and calls vt.resize(). */
function handleResizeEvent(vt: ReturnType<typeof createVt>, data: unknown): void {
  const match = /^(\d+)x(\d+)$/.exec(String(data));
  if (match?.[1] !== undefined && match?.[2] !== undefined) {
    vt.resize(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
  }
}

/**
 * Tracks clear-screen events for epoch-based scrollback deduplication.
 * Detects ESC[2J (erase display) and ESC[3J (erase scrollback).
 */
function trackEpochBoundary(
  vt: ReturnType<typeof createVt>,
  str: string,
  inAltScreen: boolean,
  eventIndex: number,
  epochBoundaries: EpochBoundary[]
): void {
  if (inAltScreen) return;
  if (!str.includes('\x1b[2J') && !str.includes('\x1b[3J')) return;

  const lineCount = vt.getAllLines().lines.length;
  if (epochBoundaries.at(-1)?.rawLineCount !== lineCount) {
    epochBoundaries.push({ eventIndex, rawLineCount: lineCount });
  }
}

/** Captures section data at a CLI/TUI boundary. Returns updated high water mark. */
function captureSectionSnapshot(
  vt: ReturnType<typeof createVt>,
  inAltScreen: boolean,
  boundaryIdx: number,
  highWaterLineCount: number,
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>
): number {
  if (inAltScreen) {
    sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
    return highWaterLineCount;
  }

  const currentLineCount = vt.getAllLines().lines.length;
  if (currentLineCount <= highWaterLineCount) {
    sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
    return highWaterLineCount;
  }

  sectionData[boundaryIdx] = { lineCount: currentLineCount, snapshot: null };
  return currentLineCount;
}

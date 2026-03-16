/**
 * Replay stage: replays events through the VT terminal engine, capturing snapshots at section boundaries.
 *
 * Extracted from processSessionPipeline step 3 (replaySession).
 * The heavy VT processing runs synchronously — call from a worker thread to avoid
 * blocking the main event loop. `replay()` wraps `replaySync()` in a promise for
 * backward compatibility; callers that already run in a worker should call `replaySync()`
 * directly.
 *
 * Requires `initVt()` to have been called before first use.
 * The orchestrator emits `session.replayed` after this stage succeeds.
 */

import { createVt } from '#vt-wasm';
import type { AsciicastEvent, AsciicastHeader } from '../../../shared/types/asciicast.js';
import type { TerminalSnapshot } from '#vt-wasm';
import type { SectionBoundary } from '../section_detector.js';
import type { EpochBoundary } from '../scrollback_dedup.js';

/** Output of the replay stage. */
export interface ReplayResult {
  rawSnapshot: TerminalSnapshot;
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>;
  epochBoundaries: EpochBoundary[];
}

const SCROLLBACK_SIZE = 200000;

// ── Internal helpers ────────────────────────────────────────────────────────

/** Count LF characters in a string for approximate scrollback tracking. */
function countLFs(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.codePointAt(i) === 10) count++;
  }
  return count;
}

/**
 * Build a set of event indices that must be processed individually (not batched).
 * These are events containing clear-screen escapes or events at section boundaries.
 */
function buildCriticalIndices(events: AsciicastEvent[], sectionEndMap: Map<number, number>): Set<number> {
  const critical = new Set<number>();
  for (let j = 0; j < events.length; j++) {
    const event = events[j];
    if (!event) continue;
    const [, eventType, data] = event;
    if (eventType !== 'o') continue;

    const str = String(data);
    if (str.includes('\x1b[2J') || str.includes('\x1b[3J') ||
        str.includes('\x1b[?1049h') || str.includes('\x1b[?1049l')) {
      critical.add(j);
    }
    if (sectionEndMap.has(j + 1)) {
      critical.add(j);
    }
  }
  return critical;
}

/** Builds a map from (next event index) → boundary index. */
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
function initSectionData(count: number): Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }> {
  return Array.from({ length: count }, () => ({ lineCount: null, snapshot: null }));
}

/** Handles resize events, returns new row count. */
function handleResizeEvent(vt: ReturnType<typeof createVt>, data: unknown, currentRows: number): number {
  const match = /^(\d+)x(\d+)$/.exec(String(data));
  if (match?.[1] !== undefined && match?.[2] !== undefined) {
    vt.resize(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
    return Number.parseInt(match[2], 10);
  }
  return currentRows;
}

/** Records a clear-screen epoch boundary if line count changed. */
function recordEpochBoundary(eventIndex: number, approxLineCount: number, epochBoundaries: EpochBoundary[]): void {
  if (epochBoundaries.at(-1)?.rawLineCount !== approxLineCount) {
    epochBoundaries.push({ eventIndex, rawLineCount: approxLineCount });
  }
}

/** Captures section data at a CLI/TUI boundary. Returns updated high water mark. */
function captureSectionSnapshot(
  vt: ReturnType<typeof createVt>,
  inAltScreen: boolean,
  boundaryIdx: number,
  highWaterLineCount: number,
  approxLineCount: number,
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>
): number {
  if (inAltScreen) {
    sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
    return highWaterLineCount;
  }

  if (approxLineCount <= highWaterLineCount) {
    sectionData[boundaryIdx] = { lineCount: null, snapshot: vt.getView() };
    return highWaterLineCount;
  }

  sectionData[boundaryIdx] = { lineCount: approxLineCount, snapshot: null };
  return approxLineCount;
}

/** Internal state for the main replay loop. */
interface ReplayState {
  inAltScreen: boolean;
  highWaterLineCount: number;
  termRows: number;
  approxLineCount: number;
  batchText: string;
  batchCount: number;
  epochBoundaries: EpochBoundary[];
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>;
}

/** Process a single critical event (clear-screen or section boundary). */
function processCriticalEvent(
  vt: ReturnType<typeof createVt>,
  state: ReplayState,
  fed: string,
  str: string,
  j: number,
  boundaryIdx: number | undefined,
): void {
  if (state.batchText) {
    vt.feed(state.batchText);
    state.batchText = '';
    state.batchCount = 0;
  }

  vt.feed(fed);
  if (str.includes('\x1b[?1049h')) state.inAltScreen = true;
  if (str.includes('\x1b[?1049l')) state.inAltScreen = false;

  if (!state.inAltScreen) {
    state.approxLineCount += countLFs(fed);
    if (str.includes('\x1b[2J') || str.includes('\x1b[3J')) {
      recordEpochBoundary(j, state.approxLineCount, state.epochBoundaries);
    }
  }

  if (boundaryIdx !== undefined) {
    state.highWaterLineCount = captureSectionSnapshot(
      vt, state.inAltScreen, boundaryIdx, state.highWaterLineCount, state.approxLineCount, state.sectionData
    );
  }
}

/** Process a single batched (non-critical) event. */
function processBatchedEvent(
  vt: ReturnType<typeof createVt>,
  state: ReplayState,
  fed: string,
  str: string
): void {
  state.batchText += fed;
  state.batchCount++;

  if (str.includes('\x1b[?1049h')) state.inAltScreen = true;
  if (str.includes('\x1b[?1049l')) state.inAltScreen = false;
  if (!state.inAltScreen) state.approxLineCount += countLFs(fed);

  if (state.batchCount >= 1000) {
    vt.feed(state.batchText);
    state.batchText = '';
    state.batchCount = 0;
  }
}

/**
 * Replay events through the VT engine synchronously.
 * Must be called from a worker thread — blocks the calling thread during WASM processing.
 * Requires `initVt()` to have been called before use.
 */
export function replaySync(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  boundaries: SectionBoundary[]
): ReplayResult {
  const vt = createVt(header.width, header.height, SCROLLBACK_SIZE);

  try {
    const eventCount = events.length;
    const sectionEndMap = buildSectionEndMap(boundaries, eventCount);
    const criticalIndices = buildCriticalIndices(events, sectionEndMap);
    const state: ReplayState = {
      inAltScreen: false,
      highWaterLineCount: 0,
      termRows: header.height,
      approxLineCount: 0,
      batchText: '',
      batchCount: 0,
      epochBoundaries: [],
      sectionData: initSectionData(boundaries.length),
    };

    for (let j = 0; j < eventCount; j++) {
      const event = events[j];
      if (!event) continue;
      const [, eventType, data] = event;

      if (eventType === 'r') {
        if (state.batchText) {
          vt.feed(state.batchText);
          state.batchText = '';
          state.batchCount = 0;
        }
        state.termRows = handleResizeEvent(vt, data, state.termRows);
        continue;
      }

      if (eventType !== 'o') continue;

      const str = String(data);
      const fed = str.replaceAll('\x1b[3J', '');
      const isCritical = criticalIndices.has(j);
      const boundaryIdx = sectionEndMap.get(j + 1);

      if (isCritical || boundaryIdx !== undefined) {
        processCriticalEvent(vt, state, fed, str, j, boundaryIdx);
      } else {
        processBatchedEvent(vt, state, fed, str);
      }
    }

    if (state.batchText) {
      vt.feed(state.batchText);
    }

    const rawSnapshot = vt.getAllLines();
    return { rawSnapshot, sectionData: state.sectionData, epochBoundaries: state.epochBoundaries };
  } finally {
    vt.free();
  }
}

/**
 * Replay events through the VT engine.
 * Returns a promise that resolves with the replay result.
 * This is a thin async wrapper around `replaySync()` — call from worker threads only.
 * Synchronous errors from `replaySync()` are caught and converted to rejected promises.
 */
export function replay(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  boundaries: SectionBoundary[]
): Promise<ReplayResult> {
  try {
    return Promise.resolve(replaySync(header, events, boundaries));
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

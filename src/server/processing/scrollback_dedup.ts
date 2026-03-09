/**
 * Scrollback deduplication for TUI applications.
 *
 * TUI applications (Claude Code, Gemini CLI) perform clear-screen + redraw cycles
 * on the primary screen buffer. Each redraw re-renders previous conversation content,
 * causing the VT engine to push massive duplication into scrollback.
 *
 * This module deduplicates scrollback by detecting re-rendered content at epoch boundaries
 * (clear-screen events) and building a clean document with only unique content.
 *
 * Algorithm: Contiguous block matching against the full clean document.
 * For each epoch after epoch 0, scan for contiguous runs of lines that match
 * content already in the clean document. Blocks of >= MIN_MATCH consecutive
 * matching lines are treated as re-renders and mapped to existing positions.
 * Non-matching lines are appended as genuinely new content.
 *
 * This handles TUI apps where re-rendered content appears at arbitrary positions
 * within each epoch (not necessarily at the start), and where re-rendered content
 * may match content from any previous epoch (not just the immediately preceding one).
 */

import type { TerminalSnapshot, SnapshotLine } from '#vt-wasm/types';

/**
 * Epoch boundary marker.
 * Marks a clear-screen event in the terminal recording.
 */
export interface EpochBoundary {
  /** Index in the event stream where clear-screen occurred. */
  eventIndex: number;
  /** Total line count in getAllLines() at this boundary. */
  rawLineCount: number;
}

/**
 * Result of deduplication.
 */
export interface CleanDocumentResult {
  /** Deduplicated snapshot with overlap removed. */
  cleanSnapshot: TerminalSnapshot;
  /** Maps raw line number to clean line number. */
  rawToClean: (rawLine: number) => number;
  /**
   * Maps a raw line count (e.g., from getAllLines().lines.length at a section boundary)
   * to the corresponding clean line count. Used for remapping section line ranges.
   */
  rawLineCountToClean: (rawLineCount: number) => number;
}

/** Minimum contiguous matching lines to count as a re-rendered block. */
const MIN_MATCH = 3;

/** Max distance (in lines) to look ahead for stutter detection. */
const STUTTER_WINDOW = 5;

/** Minimum non-trivial character count for a line to be considered for stutter matching. */
const TRIVIAL_THRESHOLD = 3;

/**
 * Normalize line text for comparison.
 * Trims trailing whitespace (terminal lines are padded to width).
 */
function lineKey(line: SnapshotLine): string {
  return line.spans.map(span => span.text ?? '').join('').trimEnd();
}

/**
 * Get a line from an array at a known-valid index.
 * The caller is responsible for ensuring the index is within bounds.
 */
function getLine(lines: SnapshotLine[], index: number): SnapshotLine {
  const line = lines[index];
  if (line === undefined) throw new RangeError(`Line index ${index} out of bounds`);
  return line;
}

/**
 * Check if all lines between index `from` (exclusive) and `to` (exclusive) are trivial.
 * Trivial means blank or whitespace-only (character count <= TRIVIAL_THRESHOLD).
 */
function allLinesBetweenTrivial(rawLines: SnapshotLine[], from: number, to: number): boolean {
  for (let k = from + 1; k < to; k++) {
    if (lineKey(getLine(rawLines, k)).length > TRIVIAL_THRESHOLD) return false;
  }
  return true;
}

/**
 * Find the stutter partner for line at index `i`: the nearest following index j
 * within STUTTER_WINDOW where the text matches and all lines in between are trivial.
 * Returns -1 if no partner found.
 */
function findStutterPartner(rawLines: SnapshotLine[], i: number, key: string): number {
  const limit = Math.min(i + STUTTER_WINDOW, rawLines.length - 1);
  for (let j = i + 1; j <= limit; j++) {
    if (lineKey(getLine(rawLines, j)) !== key) continue;
    if (allLinesBetweenTrivial(rawLines, i, j)) return j;
  }
  return -1;
}

/**
 * Pre-scan raw lines for "stutters" — short partial renders immediately
 * followed by a more complete render of the same content.
 *
 * Pattern: line K is non-trivial, line K+N has the same text (N <= STUTTER_WINDOW),
 * and all lines between K and K+N are trivial (blank/whitespace-only).
 * Mark K through K+N-1 for skipping — the second occurrence supersedes the first.
 */
function detectStutters(rawLines: SnapshotLine[]): Set<number> {
  const skip = new Set<number>();
  for (let i = 0; i < rawLines.length; i++) {
    if (skip.has(i)) continue;
    const key = lineKey(getLine(rawLines, i));
    if (key.length <= TRIVIAL_THRESHOLD) continue;

    const partner = findStutterPartner(rawLines, i, key);
    if (partner === -1) continue;

    // Mark i through partner-1 for removal (keep partner onward)
    for (let k = i; k < partner; k++) skip.add(k);
  }
  return skip;
}

/** State shared across epoch processing helpers. */
interface DeduplicationState {
  rawLines: SnapshotLine[];
  cleanLines: SnapshotLine[];
  rawToCleanMap: Map<number, number>;
  cleanIndex: Map<string, number[]>;
  stutterSkip: Set<number>;
}

/**
 * Add a line to the clean document and update the hash index.
 * Returns the clean position assigned to this line.
 */
function addToClean(state: DeduplicationState, rawIdx: number, line: SnapshotLine): number {
  const cleanPos = state.cleanLines.length;
  state.cleanLines.push(line);
  state.rawToCleanMap.set(rawIdx, cleanPos);
  const key = lineKey(line);
  let positions = state.cleanIndex.get(key);
  if (!positions) {
    positions = [];
    state.cleanIndex.set(key, positions);
  }
  positions.push(cleanPos);
  return cleanPos;
}

/**
 * Find the longest contiguous block starting at epoch offset `i` that matches
 * consecutive lines already in the clean document.
 * Returns { bestLen, bestCleanStart } — bestLen=0 means no match >= MIN_MATCH.
 */
function findBestBlock(
  state: DeduplicationState,
  epochStart: number,
  epochLen: number,
  i: number
): { bestLen: number; bestCleanStart: number } {
  const key = lineKey(getLine(state.rawLines, epochStart + i));
  const candidates = state.cleanIndex.get(key);
  let bestLen = 0;
  let bestCleanStart = -1;

  if (!candidates) return { bestLen, bestCleanStart };

  for (const cleanPos of candidates) {
    let len = 0;
    while (
      i + len < epochLen &&
      cleanPos + len < state.cleanLines.length &&
      lineKey(getLine(state.rawLines, epochStart + i + len)) === lineKey(getLine(state.cleanLines, cleanPos + len))
    ) {
      len++;
    }
    if (len > bestLen) {
      bestLen = len;
      bestCleanStart = cleanPos;
    }
  }

  return { bestLen, bestCleanStart };
}

/**
 * Process a single epoch range against the accumulated clean document.
 * Re-rendered blocks (>= MIN_MATCH consecutive matches) are mapped to existing positions.
 * Genuinely new lines are appended and immediately indexed for future epochs.
 */
function processEpoch(
  state: DeduplicationState,
  epochStart: number,
  epochEnd: number
): void {
  const epochLen = epochEnd - epochStart;
  if (epochLen === 0) return;

  let i = 0;
  while (i < epochLen) {
    const rawIdx = epochStart + i;

    // Skip stuttered lines (transient partial renders)
    if (state.stutterSkip.has(rawIdx)) {
      i++;
      continue;
    }

    const { bestLen, bestCleanStart } = findBestBlock(state, epochStart, epochLen, i);

    if (bestLen >= MIN_MATCH) {
      // Map block lines to existing clean positions
      for (let j = 0; j < bestLen; j++) {
        state.rawToCleanMap.set(epochStart + i + j, bestCleanStart + j);
      }
      i += bestLen;
    } else {
      // New content: append to clean doc (immediately available for future matches)
      addToClean(state, epochStart + i, getLine(state.rawLines, epochStart + i));
      i++;
    }
  }
}

/**
 * Slice epoch boundaries into { start, end } ranges covering the full raw line array.
 */
function buildEpochRanges(
  epochBoundaries: EpochBoundary[],
  totalLines: number
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const boundary of epochBoundaries) {
    ranges.push({ start: prevEnd, end: boundary.rawLineCount });
    prevEnd = boundary.rawLineCount;
  }
  ranges.push({ start: prevEnd, end: totalLines });
  return ranges;
}

/**
 * Precompute rawLineCount → cleanLineCount mapping array.
 * Entry [i+1] holds the max clean position seen across raw lines 0..i.
 */
function buildRawToCleanCountArray(
  rawToCleanMap: Map<number, number>,
  rawLineCount: number
): number[] {
  const maxCleanAtRaw = new Array(rawLineCount + 1).fill(0);
  let runningMax = 0;
  for (let i = 0; i < rawLineCount; i++) {
    const c = rawToCleanMap.get(i);
    if (c !== undefined) runningMax = Math.max(runningMax, c + 1);
    maxCleanAtRaw[i + 1] = runningMax;
  }
  return maxCleanAtRaw;
}

/**
 * Build a clean deduplicated document from raw snapshot with epoch boundaries.
 *
 * Algorithm:
 * - Zero epochs: identity transform (no deduplication needed)
 * - One or more epochs:
 *   1. Slice raw lines at epoch boundaries into epochs
 *   2. Start with epoch 0 as the clean document
 *   3. For each subsequent epoch, scan for contiguous blocks that match
 *      content anywhere in the clean document built so far:
 *      a. Use a hash index (lineText → clean positions) for O(1) lookups
 *      b. For each epoch line, find the longest contiguous block starting there
 *      c. Blocks >= MIN_MATCH consecutive matches are re-renders → map to existing clean positions
 *      d. Non-matching lines → append as new content
 *   4. Build rawToClean and rawLineCountToClean mappings
 *
 * @param rawSnapshot - Raw terminal snapshot with all lines
 * @param epochBoundaries - Clear-screen event boundaries (sorted by rawLineCount)
 * @returns Deduplicated snapshot and line mapping functions
 */
export function buildCleanDocument(
  rawSnapshot: TerminalSnapshot,
  epochBoundaries: EpochBoundary[]
): CleanDocumentResult {
  // Zero epochs → identity transform
  if (epochBoundaries.length === 0) {
    return {
      cleanSnapshot: rawSnapshot,
      rawToClean: (rawLine: number) => rawLine,
      rawLineCountToClean: (rawLineCount: number) => rawLineCount,
    };
  }

  const rawLines = rawSnapshot.lines;
  const state: DeduplicationState = {
    rawLines,
    cleanLines: [],
    rawToCleanMap: new Map(),
    // Hash index: lineText → sorted array of clean positions with that text.
    // Used for O(1) candidate lookups when scanning epoch lines.
    cleanIndex: new Map(),
    // Pre-scan for stutters (partial TUI renders quickly superseded by full renders).
    // Marked lines are skipped during dedup — they represent transient animation frames.
    stutterSkip: detectStutters(rawLines),
  };

  // Process all epochs (including epoch 0).
  // For each line, find the longest contiguous block starting at that position
  // that matches consecutive lines in the clean doc. Blocks >= MIN_MATCH are
  // treated as re-renders. Non-matching lines are appended as new content
  // and immediately indexed — so within-epoch AND cross-epoch duplicates are caught.
  const epochRanges = buildEpochRanges(epochBoundaries, rawLines.length);
  for (const { start, end } of epochRanges) {
    processEpoch(state, start, end);
  }

  const { cleanLines, rawToCleanMap } = state;
  const maxCleanAtRaw = buildRawToCleanCountArray(rawToCleanMap, rawLines.length);

  return {
    cleanSnapshot: {
      cols: rawSnapshot.cols,
      rows: rawSnapshot.rows,
      lines: cleanLines,
    },
    rawToClean: (rawLine: number) => {
      const cleanLine = rawToCleanMap.get(rawLine);
      if (cleanLine !== undefined) return cleanLine;
      // Stuttered lines were skipped — find nearest valid mapping
      for (let probe = rawLine + 1; probe < rawLines.length; probe++) {
        const c = rawToCleanMap.get(probe);
        if (c !== undefined) return c;
      }
      return cleanLines.length > 0 ? cleanLines.length - 1 : 0;
    },
    rawLineCountToClean: (rawLineCount: number) => {
      if (rawLineCount <= 0) return 0;
      if (rawLineCount >= rawLines.length) return cleanLines.length;
      return maxCleanAtRaw[rawLineCount] ?? 0;
    },
  };
}

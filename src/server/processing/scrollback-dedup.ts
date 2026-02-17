/**
 * Scrollback deduplication for TUI applications.
 *
 * TUI applications (Claude Code, Gemini CLI) perform clear-screen + redraw cycles
 * on the primary screen buffer. Each redraw re-renders previous conversation content,
 * causing the VT engine to push massive duplication into scrollback (90.6% in real sessions).
 *
 * This module deduplicates scrollback by detecting re-rendered content at epoch boundaries
 * (clear-screen events) and building a clean document with only unique content.
 *
 * Algorithm: Consecutive-epoch comparison.
 * For each epoch, compare it position-by-position against the previous epoch.
 * If the match rate exceeds a threshold (50%), the overlapping portion is duplicate
 * content (the TUI re-rendering the same conversation). Only genuinely new content
 * (lines beyond the overlap) is appended to the clean document.
 */

import type { TerminalSnapshot, SnapshotLine } from '../../../packages/vt-wasm/types.js';

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

/** Minimum matching lines to count as overlap. */
const MIN_MATCH = 3;
/** Minimum match rate to consider consecutive epochs as overlapping. */
const MATCH_THRESHOLD = 0.5;

/**
 * Normalize line text for comparison.
 * Trims trailing whitespace (terminal lines are padded to width).
 */
function lineKey(line: SnapshotLine): string {
  return line.spans.map(span => span.text ?? '').join('').trimEnd();
}

/**
 * Build a clean deduplicated document from raw snapshot with epoch boundaries.
 *
 * Algorithm:
 * - Zero epochs: identity transform (no deduplication needed)
 * - One or more epochs:
 *   1. Slice raw lines at epoch boundaries into epochs
 *   2. Start with epoch 0 as the clean document
 *   3. For each subsequent epoch, compare against the PREVIOUS epoch:
 *      a. Position-aligned comparison of min(prevLen, currLen) lines
 *      b. If match rate >= 50%, the comparison range is overlap
 *      c. Map overlapping lines to existing clean positions
 *      d. Append lines beyond the overlap as new content
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
  const cleanLines: SnapshotLine[] = [];
  const rawToCleanMap = new Map<number, number>();

  // Extract epoch ranges from raw lines
  const epochRanges: { start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const boundary of epochBoundaries) {
    epochRanges.push({ start: prevEnd, end: boundary.rawLineCount });
    prevEnd = boundary.rawLineCount;
  }
  epochRanges.push({ start: prevEnd, end: rawLines.length });

  // Track previous epoch's mapping: prevMap[i] = clean position of prev epoch's i-th line
  let prevMap: number[] = [];
  let prevStart = epochRanges[0].start;

  // Process epoch 0: add all lines to clean doc
  const e0 = epochRanges[0];
  for (let i = e0.start; i < e0.end; i++) {
    const cleanPos = cleanLines.length;
    rawToCleanMap.set(i, cleanPos);
    cleanLines.push(rawLines[i]);
    prevMap.push(cleanPos);
  }

  // Process subsequent epochs
  for (let epochIdx = 1; epochIdx < epochRanges.length; epochIdx++) {
    const curr = epochRanges[epochIdx];
    const currLen = curr.end - curr.start;
    if (currLen === 0) continue;

    const currMap: number[] = [];

    // Compare current epoch against previous epoch (position-aligned)
    const compareLen = Math.min(prevMap.length, currLen);
    let matchCount = 0;

    if (compareLen >= MIN_MATCH) {
      for (let i = 0; i < compareLen; i++) {
        if (lineKey(rawLines[prevStart + i]) === lineKey(rawLines[curr.start + i])) {
          matchCount++;
        }
      }
    }

    const matchRate = compareLen > 0 ? matchCount / compareLen : 0;
    const isOverlap = matchRate >= MATCH_THRESHOLD && matchCount >= MIN_MATCH;

    if (isOverlap) {
      // Overlapping: map first compareLen lines to previous epoch's clean positions
      for (let i = 0; i < compareLen; i++) {
        rawToCleanMap.set(curr.start + i, prevMap[i]);
        currMap.push(prevMap[i]);
      }
      // Append genuinely new lines (beyond the overlap)
      for (let i = compareLen; i < currLen; i++) {
        const cleanPos = cleanLines.length;
        rawToCleanMap.set(curr.start + i, cleanPos);
        cleanLines.push(rawLines[curr.start + i]);
        currMap.push(cleanPos);
      }
    } else {
      // No overlap: append all lines
      for (let i = 0; i < currLen; i++) {
        const cleanPos = cleanLines.length;
        rawToCleanMap.set(curr.start + i, cleanPos);
        cleanLines.push(rawLines[curr.start + i]);
        currMap.push(cleanPos);
      }
    }

    prevMap = currMap;
    prevStart = curr.start;
  }

  // Precompute rawLineCount → cleanLineCount mapping.
  const maxCleanAtRaw = new Array(rawLines.length + 1).fill(0);
  let runningMax = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const c = rawToCleanMap.get(i);
    if (c !== undefined) runningMax = Math.max(runningMax, c + 1);
    maxCleanAtRaw[i + 1] = runningMax;
  }

  return {
    cleanSnapshot: {
      cols: rawSnapshot.cols,
      rows: rawSnapshot.rows,
      lines: cleanLines,
    },
    rawToClean: (rawLine: number) => {
      const cleanLine = rawToCleanMap.get(rawLine);
      if (cleanLine === undefined) {
        throw new Error(`No mapping for raw line ${rawLine}`);
      }
      return cleanLine;
    },
    rawLineCountToClean: (rawLineCount: number) => {
      if (rawLineCount <= 0) return 0;
      if (rawLineCount >= rawLines.length) return cleanLines.length;
      return maxCleanAtRaw[rawLineCount];
    },
  };
}

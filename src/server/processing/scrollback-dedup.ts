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
    const key = lineKey(rawLines[i]);
    if (key.length <= TRIVIAL_THRESHOLD) continue;

    for (let j = i + 1; j <= Math.min(i + STUTTER_WINDOW, rawLines.length - 1); j++) {
      if (lineKey(rawLines[j]) !== key) continue;

      // Check all lines between i and j are trivial
      let allTrivial = true;
      for (let k = i + 1; k < j; k++) {
        if (lineKey(rawLines[k]).length > TRIVIAL_THRESHOLD) {
          allTrivial = false;
          break;
        }
      }
      if (!allTrivial) continue;

      // Mark i through j-1 for removal (keep j onward)
      for (let k = i; k < j; k++) skip.add(k);
      break;
    }
  }
  return skip;
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
  const cleanLines: SnapshotLine[] = [];
  const rawToCleanMap = new Map<number, number>();

  // Pre-scan for stutters (partial TUI renders quickly superseded by full renders).
  // Marked lines are skipped during dedup — they represent transient animation frames.
  const stutterSkip = detectStutters(rawLines);

  // Hash index: lineText → sorted array of clean positions with that text.
  // Used for O(1) candidate lookups when scanning epoch lines.
  const cleanIndex = new Map<string, number[]>();

  /** Add a line to the clean document and update the hash index. */
  function addToClean(rawIdx: number, line: SnapshotLine): number {
    const cleanPos = cleanLines.length;
    cleanLines.push(line);
    rawToCleanMap.set(rawIdx, cleanPos);
    const key = lineKey(line);
    let positions = cleanIndex.get(key);
    if (!positions) {
      positions = [];
      cleanIndex.set(key, positions);
    }
    positions.push(cleanPos);
    return cleanPos;
  }

  // Extract epoch ranges from raw lines
  const epochRanges: { start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const boundary of epochBoundaries) {
    epochRanges.push({ start: prevEnd, end: boundary.rawLineCount });
    prevEnd = boundary.rawLineCount;
  }
  epochRanges.push({ start: prevEnd, end: rawLines.length });

  // Process all epochs (including epoch 0).
  // For each line, find the longest contiguous block starting at that position
  // that matches consecutive lines in the clean doc. Blocks >= MIN_MATCH are
  // treated as re-renders. Non-matching lines are appended as new content
  // and immediately indexed — so within-epoch AND cross-epoch duplicates are caught.
  for (let epochIdx = 0; epochIdx < epochRanges.length; epochIdx++) {
    const curr = epochRanges[epochIdx];
    const currLen = curr.end - curr.start;
    if (currLen === 0) continue;

    let i = 0;
    while (i < currLen) {
      const rawIdx = curr.start + i;

      // Skip stuttered lines (transient partial renders)
      if (stutterSkip.has(rawIdx)) {
        i++;
        continue;
      }

      // Find longest contiguous block starting at position i
      const key = lineKey(rawLines[rawIdx]);
      const candidates = cleanIndex.get(key);

      let bestLen = 0;
      let bestCleanStart = -1;

      if (candidates) {
        for (const cleanPos of candidates) {
          let len = 0;
          while (
            i + len < currLen &&
            cleanPos + len < cleanLines.length &&
            lineKey(rawLines[curr.start + i + len]) === lineKey(cleanLines[cleanPos + len])
          ) {
            len++;
          }
          if (len > bestLen) {
            bestLen = len;
            bestCleanStart = cleanPos;
          }
        }
      }

      if (bestLen >= MIN_MATCH) {
        // Map block lines to existing clean positions
        for (let j = 0; j < bestLen; j++) {
          rawToCleanMap.set(curr.start + i + j, bestCleanStart + j);
        }
        i += bestLen;
      } else {
        // New content: append to clean doc (immediately available for future matches)
        addToClean(curr.start + i, rawLines[curr.start + i]);
        i++;
      }
    }
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
      return maxCleanAtRaw[rawLineCount];
    },
  };
}

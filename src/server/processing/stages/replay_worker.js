/**
 * Worker thread for the replay stage.
 *
 * Runs the VT replay loop synchronously in a background thread so the main
 * thread's event loop remains free to serve health checks and other requests.
 *
 * Receives a single message with { header, events, boundaries } and replies
 * with { rawSnapshot, sectionData, epochBoundaries } or { error: string }.
 *
 * Plain JavaScript (not TypeScript) so it can be imported directly by
 * Node.js worker_threads without any build step.
 */

import { workerData, parentPort } from 'node:worker_threads';
import { initVt, createVt } from '#vt-wasm';

const SCROLLBACK_SIZE = 200000;

/** Count LF characters in a string for approximate scrollback tracking. */
function countLFs(str) {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 10) count++;
  }
  return count;
}

/**
 * Build a set of event indices that must be processed individually (not batched).
 * These are events containing clear-screen escapes or events at section boundaries.
 */
function buildCriticalIndices(events, sectionEndMap) {
  const critical = new Set();
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
function buildSectionEndMap(boundaries, eventCount) {
  const map = new Map();
  for (let i = 0; i < boundaries.length; i++) {
    const next = boundaries[i + 1];
    const endEvent = i < boundaries.length - 1 && next !== undefined ? next.eventIndex : eventCount;
    map.set(endEvent, i);
  }
  return map;
}

/** Allocates empty section data slots. */
function initSectionData(count) {
  return new Array(count).fill(null).map(() => ({ lineCount: null, snapshot: null }));
}

/** Handles resize events, returns new row count. */
function handleResizeEvent(vt, data, currentRows) {
  const match = /^(\d+)x(\d+)$/.exec(String(data));
  if (match?.[1] !== undefined && match?.[2] !== undefined) {
    vt.resize(Number.parseInt(match[1], 10), Number.parseInt(match[2], 10));
    return Number.parseInt(match[2], 10);
  }
  return currentRows;
}

/** Records a clear-screen epoch boundary if line count changed. */
function recordEpochBoundary(eventIndex, approxLineCount, epochBoundaries) {
  if (epochBoundaries.at(-1)?.rawLineCount !== approxLineCount) {
    epochBoundaries.push({ eventIndex, rawLineCount: approxLineCount });
  }
}

/** Captures section data at a CLI/TUI boundary. Returns updated high water mark. */
function captureSectionSnapshot(vt, inAltScreen, boundaryIdx, highWaterLineCount, approxLineCount, sectionData) {
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

/** Run the full replay loop synchronously. */
function runReplay(header, events, boundaries) {
  const vt = createVt(header.width, header.height, SCROLLBACK_SIZE);

  try {
    const eventCount = events.length;
    const sectionEndMap = buildSectionEndMap(boundaries, eventCount);
    const criticalIndices = buildCriticalIndices(events, sectionEndMap);
    const sectionData = initSectionData(boundaries.length);
    const epochBoundaries = [];

    let inAltScreen = false;
    let highWaterLineCount = 0;
    let termRows = header.height;
    let approxLineCount = 0;
    let batchText = '';
    let batchCount = 0;

    const BATCH_SIZE = 1000;

    for (let j = 0; j < eventCount; j++) {
      const event = events[j];
      if (!event) continue;
      const [, eventType, data] = event;

      if (eventType === 'r') {
        if (batchText) {
          vt.feed(batchText);
          batchText = '';
          batchCount = 0;
        }
        termRows = handleResizeEvent(vt, data, termRows);
        continue;
      }

      if (eventType !== 'o') continue;

      const str = String(data);
      const fed = str.replaceAll('\x1b[3J', '');

      const isCritical = criticalIndices.has(j);
      const boundaryIdx = sectionEndMap.get(j + 1);

      if (isCritical || boundaryIdx !== undefined) {
        if (batchText) {
          vt.feed(batchText);
          batchText = '';
          batchCount = 0;
        }

        vt.feed(fed);
        if (str.includes('\x1b[?1049h')) inAltScreen = true;
        if (str.includes('\x1b[?1049l')) inAltScreen = false;

        if (!inAltScreen) {
          approxLineCount += countLFs(fed);
          if (str.includes('\x1b[2J') || str.includes('\x1b[3J')) {
            recordEpochBoundary(j, approxLineCount, epochBoundaries);
          }
        }

        if (boundaryIdx !== undefined) {
          highWaterLineCount = captureSectionSnapshot(
            vt, inAltScreen, boundaryIdx, highWaterLineCount, approxLineCount, sectionData
          );
        }
      } else {
        batchText += fed;
        batchCount++;

        if (str.includes('\x1b[?1049h')) inAltScreen = true;
        if (str.includes('\x1b[?1049l')) inAltScreen = false;
        if (!inAltScreen) approxLineCount += countLFs(fed);

        if (batchCount >= BATCH_SIZE) {
          vt.feed(batchText);
          batchText = '';
          batchCount = 0;
        }
      }
    }

    if (batchText) {
      vt.feed(batchText);
    }

    const rawSnapshot = vt.getAllLines();
    return { rawSnapshot, sectionData, epochBoundaries };
  } finally {
    vt.free();
  }
}

// Main worker entry point
async function main() {
  try {
    await initVt();
    const { header, events, boundaries } = workerData;
    const result = runReplay(header, events, boundaries);
    parentPort?.postMessage({ ok: true, result });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

main().catch((err) => {
  parentPort?.postMessage({ ok: false, error: String(err) });
});

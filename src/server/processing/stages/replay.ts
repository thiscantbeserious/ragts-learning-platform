/**
 * Replay stage: replays events through the VT terminal engine, capturing snapshots at section boundaries.
 *
 * Extracted from processSessionPipeline step 3 (replaySession).
 * Runs in a worker thread so the main event loop remains free during CPU-intensive WASM processing.
 * Requires initVt() to have been called in the main thread before first use.
 * The orchestrator emits `session.replayed` after this stage succeeds.
 *
 * Worker thread design: the WASM VT engine (avt) is synchronous; vt.getAllLines() for large
 * sessions (60K+ lines) blocks the V8 thread for 8+ seconds. Offloading to a worker thread
 * keeps the main thread responsive to health checks and API requests throughout processing.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
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

/** Path to the replay worker script. Co-located with this module. */
const WORKER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'replay_worker.js'
);

/**
 * Replay events through the VT engine in a worker thread.
 * Returns the full session document and per-section data for the dedup stage.
 * Non-blocking: the main thread remains free while WASM processes events.
 */
export function replay(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  boundaries: SectionBoundary[]
): Promise<ReplayResult> {
  return new Promise<ReplayResult>((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { header, events, boundaries },
    });

    // Guard against double-settlement: if the worker crashes, both 'error' and
    // 'exit' fire. Without this flag, reject() would be called twice — an
    // unhandled rejection under --unhandled-rejections=throw (Node 15+ default).
    let settled = false;

    worker.once('message', (msg: { ok: boolean; result?: ReplayResult; error?: string }) => {
      if (settled) return;
      settled = true;
      if (msg.ok && msg.result !== undefined) {
        resolve(msg.result);
      } else {
        reject(new Error(msg.error ?? 'Replay worker returned no result'));
      }
    });

    worker.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    worker.once('exit', (code) => {
      if (settled) return;
      if (code !== 0) {
        settled = true;
        reject(new Error(`Replay worker exited with code ${code}`));
      }
    });
  });
}

/**
 * Pipeline worker thread: runs validate → detect → replay → dedup in sequence.
 *
 * Follows the WorkerPool message protocol:
 * - On startup: calls initVt(), then posts { type: 'ready' }
 * - On { type: 'job', id, payload }: runs all stages, posts { type: 'result', id, ok, result/error }
 *
 * The store stage is intentionally excluded — it requires DB access and runs on the main thread
 * after the worker returns the ProcessedSession.
 *
 * Connections: WorkerPool (worker_pool.ts), PipelineOrchestrator (pipeline_orchestrator.ts).
 */

import { parentPort } from 'node:worker_threads';
import { initVt } from '#vt-wasm';
// Standard .js extensions — esbuild bundles these at pool startup.
import { validate } from '../processing/stages/validate.js';
import { detect } from '../processing/stages/detect.js';
import { replaySync } from '../processing/stages/replay.js';
import { dedup } from '../processing/stages/dedup.js';
import type { ProcessedSession } from '../processing/types.js';

/** Payload sent from orchestrator to this worker. */
export interface PipelinePayload {
  filePath: string;
  sessionId: string;
}

/** Message received from WorkerPool. */
type JobMessage = {
  type: 'job';
  id: number;
  payload: PipelinePayload;
};

/** Post a successful result back to the pool. */
function postResult(id: number, result: ProcessedSession): void {
  parentPort!.postMessage({ type: 'result', id, ok: true, result });
}

/** Post an error result back to the pool. */
function postError(id: number, stage: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  parentPort!.postMessage({ type: 'result', id, ok: false, error: message, stage });
}

/** Handle an incoming job message. */
async function handleJob(msg: JobMessage): Promise<void> {
  const { id, payload } = msg;
  let stageName = 'validate';

  try {
    const validateResult = await validate(payload.filePath, payload.sessionId);

    stageName = 'detect';
    const detectResult = detect(validateResult.events, validateResult.markers);

    stageName = 'replay';
    const replayResult = replaySync(validateResult.header, validateResult.events, detectResult.boundaries);

    stageName = 'dedup';
    const processed = dedup(
      payload.sessionId,
      replayResult.rawSnapshot,
      replayResult.sectionData,
      replayResult.epochBoundaries,
      detectResult.boundaries,
      validateResult.eventCount
    );

    postResult(id, processed);
  } catch (error) {
    postError(id, stageName, error);
  }
}

/** Worker entry point: init WASM, signal ready, then process jobs. */
async function main(): Promise<void> {
  await initVt();
  parentPort!.postMessage({ type: 'ready' });

  parentPort!.on('message', (msg: JobMessage) => {
    if (msg.type === 'job') {
      void handleJob(msg);
    }
  });
}

try {
  await main();
} catch (err: unknown) {
  // Fatal: WASM init failed. Worker cannot function — exit so the pool respawns.
  process.stderr.write(`pipeline_worker fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

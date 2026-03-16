/**
 * Minimal worker for testing WorkerPool crash recovery.
 * Crashes when payload contains { crash: true }, otherwise echoes back.
 */

import { parentPort } from 'node:worker_threads';

parentPort!.postMessage({ type: 'ready' });

parentPort!.on('message', (msg: { type: string; id: number; payload: unknown }) => {
  if (msg.type !== 'job') return;

  const payload = msg.payload as Record<string, unknown>;

  if (payload.crash === true) {
    process.exit(1);
  }

  setTimeout(() => {
    parentPort!.postMessage({ type: 'result', id: msg.id, ok: true, result: msg.payload });
  }, 10);
});

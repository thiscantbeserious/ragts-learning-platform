/**
 * Minimal worker for testing WorkerPool.
 * Echoes the payload back as the result after a short delay.
 */

import { parentPort } from 'node:worker_threads';

parentPort!.postMessage({ type: 'ready' });

parentPort!.on('message', (msg: { type: string; id: number; payload: unknown }) => {
  if (msg.type === 'job') {
    setTimeout(() => {
      parentPort!.postMessage({ type: 'result', id: msg.id, ok: true, result: msg.payload });
    }, 10);
  }
});

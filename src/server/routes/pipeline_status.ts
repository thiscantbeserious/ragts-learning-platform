/**
 * SSE endpoint for global pipeline status streaming.
 *
 * Streams aggregate pipeline state to connected clients. Unlike the per-session
 * SSE endpoint, this connection has no terminal state — it stays open for the
 * client's lifetime. The connection does NOT use the per-session sse_connections
 * budget tracker.
 *
 * Connections: PipelineStatusService (services/).
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { PipelineStatusService } from '../services/pipeline_status_service.js';
import type { PipelineStatusSnapshot } from '../../shared/types/pipeline_status.js';
import { startKeepalive } from '../utils/sse_keepalive.js';

/** Minimal SSE message shape accepted by streamSSE. */
interface SseMessage {
  event?: string;
  data: string;
}

/** Build the JSON payload for a pipeline-status SSE event. */
function buildEventPayload(snapshot: PipelineStatusSnapshot): string {
  return JSON.stringify({ type: 'pipeline-status', data: snapshot });
}

/**
 * Handle GET /api/pipeline/status — global pipeline SSE stream.
 *
 * On connection, emits the current pipeline snapshot as a pipeline-status event.
 * Subscribes to PipelineStatusService for state updates and emits them as they arrive.
 * Sends keepalive pings every 30 seconds. Cleans up on client disconnect.
 */
export async function handlePipelineStatus(
  c: Context,
  service: PipelineStatusService,
): Promise<Response> {
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  return streamSSE(c, async (stream) => {
    let closed = false;

    const cleanup = () => {
      closed = true;
      service.offUpdate(handleUpdate);
    };

    // Serial write queue — coalesces rapid updates, prevents interleaved frames,
    // and catches write errors on a closed stream without unhandled rejections.
    let writing = false;
    let pendingSnapshot: PipelineStatusSnapshot | null = null;

    const drainQueue = async (): Promise<void> => {
      writing = true;
      while (pendingSnapshot !== null && !stream.closed) {
        const snap = pendingSnapshot;
        pendingSnapshot = null;
        try {
          await writeStatusEvent(stream, snap);
        } catch {
          cleanup();
          writing = false;
          return;
        }
      }
      writing = false;
    };

    const handleUpdate = (snapshot: PipelineStatusSnapshot) => {
      if (closed || stream.closed) {
        cleanup();
        return;
      }
      pendingSnapshot = snapshot;
      if (writing) return; // current drainQueue will pick up pendingSnapshot
      void drainQueue();
    };

    service.onUpdate(handleUpdate);

    const stopKeepalive = startKeepalive(stream, cleanup);

    try {
      const snapshot = service.getSnapshot();
      await writeStatusEvent(stream, snapshot);

      // Keep stream open until client disconnects using the request abort signal.
      // Falls back to stream.closed check when the signal is already aborted.
      await new Promise<void>((resolve) => {
        if (c.req.raw.signal.aborted) {
          resolve();
          return;
        }
        c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    } finally {
      stopKeepalive();
      cleanup();
    }
  });
}

/** Write a single pipeline-status SSE event to the stream. */
async function writeStatusEvent(
  stream: { writeSSE: (msg: SseMessage) => Promise<void> },
  snapshot: PipelineStatusSnapshot,
): Promise<void> {
  await stream.writeSSE({
    event: 'pipeline-status',
    data: buildEventPayload(snapshot),
  });
}

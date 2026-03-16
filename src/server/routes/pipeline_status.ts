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
  service: PipelineStatusService
): Promise<Response> {
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  return streamSSE(c, async (stream) => {
    let closed = false;

    const cleanup = () => {
      closed = true;
      service.offUpdate(handleUpdate);
    };

    const handleUpdate = (snapshot: PipelineStatusSnapshot) => {
      if (closed || stream.closed) { cleanup(); return; }
      void writeStatusEvent(stream, snapshot);
    };

    service.onUpdate(handleUpdate);

    const stopKeepalive = startKeepalive(stream, cleanup);

    try {
      const snapshot = service.getSnapshot();
      await writeStatusEvent(stream, snapshot);

      // Keep stream open until client disconnects.
      // The keepalive timer and the onUpdate callback drive further writes.
      await waitUntilClosed(stream);
    } finally {
      stopKeepalive();
      cleanup();
    }
  });
}

/** Write a single pipeline-status SSE event to the stream. */
async function writeStatusEvent(
  stream: { writeSSE: (msg: SseMessage) => Promise<void> },
  snapshot: PipelineStatusSnapshot
): Promise<void> {
  await stream.writeSSE({
    event: 'pipeline-status',
    data: buildEventPayload(snapshot),
  });
}

/**
 * Poll until the stream closes. Resolves when stream.closed becomes true.
 * Uses a short polling interval to avoid blocking the event loop.
 */
async function waitUntilClosed(stream: { closed: boolean }): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (stream.closed) { resolve(); return; }
      setTimeout(check, 1000);
    };
    check();
  });
}

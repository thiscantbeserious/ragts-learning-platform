/**
 * SSE keepalive timer. Sends periodic keepalive comments to prevent
 * reverse proxies from dropping idle SSE connections.
 *
 * Connections: used by SSE route handlers.
 */

/** Minimal SSE stream interface for keepalive. */
interface SseStream {
  writeSSE: (msg: { event: string; data: string }) => Promise<void>;
  closed: boolean;
}

/** Default keepalive interval (30 seconds). */
const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Start a keepalive timer that writes SSE comments at a regular interval.
 * Automatically clears itself when the stream closes or a write fails.
 * Returns a cleanup function to stop the timer.
 */
export function startKeepalive(
  stream: SseStream,
  onClose: () => void,
  intervalMs = DEFAULT_INTERVAL_MS,
): () => void {
  const timer = setInterval(async () => {
    if (stream.closed) {
      clearInterval(timer);
      onClose();
      return;
    }
    try {
      await stream.writeSSE({ event: 'keepalive', data: '' });
    } catch {
      clearInterval(timer);
      onClose();
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

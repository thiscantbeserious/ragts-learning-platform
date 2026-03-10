/**
 * Tracks active SSE connections per session and globally.
 * Prevents resource exhaustion from unbounded SSE connections.
 */

const MAX_GLOBAL = 50;
const MAX_PER_SESSION = 5;

const globalCount = { value: 0 };
const perSession = new Map<string, number>();

/**
 * Try to acquire an SSE connection slot.
 * Returns false if global or per-session limits are exceeded.
 */
export function acquireConnection(sessionId: string): boolean {
  if (globalCount.value >= MAX_GLOBAL) return false;
  const current = perSession.get(sessionId) ?? 0;
  if (current >= MAX_PER_SESSION) return false;
  globalCount.value++;
  perSession.set(sessionId, current + 1);
  return true;
}

/**
 * Release an SSE connection slot when a connection closes.
 * Safe to call even if the slot was never acquired.
 */
export function releaseConnection(sessionId: string): void {
  globalCount.value = Math.max(0, globalCount.value - 1);
  const current = perSession.get(sessionId) ?? 1;
  if (current <= 1) {
    perSession.delete(sessionId);
  } else {
    perSession.set(sessionId, current - 1);
  }
}

/** Reset all connection tracking. Useful in tests. */
export function resetConnections(): void {
  globalCount.value = 0;
  perSession.clear();
}

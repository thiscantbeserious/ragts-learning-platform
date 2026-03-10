/**
 * Simple in-memory per-key rate limiter.
 * Tracks the last action timestamp per key and enforces a minimum interval.
 */

export class RateLimiter {
  private readonly windowMs: number;
  private readonly timestamps = new Map<string, number>();

  /** @param windowMs Minimum milliseconds between allowed actions per key. */
  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /**
   * Returns true if the action is allowed for this key, false if rate-limited.
   * Updates the timestamp on success.
   */
  tryAcquire(key: string): boolean {
    const now = Date.now();
    const last = this.timestamps.get(key) ?? 0;
    if (now - last < this.windowMs) return false;
    this.timestamps.set(key, now);
    return true;
  }

  /** Reset all tracking. Useful in tests. */
  reset(): void {
    this.timestamps.clear();
  }
}

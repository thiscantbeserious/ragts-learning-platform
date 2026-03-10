// @vitest-environment node
/**
 * Unit tests for SSE connection tracking.
 * Covers global limit, per-session limit, acquire/release symmetry, and reset.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { acquireConnection, releaseConnection, resetConnections } from './sse_connections.js';

describe('sse_connections', () => {
  beforeEach(() => {
    resetConnections();
  });

  it('allows a connection when no limit is reached', () => {
    expect(acquireConnection('session-A')).toBe(true);
  });

  it('releases a connection and allows re-acquire', () => {
    acquireConnection('session-A');
    releaseConnection('session-A');
    expect(acquireConnection('session-A')).toBe(true);
  });

  it('denies when per-session limit (5) is reached', () => {
    for (let i = 0; i < 5; i++) {
      expect(acquireConnection('session-A')).toBe(true);
    }
    expect(acquireConnection('session-A')).toBe(false);
  });

  it('denies when global limit (50) is reached', () => {
    for (let i = 0; i < 50; i++) {
      expect(acquireConnection(`session-${i}`)).toBe(true);
    }
    expect(acquireConnection('session-overflow')).toBe(false);
  });

  it('releaseConnection removes per-session entry when count reaches zero', () => {
    acquireConnection('session-A');
    releaseConnection('session-A');
    // Acquiring again should still work (count was cleaned up)
    expect(acquireConnection('session-A')).toBe(true);
  });

  it('releaseConnection does not underflow below zero globally', () => {
    releaseConnection('session-nonexistent');
    // Should still be able to acquire normally after no-op release
    expect(acquireConnection('session-A')).toBe(true);
  });

  it('resetConnections clears all tracking', () => {
    for (let i = 0; i < 5; i++) acquireConnection('session-A');
    resetConnections();
    expect(acquireConnection('session-A')).toBe(true);
  });
});

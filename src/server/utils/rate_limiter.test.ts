// @vitest-environment node
/**
 * Unit tests for RateLimiter.
 * Covers allow-on-first-call, deny within window, and allow after window expires.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './rate_limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first call for a key', () => {
    const limiter = new RateLimiter(30_000);
    expect(limiter.tryAcquire('session-A')).toBe(true);
  });

  it('denies a second call within the window', () => {
    const limiter = new RateLimiter(30_000);
    limiter.tryAcquire('session-A');
    expect(limiter.tryAcquire('session-A')).toBe(false);
  });

  it('allows a call after the window has expired', () => {
    const limiter = new RateLimiter(30_000);
    limiter.tryAcquire('session-A');
    vi.advanceTimersByTime(30_001);
    expect(limiter.tryAcquire('session-A')).toBe(true);
  });

  it('tracks different keys independently', () => {
    const limiter = new RateLimiter(30_000);
    expect(limiter.tryAcquire('session-A')).toBe(true);
    expect(limiter.tryAcquire('session-B')).toBe(true);
    expect(limiter.tryAcquire('session-A')).toBe(false);
  });

  it('reset() clears all state so keys are allowed again', () => {
    const limiter = new RateLimiter(30_000);
    limiter.tryAcquire('session-A');
    limiter.reset();
    expect(limiter.tryAcquire('session-A')).toBe(true);
  });
});

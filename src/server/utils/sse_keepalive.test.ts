// @vitest-environment node
/**
 * Unit tests for the SSE keepalive timer utility.
 * Covers stream.closed detection and write-failure cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startKeepalive } from './sse_keepalive.js';

describe('startKeepalive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a cleanup function that stops the timer', () => {
    const stream = { writeSSE: vi.fn().mockResolvedValue(undefined), closed: false };
    const onClose = vi.fn();

    const stop = startKeepalive(stream, onClose, 1000);
    stop();

    // Advance time — no writes should happen after stop
    vi.advanceTimersByTime(3000);
    expect(stream.writeSSE).not.toHaveBeenCalled();
  });

  it('sends a keepalive event when the stream is open', async () => {
    const stream = { writeSSE: vi.fn().mockResolvedValue(undefined), closed: false };
    const onClose = vi.fn();

    startKeepalive(stream, onClose, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(stream.writeSSE).toHaveBeenCalledWith({ event: 'keepalive', data: '' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose and stops when stream.closed is true', async () => {
    const stream = { writeSSE: vi.fn().mockResolvedValue(undefined), closed: true };
    const onClose = vi.fn();

    startKeepalive(stream, onClose, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(stream.writeSSE).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();

    // Further ticks should not call onClose again
    await vi.advanceTimersByTimeAsync(1000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose and stops when writeSSE throws', async () => {
    const stream = {
      writeSSE: vi.fn().mockRejectedValue(new Error('Connection reset')),
      closed: false,
    };
    const onClose = vi.fn();

    startKeepalive(stream, onClose, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(stream.writeSSE).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    // Further ticks should not fire after the interval was cleared
    await vi.advanceTimersByTimeAsync(1000);
    expect(stream.writeSSE).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

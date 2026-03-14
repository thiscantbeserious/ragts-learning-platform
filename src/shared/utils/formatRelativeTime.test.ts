/**
 * Tests for formatRelativeTime utility.
 *
 * Covers: seconds, minutes, hours, days, weeks, months, yesterday.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime } from './format_relative_time.js';

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-03-11T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for a date within the last 60 seconds', () => {
    const date = new Date(NOW.getTime() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns "just now" for the current instant', () => {
    expect(formatRelativeTime(NOW)).toBe('just now');
  });

  it('returns "1m ago" for 1 minute ago', () => {
    const date = new Date(NOW.getTime() - 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1m ago');
  });

  it('returns "2m ago" for 2 minutes ago', () => {
    const date = new Date(NOW.getTime() - 2 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2m ago');
  });

  it('returns "59m ago" for 59 minutes ago', () => {
    const date = new Date(NOW.getTime() - 59 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('59m ago');
  });

  it('returns "1h ago" for 1 hour ago', () => {
    const date = new Date(NOW.getTime() - 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1h ago');
  });

  it('returns "3h ago" for 3 hours ago', () => {
    const date = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('3h ago');
  });

  it('returns "23h ago" for 23 hours ago', () => {
    const date = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('23h ago');
  });

  it('returns "yesterday" for exactly 24 hours ago', () => {
    const date = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('yesterday');
  });

  it('returns "2d ago" for 2 days ago', () => {
    const date = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2d ago');
  });

  it('returns "6d ago" for 6 days ago', () => {
    const date = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('6d ago');
  });

  it('returns "1w ago" for 7 days ago', () => {
    const date = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1w ago');
  });

  it('returns "3w ago" for 21 days ago', () => {
    const date = new Date(NOW.getTime() - 21 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('3w ago');
  });

  it('returns "1mo ago" for 30 days ago', () => {
    const date = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1mo ago');
  });

  it('returns "2mo ago" for 60 days ago', () => {
    const date = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2mo ago');
  });

  it('accepts a date string as input', () => {
    const dateStr = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(dateStr)).toBe('5m ago');
  });

  it('returns "unknown" for an invalid date input', () => {
    expect(formatRelativeTime('not-a-date')).toBe('unknown');
  });

  it('returns "just now" for a future date (handles clock skew)', () => {
    const date = new Date(NOW.getTime() + 60 * 1000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns "1y ago" for 365 days ago', () => {
    const date = new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('1y ago');
  });

  it('returns "2y ago" for 730 days ago', () => {
    const date = new Date(NOW.getTime() - 730 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe('2y ago');
  });
});

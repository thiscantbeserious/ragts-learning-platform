import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime, formatSize, formatPipelineStage } from './format';

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-03-10T12:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for a timestamp less than 60 seconds ago', () => {
    const iso = new Date(NOW - 45 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('just now');
  });

  it('returns "just now" for a timestamp exactly 0 seconds ago', () => {
    const iso = new Date(NOW).toISOString();
    expect(formatRelativeTime(iso)).toBe('just now');
  });

  it('returns "1 minute ago" for 1 minute ago', () => {
    const iso = new Date(NOW - 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('1 minute ago');
  });

  it('returns "5 minutes ago" for 5 minutes ago', () => {
    const iso = new Date(NOW - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('5 minutes ago');
  });

  it('returns "59 minutes ago" for 59 minutes ago', () => {
    const iso = new Date(NOW - 59 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('59 minutes ago');
  });

  it('returns "1 hour ago" for 1 hour ago', () => {
    const iso = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('1 hour ago');
  });

  it('returns "2 hours ago" for 2 hours ago', () => {
    const iso = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('2 hours ago');
  });

  it('returns "23 hours ago" for 23 hours ago', () => {
    const iso = new Date(NOW - 23 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('23 hours ago');
  });

  it('returns "yesterday" for exactly 24 hours ago', () => {
    const iso = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('yesterday');
  });

  it('returns "yesterday" for 47 hours ago', () => {
    const iso = new Date(NOW - 47 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('yesterday');
  });

  it('returns "3 days ago" for 3 days ago', () => {
    const iso = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('3 days ago');
  });

  it('returns "6 days ago" for 6 days ago', () => {
    const iso = new Date(NOW - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso)).toBe('6 days ago');
  });

  it('returns a short date string for 7 days ago', () => {
    const iso = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(iso);
    // Should be a formatted date like "Mar 3", not a relative label
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('returns a short date string for more than 7 days ago', () => {
    const iso = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(iso);
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

// ---------------------------------------------------------------------------
// formatSize
// ---------------------------------------------------------------------------

describe('formatSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('returns "500 B" for 500 bytes', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  it('returns "1023 B" for 1023 bytes', () => {
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('returns "1.0 KB" for exactly 1024 bytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
  });

  it('returns "1.5 KB" for 1536 bytes', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('returns "100.0 KB" for 102400 bytes', () => {
    expect(formatSize(102400)).toBe('100.0 KB');
  });

  it('returns "1024.0 KB" for 1048575 bytes', () => {
    // 1048575 / 1024 = 1023.999... which rounds to 1024.0 with one decimal place
    expect(formatSize(1048575)).toBe('1024.0 KB');
  });

  it('returns "1.0 MB" for exactly 1048576 bytes', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
  });

  it('returns "1.5 MB" for 1572864 bytes', () => {
    expect(formatSize(1572864)).toBe('1.5 MB');
  });

  it('returns "10.0 MB" for 10485760 bytes', () => {
    expect(formatSize(10485760)).toBe('10.0 MB');
  });
});

// ---------------------------------------------------------------------------
// formatPipelineStage
// ---------------------------------------------------------------------------

describe('formatPipelineStage', () => {
  it('maps "pending" to "Waiting to start..."', () => {
    expect(formatPipelineStage('pending')).toBe('Waiting to start...');
  });

  it('maps "queued" to "Queued for processing..."', () => {
    expect(formatPipelineStage('queued')).toBe('Queued for processing...');
  });

  it('maps "processing" to "Processing..."', () => {
    expect(formatPipelineStage('processing')).toBe('Processing...');
  });

  it('maps "validating" to "Validating format..."', () => {
    expect(formatPipelineStage('validating')).toBe('Validating format...');
  });

  it('maps "detecting" to "Detecting sections..."', () => {
    expect(formatPipelineStage('detecting')).toBe('Detecting sections...');
  });

  it('maps "replaying" to "Replaying terminal..."', () => {
    expect(formatPipelineStage('replaying')).toBe('Replaying terminal...');
  });

  it('maps "deduplicating" to "Deduplicating output..."', () => {
    expect(formatPipelineStage('deduplicating')).toBe('Deduplicating output...');
  });

  it('maps "storing" to "Storing results..."', () => {
    expect(formatPipelineStage('storing')).toBe('Storing results...');
  });

  it('maps "completed" to "Ready"', () => {
    expect(formatPipelineStage('completed')).toBe('Ready');
  });

  it('maps "failed" to "Failed"', () => {
    expect(formatPipelineStage('failed')).toBe('Failed');
  });

  it('maps "interrupted" to "Interrupted"', () => {
    expect(formatPipelineStage('interrupted')).toBe('Interrupted');
  });

  it('returns "Processing..." for an unknown status', () => {
    expect(formatPipelineStage('unknown-status')).toBe('Processing...');
  });
});

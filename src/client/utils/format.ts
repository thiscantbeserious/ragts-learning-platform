import type { DetectionStatus } from '../../shared/types/pipeline.js';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const PIPELINE_STAGE_LABELS: Record<DetectionStatus, string> = {
  pending: 'Waiting to start...',
  queued: 'Queued for processing...',
  processing: 'Processing...',
  validating: 'Validating format...',
  detecting: 'Detecting sections...',
  replaying: 'Replaying terminal...',
  deduplicating: 'Deduplicating output...',
  storing: 'Storing results...',
  completed: 'Ready',
  failed: 'Failed',
  interrupted: 'Interrupted',
};

/**
 * Formats an ISO date string as a human-readable relative time label.
 *
 * Returns progressively coarser labels as the age grows:
 * <1 min → "just now", <1 hr → "X minutes ago", <24 hr → "X hours ago",
 * <48 hr → "yesterday", <7 days → "X days ago", otherwise a short date ("Mar 6").
 */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();

  if (diffMs < MS_PER_MINUTE) return 'just now';
  if (diffMs < MS_PER_HOUR) return formatMinutes(diffMs);
  if (diffMs < MS_PER_DAY) return formatHours(diffMs);
  if (diffMs < 2 * MS_PER_DAY) return 'yesterday';
  if (diffMs < 7 * MS_PER_DAY) return formatDays(diffMs);

  return formatShortDate(iso);
}

/**
 * Formats a byte count as a human-readable size string.
 *
 * Thresholds: <1024 → "N B", <1048576 → "N.N KB", otherwise "N.N MB".
 */
export function formatSize(bytes: number): string {
  const KB = 1024;
  const MB = 1024 * KB;

  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

/**
 * Maps a DetectionStatus value to a human-readable pipeline stage label.
 *
 * Unknown values fall back to "Processing..." to handle future status additions gracefully.
 */
export function formatPipelineStage(status: string): string {
  return PIPELINE_STAGE_LABELS[status as DetectionStatus] ?? 'Processing...';
}

function formatMinutes(diffMs: number): string {
  const minutes = Math.floor(diffMs / MS_PER_MINUTE);
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}

function formatHours(diffMs: number): string {
  const hours = Math.floor(diffMs / MS_PER_HOUR);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function formatDays(diffMs: number): string {
  const days = Math.floor(diffMs / MS_PER_DAY);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

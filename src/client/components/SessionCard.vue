<template>
  <button
    class="session-card"
    :class="{ 'session-card--selected': isSelected }"
    type="button"
    @click="handleClick"
  >
    <!-- Row 1: filename + status dot -->
    <div class="session-card__row session-card__row--primary">
      <span class="session-card__filename">{{ session.filename }}</span>
      <span
        class="session-card__status-dot"
        :class="statusDotClasses"
        role="img"
        :aria-label="statusLabel"
      />
    </div>

    <!-- Row 2: section count + relative age -->
    <div class="session-card__row session-card__meta">
      <span class="session-card__sections">{{ sectionText }}</span>
      <span class="session-card__age">{{ relativeAge }}</span>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Session } from '../../shared/types/session.js';
import { formatRelativeTime } from '../../shared/utils/format_relative_time.js';

/**
 * SessionCard renders a single session entry in the sidebar list.
 * Shows filename (truncated), status indicator dot, section count, and relative age.
 * Navigates to /session/:id on click while keeping focus in the sidebar.
 */

interface Props {
  session: Session;
  /** Whether this card is the currently selected session. */
  isSelected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
});

const router = useRouter();

/** Maps detection_status to one of three display groups. */
type StatusGroup = 'ready' | 'processing' | 'failed';

const PROCESSING_STATUSES = new Set<Session['detection_status']>([
  'pending', 'processing', 'queued', 'validating',
  'detecting', 'replaying', 'deduplicating', 'storing',
]);

/** Derives the display group from the session's detection_status. */
const statusGroup = computed<StatusGroup>(() => {
  const s = props.session.detection_status;
  if (s === 'failed' || s === 'interrupted') return 'failed';
  if (s !== undefined && PROCESSING_STATUSES.has(s)) return 'processing';
  return 'ready';
});

/** CSS classes for the status indicator dot. */
const statusDotClasses = computed(() => ({
  'session-card__status-dot--ready': statusGroup.value === 'ready',
  'session-card__status-dot--processing': statusGroup.value === 'processing',
  'session-card__status-dot--failed': statusGroup.value === 'failed',
  'session-card__status-dot--pulse': statusGroup.value === 'processing',
}));

/** Human-readable aria-label for the status dot. */
const statusLabel = computed<string>(() => {
  if (statusGroup.value === 'processing') return 'Processing';
  if (statusGroup.value === 'failed') return 'Failed';
  return 'Ready';
});

/** Formatted section count text. */
const sectionText = computed<string>(() => {
  const count = props.session.detected_sections_count;
  if (count === null || count === undefined) return '— sections';
  return `${count} sections`;
});

/** Human-readable relative age of the session. */
const relativeAge = computed<string>(() =>
  formatRelativeTime(props.session.uploaded_at),
);

/** Navigates to the session detail route without moving focus out of the sidebar. */
function handleClick(): void {
  void router.push(`/session/${props.session.id}`);
}
</script>

<style scoped>
.session-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  padding: var(--rhythm-quarter) var(--space-3);
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-family: var(--font-body);
  box-sizing: border-box;
  transition: background 120ms ease-out;
}

.session-card:hover {
  background: var(--accent-primary-subtle);
}

.session-card:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}

.session-card--selected {
  border-left-color: var(--accent-primary);
  background: var(--accent-primary-subtle);
}

/* Row layout */
.session-card__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.session-card__row--primary {
  justify-content: space-between;
}

/* Filename — monospace, truncated */
.session-card__filename {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

/* Metadata row */
.session-card__meta {
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  gap: var(--space-2);
}

.session-card__sections,
.session-card__age {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card__age {
  margin-left: auto;
}

/* Status indicator dot */
.session-card__status-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.session-card__status-dot--ready {
  background: var(--status-success);
}

.session-card__status-dot--processing {
  background: var(--accent-primary);
}

.session-card__status-dot--failed {
  background: var(--status-error);
}

/* Pulse animation for processing state */
.session-card__status-dot--pulse {
  animation: status-pulse 1.4s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

/* Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .session-card__status-dot--pulse {
    animation: none;
  }
}
</style>

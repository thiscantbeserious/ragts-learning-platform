<template>
  <div
    class="session-card"
    :class="{ 'session-card--selected': isSelected }"
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <!-- Row 1: status dot + filename (dot on left as visual anchor) -->
    <div class="session-card__row session-card__row--primary">
      <span
        class="session-card__status-dot"
        :class="statusDotClasses"
        role="img"
        :aria-label="statusLabel"
      />
      <span class="session-card__filename">{{ session.filename }}</span>
    </div>

    <!-- Row 2: section count + relative age -->
    <div class="session-card__row session-card__meta">
      <span class="session-card__sections">{{ sectionText }}</span>
      <span class="session-card__age">{{ relativeAge }}</span>
    </div>

    <!-- ARIA live region: announces real-time status updates to screen readers -->
    <span
      class="session-card__live-region"
      :role="liveRole"
      aria-atomic="true"
      :aria-live="liveAriaPoliteness"
    >{{ liveAnnouncement }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Session } from '../../shared/types/session.js';
import { formatRelativeTime } from '../../shared/utils/format_relative_time.js';
import { useSSE } from '../composables/useSSE.js';

/**
 * SessionCard renders a single session entry in the sidebar list.
 * Shows filename (truncated), status indicator dot, section count, and relative age.
 * Navigates to /session/:id on click while keeping focus in the sidebar.
 * Status transitions are driven by SSE (or polling fallback) via useSSE.
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

// SSE reactive status — drives the status indicator dot
const sessionId = computed(() => props.session.id);
const initialStatus = computed(() => props.session.detection_status);
const { status: liveStatus } = useSSE(sessionId, initialStatus);

/** Maps detection_status to one of three display groups. */
type StatusGroup = 'ready' | 'processing' | 'failed';

const PROCESSING_STATUSES = new Set<Session['detection_status']>([
  'pending', 'processing', 'queued', 'validating',
  'detecting', 'replaying', 'deduplicating', 'storing',
]);

/** Derives the display group from the live (SSE-updated) status. */
const statusGroup = computed<StatusGroup>(() => {
  const s = liveStatus.value;
  if (s === 'failed' || s === 'interrupted') return 'failed';
  if (s !== undefined && PROCESSING_STATUSES.has(s)) return 'processing';
  return 'ready';
});

/** Whether the session just completed (for glow animation trigger). */
const justCompleted = ref(false);

/** CSS classes for the status indicator dot. */
const statusDotClasses = computed(() => ({
  'session-card__status-dot--ready': statusGroup.value === 'ready',
  'session-card__status-dot--processing': statusGroup.value === 'processing',
  'session-card__status-dot--failed': statusGroup.value === 'failed',
  'session-card__status-dot--pulse': statusGroup.value === 'processing',
  'session-card__status-dot--glow': justCompleted.value,
}));

/** Human-readable aria-label for the status dot. */
const statusLabel = computed<string>(() => {
  if (statusGroup.value === 'processing') return 'Processing';
  if (statusGroup.value === 'failed') return 'Failed';
  return 'Ready';
});

/**
 * ARIA live region role — "alert" for errors (assertive), "status" for processing
 * updates (polite). Errors get immediate announcement.
 */
const liveRole = computed<'status' | 'alert'>(() =>
  statusGroup.value === 'failed' ? 'alert' : 'status',
);

/** aria-live politeness derived from role. */
const liveAriaPoliteness = computed<'polite' | 'assertive'>(() =>
  liveRole.value === 'alert' ? 'assertive' : 'polite',
);

/** Text announced to screen readers when status changes. */
const liveAnnouncement = computed<string>(() => {
  const name = props.session.filename;
  if (statusGroup.value === 'processing') return `${name}: processing`;
  if (statusGroup.value === 'failed') return `${name}: failed`;
  return `${name}: ready`;
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
  gap: 1px; /* tighter row gap -- sub-token value */
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: var(--space-1\.5) var(--space-3); /* 6px vertical */
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-family: var(--font-body);
  box-sizing: border-box;
  transition: background var(--duration-fast) var(--easing-default),
              border-color var(--duration-fast) var(--easing-default);
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

/* Selected + hover: slightly stronger background */
.session-card--selected:hover {
  background: rgba(0, 212, 255, 0.12);
}

/* Row layout */
.session-card__row {
  display: flex;
  align-items: center;
  gap: var(--space-1\.5); /* 6px -- tighter than default space-2 */
  min-width: 0;
}

.session-card__row--primary {
  justify-content: flex-start;
}

/* Filename — monospace, truncated; dims at rest, brightens on interaction */
.session-card__filename {
  font-family: var(--font-mono);
  font-size: var(--text-sm); /* 12px -- one step smaller than text-base */
  line-height: var(--lh-sm);
  color: var(--text-secondary); /* dimmer at rest */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.session-card:hover .session-card__filename,
.session-card--selected .session-card__filename {
  color: var(--text-primary); /* brightens on hover/selected */
}

/* Metadata row -- indented to align under filename past dot + gap */
.session-card__meta {
  color: var(--text-muted);
  font-size: var(--text-xs); /* 10px -- one step smaller than text-sm */
  line-height: var(--lh-xs);
  gap: var(--space-2);
  padding-left: calc(6px + var(--space-1\.5)); /* dot width + row gap */
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

/* Status indicator dot -- 6px, smaller and more subtle than space-2 (8px) */
.session-card__status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
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

/* Glow burst animation for completion transition */
.session-card__status-dot--glow {
  animation: status-glow 0.6s ease-out forwards;
}

@keyframes status-glow {
  0% { box-shadow: 0 0 0 0 var(--status-success); transform: scale(1); }
  50% { box-shadow: 0 0 0 4px rgba(0, 255, 128, 0.4); transform: scale(1.2); }
  100% { box-shadow: 0 0 0 0 transparent; transform: scale(1); }
}

/* Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .session-card__status-dot--pulse,
  .session-card__status-dot--glow {
    animation: none;
  }
}

/* ARIA live region: visually hidden but accessible to screen readers */
.session-card__live-region {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>

<template>
  <div
    v-if="open"
    class="pipeline-dropdown"
    role="menu"
    @keydown="handleArrowKey"
    @click.stop
  >
    <div class="pipeline-dropdown__header">
      <span class="pipeline-dropdown__title">Pipeline Status</span>
      <span class="pipeline-dropdown__summary">{{ summaryText }}</span>
    </div>

    <!-- Processing section -->
    <div
      v-if="processingSessions.length"
      class="pipeline-dropdown__section pipeline-dropdown__section--processing"
    >
      <div class="pipeline-dropdown__label">
        Processing
      </div>
      <div
        v-for="session in processingSessions"
        :key="session.id"
        class="pipeline-item"
        role="menuitem"
        tabindex="-1"
      >
        <div
          class="mini-spinner"
          aria-hidden="true"
        />
        <span class="pipeline-item__name">{{ session.name }}</span>
        <span class="pipeline-item__status">{{ session.progress !== undefined ? session.progress + '%' : '' }}</span>
      </div>
    </div>

    <!-- Queued section -->
    <div
      v-if="queuedSessions.length"
      class="pipeline-dropdown__section pipeline-dropdown__section--queued"
    >
      <div class="pipeline-dropdown__label">
        Queued
      </div>
      <div
        v-for="session in queuedSessions"
        :key="session.id"
        class="pipeline-item"
        role="menuitem"
        tabindex="-1"
      >
        <div
          class="queue-dot"
          aria-hidden="true"
        />
        <span class="pipeline-item__name">{{ session.name }}</span>
        <span class="pipeline-item__status">{{ session.queuePosition !== undefined ? '#' + session.queuePosition : '' }}</span>
      </div>
    </div>

    <!-- Recently Completed section — omit when empty -->
    <div
      v-if="recentlyCompleted.length"
      class="pipeline-dropdown__section pipeline-dropdown__section--completed"
    >
      <div class="pipeline-dropdown__label">
        Recently Completed
      </div>
      <div
        v-for="session in recentlyCompleted"
        :key="session.id"
        class="pipeline-item"
        role="menuitem"
        tabindex="-1"
      >
        <span
          class="icon icon-check pipeline-item__check"
          aria-hidden="true"
        />
        <span class="pipeline-item__name">{{ session.name }}</span>
        <span class="pipeline-item__status">{{ session.completedAt ? formatRelativeTime(session.completedAt) : '' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue';
import { pipelineStatusKey } from '../../composables/usePipelineStatus.js';
import { formatRelativeTime } from '../../../shared/utils/format_relative_time.js';

/**
 * PipelineDropdown — popover panel showing processing, queued, and recently
 * completed pipeline sessions. Positioned absolutely below the pipeline-wrap
 * container (which must have position:relative). CSS copied from Draft 2b mockup.
 *
 * Implements role="menu" with role="menuitem" on each pipeline-item. Arrow key
 * navigation (Up/Down) cycles focus through all items in DOM order. Items are
 * not in the normal tab order (tabindex="-1"); they are removed from DOM when
 * the dropdown is closed via v-if.
 */

const props = defineProps<{
  /** Controls whether the dropdown is rendered. */
  open: boolean;
}>();

// props.open is consumed by the v-if in the template.

const pipelineStatus = inject(pipelineStatusKey);

/** Sessions actively processing. */
const processingSessions = computed(() => pipelineStatus?.processingSessions.value ?? []);

/** Sessions waiting in queue. */
const queuedSessions = computed(() => pipelineStatus?.queuedSessions.value ?? []);

/** Sessions that completed recently. */
const recentlyCompleted = computed(() => pipelineStatus?.recentlyCompleted.value ?? []);

/** Total active (processing + queued). */
const totalActive = computed(() => pipelineStatus?.totalActive.value ?? 0);

/** Header summary line, e.g. "1 active / 2 queued" or "0 active". */
const summaryText = computed(() => {
  const active = processingSessions.value.length;
  const queued = queuedSessions.value.length;
  if (active === 0 && queued === 0) return `${totalActive.value} active`;
  const parts: string[] = [`${active} active`];
  if (queued > 0) parts.push(`${queued} queued`);
  return parts.join(' / ');
});

/**
 * Handle ArrowUp/ArrowDown keyboard navigation within the dropdown menu.
 * Collects all .pipeline-item elements in DOM order and cycles focus between
 * them, wrapping at the boundaries.
 */
function handleArrowKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();

  const container = (event.currentTarget as HTMLElement);
  const items = Array.from(container.querySelectorAll<HTMLElement>('.pipeline-item'));
  if (items.length === 0) return;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex = (currentIndex + direction + items.length) % items.length;
  items[nextIndex]?.focus();
}

</script>

<style scoped>
/**
 * Pipeline dropdown panel — CSS copied directly from Draft 2b (draft-2b-lucide.html).
 */
/* Dropdown is teleported to <body> so it falls outside the .toolbar-pill
   cascade. Tokens are repeated here with fallback values. */
.pipeline-dropdown {
  --toolbar-dropdown-bg: rgba(28, 28, 50, 0.95);
  --toolbar-dropdown-border: rgba(0, 212, 255, 0.2);
  --toolbar-dropdown-glow: rgba(0, 212, 255, 0.08);
  --toolbar-dropdown-header-border: rgba(0, 212, 255, 0.1);
  --toolbar-dropdown-section-border: rgba(0, 212, 255, 0.06);
  --toolbar-spinner-border: rgba(0, 212, 255, 0.2);

  width: 340px;
  background: var(--toolbar-dropdown-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--toolbar-dropdown-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg), 0 0 30px var(--toolbar-dropdown-glow);
  z-index: calc(var(--z-overlay-panel, 201) + 1);
  overflow: hidden;
}

.pipeline-dropdown__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--toolbar-dropdown-header-border);
}

.pipeline-dropdown__title {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
}

.pipeline-dropdown__summary {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--accent-primary);
}

.pipeline-dropdown__section {
  padding: var(--space-3) var(--space-4);
}

.pipeline-dropdown__section + .pipeline-dropdown__section {
  border-top: 1px solid var(--toolbar-dropdown-section-border);
}

.pipeline-dropdown__label {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  margin-bottom: var(--space-2);
}

.pipeline-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1\.5) 0;
  outline: none;
}

.pipeline-item:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.pipeline-item__name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipeline-item__status {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.pipeline-item__check {
  color: var(--status-success);
  flex-shrink: 0;
}

.mini-spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--toolbar-spinner-border);
  border-top-color: var(--accent-primary);
  border-radius: var(--radius-full);
  animation: pipeline-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes pipeline-spin {
  to { transform: rotate(360deg); }
}

.queue-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--status-warning);
  flex-shrink: 0;
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .mini-spinner {
    animation: none;
  }
}
</style>

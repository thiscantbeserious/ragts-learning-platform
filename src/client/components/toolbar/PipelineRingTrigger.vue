<template>
  <div
    class="pipeline-wrap"
    @keydown.escape="closeDropdown"
    @click.stop
  >
    <button
      ref="triggerButtonRef"
      class="pipeline-ring-trigger"
      type="button"
      :aria-label="`Pipeline: ${totalActive} active`"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
    >
      <svg
        class="progress-ring"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
      >
        <circle
          class="progress-ring__bg"
          cx="12"
          cy="12"
          r="9"
        />
        <circle
          class="progress-ring__fill"
          cx="12"
          cy="12"
          r="9"
          stroke-dasharray="56.55"
          :stroke-dashoffset="dashOffset"
        />
        <text
          class="ring-count"
          x="12"
          y="12"
        >{{ totalActive }}</text>
      </svg>
      <span class="pipeline-label">Pipeline</span>
    </button>

    <PipelineDropdown :open="isOpen" />
  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref, onMounted, onUnmounted } from 'vue';
import { pipelineStatusKey } from '../../composables/usePipelineStatus.js';
import PipelineDropdown from './PipelineDropdown.vue';

/**
 * PipelineRingTrigger — SVG progress ring showing active pipeline session count.
 * Manages the open/close state of PipelineDropdown.
 * Injects pipeline status from SpatialShell via pipelineStatusKey.
 * CSS and markup follow the Draft 2b approved mockup exactly.
 */

const CIRCUMFERENCE = 56.55;

const pipelineStatus = inject(pipelineStatusKey);

/** Total active sessions (processing + queued). Defaults to 0 when not provided. */
const totalActive = computed(() => pipelineStatus?.totalActive.value ?? 0);

/**
 * Stroke-dashoffset for the SVG fill arc.
 * Binary active/inactive indicator — ring shows "work in progress" (42% arc)
 * whenever totalActive > 0, disappears when idle.
 */
const dashOffset = computed(() => {
  if (totalActive.value === 0) return CIRCUMFERENCE;
  // Fixed 42% arc from the Draft 2b approved mockup (offset 32.79 = 58% of 56.55)
  return 32.79;
});

// ---------------------------------------------------------------------------
// Dropdown state
// ---------------------------------------------------------------------------

/** Template ref to the trigger button, used to restore focus on close. */
const triggerButtonRef = ref<{ focus(): void } | null>(null);

const isOpen = ref(false);

/** Toggle the dropdown open/close. */
function toggleDropdown(): void {
  isOpen.value = !isOpen.value;
}

/** Close the dropdown and return focus to the trigger button. */
function closeDropdown(): void {
  isOpen.value = false;
  triggerButtonRef.value?.focus();
}

/**
 * Handle document-level clicks to close on outside click.
 * The pipeline-wrap uses @click.stop, so any click that reaches the document
 * originated outside the component — close the dropdown unconditionally.
 */
function handleDocumentClick(): void {
  closeDropdown();
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<style scoped>
/**
 * pipeline-wrap: relative container so dropdown positions correctly.
 */
.pipeline-wrap {
  position: relative;
}

/**
 * Pipeline ring trigger button — from Draft 2b (draft-2b-lucide.html).
 * CSS values copied exactly from the approved mockup spec.
 */
.pipeline-ring-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 30px;
  padding: 0 var(--space-3) 0 var(--space-1);
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all var(--duration-normal) var(--easing-default);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}

.pipeline-ring-trigger:hover {
  background: rgba(0, 212, 255, 0.12);
  border-color: rgba(0, 212, 255, 0.3);
  color: var(--accent-primary);
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.2);
}

/* SVG progress ring */
.progress-ring {
  width: 24px;
  height: 24px;
  transform: rotate(-90deg);
  flex-shrink: 0;
}

.progress-ring__bg {
  fill: none;
  stroke: rgba(0, 212, 255, 0.12);
  stroke-width: 2.5;
}

.progress-ring__fill {
  fill: none;
  stroke: var(--accent-primary);
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.5s ease;
  filter: drop-shadow(0 0 3px rgba(0, 212, 255, 0.5));
}

.ring-count {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: var(--weight-bold);
  fill: var(--accent-primary);
  text-anchor: middle;
  dominant-baseline: central;
  transform: rotate(90deg);
  transform-origin: 12px 12px;
}

.pipeline-label {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--weight-medium);
}

@media (prefers-reduced-motion: reduce) {
  .progress-ring__fill {
    transition: none;
  }
  .pipeline-ring-trigger {
    transition: none;
  }
}
</style>

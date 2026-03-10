<script setup lang="ts">
/**
 * Gallery card component displaying a session in the populated landing page grid.
 * Renders different states (ready, processing, failed) with connection dot for degraded SSE states.
 */

import type { Session } from '../../shared/types/session.js';
import type { SseConnectionState } from '../composables/useSessionSSE.js';
import { formatRelativeTime, formatSize, formatPipelineStage } from '../utils/format.js';

const props = defineProps<{
  session: Session;
  connectionState?: SseConnectionState;
}>();

const PROCESSING_STATUSES = new Set([
  'pending', 'queued', 'processing', 'validating',
  'detecting', 'replaying', 'deduplicating', 'storing',
]);

const FAILED_STATUSES = new Set(['failed', 'interrupted']);

function isReady(): boolean {
  return props.session.detection_status === 'completed';
}

function isProcessing(): boolean {
  return PROCESSING_STATUSES.has(props.session.detection_status ?? '');
}

function isFailed(): boolean {
  return FAILED_STATUSES.has(props.session.detection_status ?? '');
}

/** Connection dot is shown only for degraded states (connecting or disconnected). */
function showConnectionDot(): boolean {
  return props.connectionState === 'connecting' || props.connectionState === 'disconnected';
}
</script>

<template>
  <router-link
    :to="{ name: 'session-detail', params: { id: session.id } }"
    class="landing__gallery-card"
    :class="{
      'landing__gallery-card--processing': isProcessing(),
      'landing__gallery-card--failed': isFailed(),
    }"
  >
    <!-- Connection dot — only for degraded SSE states -->
    <span
      v-if="showConnectionDot()"
      class="gallery-card__connection-dot"
      :class="{
        'gallery-card__connection-dot--connecting': connectionState === 'connecting',
        'gallery-card__connection-dot--disconnected': connectionState === 'disconnected',
      }"
    />

    <!-- Terminal preview -->
    <div class="landing__preview">
      <!-- Status badge overlay -->
      <div
        v-if="isProcessing()"
        class="landing__card-status"
      >
        <span class="badge badge--warning">
          <span class="spinner spinner--sm spinner--secondary" />
          Processing
        </span>
      </div>
      <div
        v-else-if="isFailed()"
        class="landing__card-status"
      >
        <span class="badge badge--error">
          <span class="icon icon--xs icon-error-circle" />
          Failed
        </span>
      </div>

      <!-- Titlebar with 3 dots and filename -->
      <div class="landing__preview-titlebar">
        <span class="landing__preview-dot" />
        <span class="landing__preview-dot" />
        <span class="landing__preview-dot" />
        <span class="landing__preview-title">{{ session.filename }}</span>
      </div>

      <!-- Preview content varies by state -->
      <div
        v-if="isProcessing()"
        class="landing__preview-processing"
      >
        <span class="spinner spinner--sm spinner--secondary" />
        <span class="landing__preview-processing-label">Analyzing session...</span>
      </div>
      <div
        v-else-if="isFailed()"
        class="landing__preview-failed"
      >
        <span class="icon icon--lg icon-error-circle" />
        <span class="landing__preview-failed-label">Parse failed</span>
      </div>
      <div
        v-else-if="isReady()"
        class="landing__preview-lines"
      >
        <div class="landing__preview-line">
          <span class="landing__preview-prompt">$ </span>
          <span class="landing__preview-cmd">{{ session.filename }}</span>
        </div>
      </div>
    </div>

    <!-- Card body -->
    <div class="landing__card-body">
      <span class="landing__card-filename">{{ session.filename }}</span>

      <!-- Meta area: varies by state -->
      <div
        v-if="isReady()"
        class="landing__card-meta"
      >
        <span class="landing__card-meta-item">
          <span class="icon icon--xs icon-tag" />
          {{ session.marker_count }} marker{{ session.marker_count !== 1 ? 's' : '' }}
        </span>
        <span
          v-if="session.detected_sections_count != null"
          class="landing__card-meta-item"
        >
          <span class="icon icon--xs icon-sections" />
          {{ session.detected_sections_count }} section{{ session.detected_sections_count !== 1 ? 's' : '' }}
        </span>
      </div>
      <div
        v-else-if="isProcessing()"
        class="landing__card-meta"
      >
        <span class="landing__card-processing-meta">
          <span class="dot-spinner dot-spinner--muted">
            <span class="dot-spinner__dot" />
            <span class="dot-spinner__dot" />
            <span class="dot-spinner__dot" />
          </span>
          {{ formatPipelineStage(session.detection_status ?? '') }}
        </span>
      </div>
      <div
        v-else-if="isFailed()"
        class="landing__card-meta"
      >
        <span class="landing__card-error">
          <span class="icon icon--xs icon-warning" />
          Invalid format
        </span>
      </div>

      <!-- Footer -->
      <div class="landing__card-footer">
        <span class="landing__card-date">{{ formatRelativeTime(session.uploaded_at) }}</span>
        <span class="landing__card-size">{{ formatSize(session.size_bytes) }}</span>
      </div>
    </div>
  </router-link>
</template>

<style scoped>
/* Connection dot — scoped because this is specific Vue behavior */
.gallery-card__connection-dot {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  z-index: 3;
}

.gallery-card__connection-dot--connecting {
  background: var(--status-warning);
  animation: pulse 1.5s ease-in-out infinite;
}

.gallery-card__connection-dot--disconnected {
  background: var(--status-error);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Ensure the router-link is positioned for the dot */
.landing__gallery-card {
  position: relative;
}
</style>

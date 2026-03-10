<script setup lang="ts">
/**
 * LandingPage orchestrates all session composables and renders
 * either the empty-state upload experience or the populated gallery.
 * Body class `.no-body-grid` is added when in empty state (Stage 8 adds the TRON atmosphere).
 */

import { computed, watch, onMounted, onUnmounted, ref } from 'vue';
import UploadZone from '../components/UploadZone.vue';
import SessionToolbar from '../components/SessionToolbar.vue';
import SessionGrid from '../components/SessionGrid.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useSessionList } from '../composables/useSessionList';
import { useSessionFilter, type SessionFilterGroup } from '../composables/useSessionFilter';
import { useSessionSSE } from '../composables/useSessionSSE';
import { useUpload } from '../composables/useUpload';
import { useToast } from '../composables/useToast';

const { sessions, loading, fetchSessions, updateSession } = useSessionList();
const { searchQuery, activeFilter, filteredSessions } = useSessionFilter(sessions);
const { connectionStates } = useSessionSSE(sessions, updateSession);
const { toasts, addToast, removeToast } = useToast();

const {
  uploading,
  error: uploadError,
  isDragging,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleFileInput,
  clearError,
} = useUpload(() => {
  fetchSessions();
  addToast('is being processed', 'success', 'Session uploaded');
});

/** File input ref for the compact upload strip's hidden input. */
const fileInputRef = ref<HTMLInputElement | null>(null);

/** Whether the page is in the empty state (no sessions, load complete). */
const isEmpty = computed(() => !loading.value && sessions.value.length === 0);

/** Triggers the hidden file input in the compact upload strip. */
function triggerFileInput(): void {
  fileInputRef.value?.click();
}

/** Resets search and status filter when the grid emits clear-filters. */
function clearFilters(): void {
  searchQuery.value = '';
  activeFilter.value = 'all';
}

/** Updates the active filter from toolbar emit, typed to SessionFilterGroup. */
function onActiveFilterUpdate(value: string): void {
  activeFilter.value = value as SessionFilterGroup;
}

// Body class management — suppress CSS body grid in empty state
function applyBodyClass(): void {
  if (isEmpty.value) {
    document.body.classList.add('no-body-grid');
  } else {
    document.body.classList.remove('no-body-grid');
  }
}

onMounted(applyBodyClass);
onUnmounted(() => document.body.classList.remove('no-body-grid'));
watch(isEmpty, applyBodyClass);
</script>

<template>
  <!-- Empty state: no sessions uploaded yet -->
  <div
    v-if="isEmpty"
    class="landing-empty"
  >
    <UploadZone
      :uploading="uploading"
      :error="uploadError"
      :is-dragging="isDragging"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @file-input="handleFileInput"
      @clear-error="clearError"
    />
    <p class="landing-empty__hint">
      Powered by <a
        href="https://github.com/thiscantbeserious/agent-session-recorder"
        target="_blank"
        rel="noopener"
      >AGR</a>
    </p>
    <p class="landing-empty__tagline">
      // the subagent deleted half your codebase again.
    </p>
  </div>

  <!-- Populated state: sessions exist -->
  <div
    v-else
    class="landing"
  >
    <!-- Compact upload strip -->
    <div
      class="landing__upload-strip"
      :class="{ 'landing__upload-strip--drag': isDragging }"
      tabindex="0"
      role="button"
      aria-label="Upload session files"
      @click="triggerFileInput"
      @drop.prevent="handleDrop"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <span class="landing__upload-strip-icon icon icon--md icon-upload" />
      <span class="landing__upload-strip-text">
        Drop <code>.cast</code> files here or click to upload
      </span>
      <input
        ref="fileInputRef"
        type="file"
        accept=".cast"
        style="display: none"
        @change="handleFileInput"
      />
    </div>

    <!-- Toolbar: search + filter pills + session count -->
    <SessionToolbar
      :search-query="searchQuery"
      :active-filter="activeFilter"
      :session-count="sessions.length"
      :filtered-count="filteredSessions.length"
      @update:search-query="searchQuery = $event"
      @update:active-filter="onActiveFilterUpdate($event)"
    />

    <!-- Session grid: skeletons / cards / no-results -->
    <SessionGrid
      :sessions="filteredSessions"
      :loading="loading"
      :connection-states="connectionStates"
      @clear-filters="clearFilters"
    />
  </div>

  <ToastContainer
    :toasts="toasts"
    @dismiss="removeToast"
  />
</template>

<style scoped>
/* ================================================================
   Landing Page — Empty State
   ================================================================ */
.landing-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-12) var(--container-padding);
  min-height: 60vh;
  text-align: center;
}

.landing-empty__hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.landing-empty__hint a {
  color: var(--accent-primary);
  text-decoration: none;
}

.landing-empty__hint a:hover {
  text-decoration: underline;
}

.landing-empty__tagline {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-disabled);
  letter-spacing: var(--tracking-wide);
}

/* ================================================================
   Landing Page — Populated State
   ================================================================ */

/* Main content area — wider than default container for grid */
.landing {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-8) var(--container-padding);
}

/* Compact upload strip — horizontal drop zone above session grid */
.landing__upload-strip {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border: var(--space-0\.5) dashed var(--border-strong);
  border-radius: var(--radius-xl);
  margin-bottom: var(--space-6);
  transition: all var(--duration-normal) var(--easing-default);
  cursor: pointer;
}

.landing__upload-strip:hover {
  border-color: var(--accent-primary);
  background: var(--accent-primary-subtle);
}

.landing__upload-strip:hover .landing__upload-strip-icon {
  color: var(--accent-primary);
}

.landing__upload-strip-icon {
  color: var(--text-muted);
  transition: color var(--duration-fast) var(--easing-default);
}

.landing__upload-strip-text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.landing__upload-strip-text code {
  color: var(--accent-primary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--accent-primary-subtle);
  padding: var(--space-0\.5) var(--space-1\.5);
  border-radius: var(--radius-sm);
}

/* Toolbar: search + filters + count row */
.landing__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-page);
  padding-block: var(--space-3);
  margin-top: calc(-1 * var(--space-3));
}

.landing__search {
  flex: 0 1 240px;
  min-width: 140px;
}

.landing__toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 1;
  min-width: 0;
}

/* Session count label */
.landing__session-count {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}

/* ================================================================
   SESSION GRID — Responsive card grid
   ================================================================ */
.landing__session-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

/* ================================================================
   NO RESULTS STATE
   ================================================================ */
.landing__no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-6);
  text-align: center;
  grid-column: 1 / -1;
}

.landing__no-results-text {
  font-size: var(--text-base);
  color: var(--text-muted);
}

.landing__no-results-action {
  font-size: var(--text-sm);
  color: var(--accent-primary);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-body);
  transition: color var(--duration-fast) var(--easing-default);
}

.landing__no-results-action:hover {
  text-decoration: underline;
}

/* Filter pill tinted variants */
.landing__pill--processing {
  border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border-default));
  color: var(--status-warning);
}

.landing__pill--processing.filter-pill--active {
  border-color: var(--status-warning);
  color: var(--status-warning);
  background: var(--status-warning-subtle);
}

.landing__pill--failed {
  border-color: color-mix(in srgb, var(--status-error) 30%, var(--border-default));
  color: var(--status-error-dim);
}

.landing__pill--failed.filter-pill--active {
  border-color: var(--status-error);
  color: var(--status-error);
  background: var(--status-error-subtle);
}

.landing__pill--ready.filter-pill--active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--accent-primary-subtle);
}

/* ================================================================
   RESPONSIVE
   ================================================================ */

/* Tablet: 2 columns */
@media (max-width: 1024px) {
  .landing__session-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Mobile */
@media (max-width: 767px) {
  .landing {
    padding: var(--space-6) var(--space-4);
  }

  .landing__session-grid {
    grid-template-columns: 1fr;
  }

  .landing__toolbar {
    flex-direction: column;
    gap: var(--space-3);
    align-items: stretch;
  }

  .landing__search {
    flex: none;
    width: 100%;
  }

  .landing__toolbar-right {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
  }

  .landing__session-count {
    text-align: center;
    margin-left: 0;
  }

  .landing__upload-strip {
    padding: var(--space-2) var(--space-3);
  }
}
</style>

<style>
/* ================================================================
   Gallery card styles — non-scoped so child components can use them.
   These styles apply to classes used by GalleryCard.vue and SkeletonCard.vue.
   ================================================================ */

/* GALLERY CARD — Terminal preview + metadata */
.landing__gallery-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid color-mix(in srgb, var(--border-default) 60%, transparent);
  border-radius: var(--radius-xl);
  overflow: hidden;
  transition: all var(--duration-normal) var(--easing-default);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}

.landing__gallery-card:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm), var(--glow-accent);
}

/* Terminal Preview Area */
.landing__preview {
  background: var(--terminal-bg);
  padding: var(--space-2) var(--space-3);
  min-height: 110px;
  position: relative;
  border-bottom: 1px solid color-mix(in srgb, var(--border-default) 40%, transparent);
}

.landing__preview-titlebar {
  display: flex;
  align-items: center;
  gap: var(--space-1\.5);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-1\.5);
  border-bottom: 1px solid color-mix(in srgb, var(--border-default) 25%, transparent);
}

.landing__preview-dot {
  width: var(--space-1\.5);
  height: var(--space-1\.5);
  border-radius: var(--radius-full);
  background: var(--border-strong);
  opacity: 0.5;
}

.landing__preview-title {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-disabled);
  letter-spacing: var(--tracking-wide);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.landing__preview-lines {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-mono);
  color: var(--terminal-text);
  overflow: hidden;
}

.landing__preview-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.landing__preview-prompt {
  color: var(--accent-primary);
}

.landing__preview-cmd {
  color: var(--text-primary);
}

/* Fade-out at the bottom of preview */
.landing__preview::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--space-6);
  background: linear-gradient(to bottom, transparent, var(--terminal-bg));
  pointer-events: none;
}

/* Card Body (below preview) */
.landing__card-body {
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.landing__card-filename {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.landing__card-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.landing__card-meta-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
}

.landing__card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-1\.5);
  border-top: 1px solid color-mix(in srgb, var(--border-default) 30%, transparent);
}

.landing__card-date {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.landing__card-size {
  font-size: var(--text-xs);
  color: var(--text-disabled);
  letter-spacing: var(--tracking-wide);
}

/* CARD STATE: PROCESSING */
.landing__gallery-card--processing {
  border-color: color-mix(in srgb, var(--status-warning) 25%, transparent);
}

.landing__preview-processing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 90px;
  color: var(--text-muted);
}

.landing__preview-processing-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: var(--tracking-wide);
}

.landing__card-processing-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* CARD STATE: FAILED */
.landing__gallery-card--failed {
  border-color: color-mix(in srgb, var(--status-error) 20%, transparent);
  opacity: 0.85;
}

.landing__gallery-card--failed:hover {
  opacity: 1;
  border-color: var(--status-error);
  box-shadow: var(--shadow-sm), var(--glow-error);
}

.landing__preview-failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 90px;
  color: var(--status-error-dim);
}

.landing__preview-failed-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--status-error-dim);
  letter-spacing: var(--tracking-wide);
}

.landing__card-error {
  font-size: var(--text-xs);
  color: var(--status-error-dim);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* STATUS BADGE OVERLAY (on card preview) */
.landing__card-status {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
}

/* SKELETON GRID CARD */
.landing__skeleton-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.landing__skeleton-preview {
  background: var(--terminal-bg);
  padding: var(--space-3);
  min-height: 110px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.landing__skeleton-body {
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.landing__skeleton-footer {
  display: flex;
  justify-content: space-between;
  padding-top: var(--space-1\.5);
  border-top: 1px solid color-mix(in srgb, var(--border-default) 30%, transparent);
}
</style>

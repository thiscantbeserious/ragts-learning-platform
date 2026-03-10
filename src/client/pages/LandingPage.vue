<script setup lang="ts">
/**
 * LandingPage orchestrates all session composables and renders
 * either the empty-state upload experience or the populated gallery.
 * Body class `.no-body-grid` is added when in empty state (Stage 8 adds the TRON atmosphere).
 */

import { computed, watch, onMounted, onUnmounted, ref } from 'vue';
import SessionToolbar from '../components/SessionToolbar.vue';
import SessionGrid from '../components/SessionGrid.vue';
import ToastContainer from '../components/ToastContainer.vue';
import BackgroundGrid from '../components/BackgroundGrid.vue';
import AmbientParticles from '../components/AmbientParticles.vue';
import PipelineVisualization from '../components/PipelineVisualization.vue';
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
  isDragging,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleFileInput,
} = useUpload(() => {
  fetchSessions();
  addToast('is being processed', 'success', 'Session uploaded');
});

/** File input ref for the compact upload strip's hidden input. */
const fileInputRef = ref<HTMLInputElement | null>(null);

/** File input ref for the empty-state drop zone's hidden input. */
const emptyFileInputRef = ref<HTMLInputElement | null>(null);

/** Triggers the hidden file input in the empty-state drop zone. */
function triggerEmptyFileInput(): void {
  emptyFileInputRef.value?.click();
}

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
  <!-- Empty state: no sessions uploaded yet — Stage 8 TRON atmosphere -->
  <!-- Copied from design/drafts/theme-tron-v1.html lines 1267-1491 -->
  <div
    v-if="isEmpty"
    class="landing-empty"
  >
    <!-- MAIN: SVG Pipeline + atmosphere + content overlay -->
    <main class="landing-empty__main">

      <!-- Background atmosphere layers — absolutely positioned, non-interactive -->
      <BackgroundGrid />
      <AmbientParticles />
      <PipelineVisualization />

      <!-- Content overlay — centered drop zone -->
      <div class="landing-empty__content">
        <!-- Drop zone — Flat TRON 2D, backdrop-filter blur, cyan border glow -->
        <!-- Copied from design/drafts/theme-tron-v1.html lines 1427-1471 -->
        <div
          class="landing-empty__drop-zone"
          :class="{ 'landing-empty__drop-zone--drag': isDragging }"
          tabindex="0"
          role="button"
          aria-label="Upload session files"
          @click="triggerEmptyFileInput"
          @drop.prevent="handleDrop"
          @dragover.prevent="handleDragOver"
          @dragleave="handleDragLeave"
        >
          <!-- Hidden file input -->
          <input
            ref="emptyFileInputRef"
            type="file"
            accept=".cast"
            style="display: none"
            @change="handleFileInput"
          />

          <!-- Upload icon with single thin disc ring, gentle bob animation -->
          <div class="landing-empty__upload-icon" style="position: relative;">
            <div
              class="landing-empty__disc-ring landing-empty__disc-ring--1"
              aria-hidden="true"
            />
            <svg
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 30v6h24v-6"/>
              <path d="M24 10v18"/>
              <path d="M16 18l8-8 8 8"/>
            </svg>
          </div>

          <!-- Heading -->
          <h1 class="landing-empty__heading">No sessions yet. Fix that.</h1>

          <!-- Subtitle -->
          <p class="landing-empty__subtitle">
            Drop a <code>.cast</code> file here or click to browse
            -- watch it unfold into something you can actually read.
          </p>

          <!-- CTA — TRON styled -->
          <button type="button" class="landing-empty__cta">Browse Files</button>
        </div>

        <!-- AGR hint -->
        <p class="landing-empty__hint">
          Recording sessions? Use
          <a
            href="https://github.com/thiscantbeserious/agent-session-recorder"
            target="_blank"
            rel="noopener"
          >AGR</a>
          to capture them.
        </p>
      </div>
    </main>

    <!-- Footer tagline -->
    <!-- Copied from design/drafts/theme-tron-v1.html lines 1486-1491 -->
    <footer class="landing-empty__footer">
      <p class="landing-empty__tagline">
        // the subagent deleted half your codebase again.<br />
        // at least now you can learn from it.
      </p>
    </footer>
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
   Landing Page — Empty State (Stage 8 TRON)
   Copied from design/drafts/theme-tron-v1.html lines 96-108
   ================================================================ */

.landing-empty {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
}

/* Copied from design/drafts/theme-tron-v1.html lines 102-108 */
.landing-empty__main {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ================================================================
   CONTENT OVERLAY — centered over the SVG
   Copied from design/drafts/theme-tron-v1.html lines 366-375
   ================================================================ */

.landing-empty__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-6) var(--space-8);
  max-width: 560px;
}

/* ================================================================
   DROP ZONE — FIX 4: Flat TRON 2D, backdrop-filter blur, cyan border glow
   Copied from design/drafts/theme-tron-v1.html lines 382-424
   ================================================================ */

.landing-empty__drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) 44px var(--space-8);
  border-radius: var(--radius-lg);
  cursor: pointer;
  background: rgba(10, 10, 25, 0.79);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 212, 255, 0.25);
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.6),
              0 0 8px rgba(0, 212, 255, 0.15),
              inset 0 0 8px rgba(0, 212, 255, 0.05);
  overflow: hidden;
  opacity: 0;
  transition: transform var(--duration-normal) var(--easing-default),
              box-shadow var(--duration-normal) var(--easing-default),
              border-color var(--duration-normal) var(--easing-default);
}

/* Hover: lift + intensify glow — TRON power-up feel */
.landing-empty__drop-zone:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 212, 255, 0.4);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.7),
              0 0 14px rgba(0, 212, 255, 0.25),
              inset 0 0 12px rgba(0, 212, 255, 0.08);
}

/* Focus visible ring — clean cyan outline */
.landing-empty__drop-zone:focus-visible {
  outline: 1px solid var(--accent-primary);
  outline-offset: 4px;
}

/* Drag-over state: border intensifies, glow pulses */
.landing-empty__drop-zone--drag {
  border-color: rgba(0, 212, 255, 0.5);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.7),
              0 0 16px rgba(0, 212, 255, 0.3),
              inset 0 0 16px rgba(0, 212, 255, 0.1);
}

/* ================================================================
   UPLOAD ICON — single thin disc ring, gentle bob animation
   Copied from design/drafts/theme-tron-v1.html lines 502-533
   ================================================================ */

/* FIX 4: Upload icon — simplified, single thin circle, no rotation */
.landing-empty__upload-icon {
  width: 44px;
  height: 44px;
  color: var(--accent-primary);
  opacity: 0;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 0 8px var(--accent-primary-glow));
}

.landing-empty__upload-icon svg {
  width: 100%;
  height: 100%;
}

/* FIX 4: Single thin circle, no rotation */
.landing-empty__disc-ring {
  position: absolute;
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}

.landing-empty__disc-ring--1 {
  width: 72px;
  height: 72px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* Heading */
.landing-empty__heading {
  font-family: var(--font-body);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.2;
  opacity: 0;
  position: relative;
  z-index: 2;
}

/* Subtitle */
.landing-empty__subtitle {
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.5;
  max-width: 400px;
  opacity: 0;
  position: relative;
  z-index: 2;
}

.landing-empty__subtitle code {
  color: var(--accent-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--accent-primary-subtle);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

/* CTA button — TRON clean geometric style
   Copied from design/drafts/theme-tron-v1.html lines 574-602 */
.landing-empty__cta {
  color: var(--accent-primary);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  font-family: var(--font-mono);
  text-decoration: none;
  cursor: pointer;
  opacity: 0;
  margin-top: var(--space-2);
  position: relative;
  z-index: 2;
  padding: 8px 24px;
  border: 1px solid rgba(0, 212, 255, 0.25);
  border-radius: var(--radius-sm);
  background: transparent;
  transition: all var(--duration-fast) var(--easing-default);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.landing-empty__cta:hover {
  background: rgba(0, 212, 255, 0.08);
  border-color: rgba(0, 212, 255, 0.5);
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.12),
              0 0 40px rgba(0, 212, 255, 0.04),
              inset 0 0 16px rgba(0, 212, 255, 0.04);
  color: var(--accent-primary-hover);
  text-decoration: none;
}

/* AGR hint — Copied from design/drafts/theme-tron-v1.html lines 604-621 */
.landing-empty__hint {
  margin-top: var(--space-5);
  font-size: var(--text-sm);
  color: var(--text-muted);
  opacity: 0;
}

.landing-empty__hint a {
  color: var(--accent-secondary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color var(--duration-fast) var(--easing-default);
}

.landing-empty__hint a:hover {
  border-bottom-color: var(--accent-secondary);
}

/* Footer tagline — Copied from design/drafts/theme-tron-v1.html lines 651-663 */
.landing-empty__footer {
  padding: var(--space-4) var(--space-6);
  text-align: center;
  opacity: 0;
}

.landing-empty__tagline {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-disabled);
  line-height: 1.7;
  letter-spacing: 0.08em;
}

/* ================================================================
   KEYFRAMES for empty state content entrance
   Copied from design/drafts/theme-tron-v1.html lines 687-689, 749-759
   ================================================================ */

@keyframes slideUpFadeIn {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes iconBob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
}

/* Drop zone entrance — TRON power-on */
@keyframes dropZoneReveal {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ================================================================
   REDUCED MOTION — show everything in final state, no animation
   Copied from design/drafts/theme-tron-v1.html lines 910-931
   ================================================================ */

@media (prefers-reduced-motion: reduce) {
  .landing-empty__drop-zone { opacity: 1 !important; }
  .landing-empty__upload-icon { opacity: 1 !important; }
  .landing-empty__heading { opacity: 1 !important; }
  .landing-empty__subtitle { opacity: 1 !important; }
  .landing-empty__cta { opacity: 1 !important; }
  .landing-empty__hint { opacity: 1 !important; }
  .landing-empty__footer { opacity: 1 !important; }
  .landing-empty__disc-ring { opacity: 0 !important; }
}

/* ================================================================
   MOTION-ALLOWED ANIMATIONS — content entrance choreography
   Copied from design/drafts/theme-tron-v1.html lines 1057-1093
   ================================================================ */

@media (prefers-reduced-motion: no-preference) {
  /* FIX 4: Drop zone: power-on only, NO rotating border animation */
  .landing-empty__drop-zone {
    animation: dropZoneReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.8s forwards;
  }

  /* Upload icon (after 2nd node) — subtle bob */
  .landing-empty__upload-icon {
    animation: slideUpFadeIn 0.5s ease-out 2.0s forwards,
               iconBob 4s ease-in-out 4s infinite;
  }

  /* Heading */
  .landing-empty__heading {
    animation: slideUpFadeIn 0.5s ease-out 2.5s forwards;
  }

  /* Subtitle */
  .landing-empty__subtitle {
    animation: slideUpFadeIn 0.5s ease-out 2.8s forwards;
  }

  /* CTA */
  .landing-empty__cta {
    animation: slideUpFadeIn 0.4s ease-out 3.1s forwards;
  }

  /* Hint */
  .landing-empty__hint {
    animation: fadeIn 0.5s ease-out 3.4s forwards;
  }

  /* Footer tagline */
  .landing-empty__footer {
    animation: fadeIn 0.8s ease-out 4.5s forwards;
  }
}

/* ================================================================
   RESPONSIVE — Mobile
   Copied from design/drafts/theme-tron-v1.html lines 1214-1264
   ================================================================ */

@media (max-width: 767px) {
  .landing-empty__content {
    padding: var(--space-4) var(--space-4);
    max-width: 100%;
  }

  .landing-empty__drop-zone {
    padding: 44px var(--space-4) var(--space-4);
  }

  .landing-empty__heading {
    font-size: var(--text-xl);
  }

  .landing-empty__subtitle {
    font-size: var(--text-sm);
    max-width: 300px;
  }

  .landing-empty__footer {
    padding: var(--space-3) var(--space-4);
  }

  .landing-empty__tagline {
    font-size: 9px;
  }

  .landing-empty__disc-ring {
    display: none;
  }
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

<template>
  <nav
    class="spatial-shell__sidebar sidebar-panel"
    aria-label="Session list"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Mobile brand header — close button + brand name, only visible on mobile overlay -->
    <div
      v-if="isMobile"
      class="sidebar__mobile-header"
    >
      <HexGateIcon
        :is-open="true"
        aria-label="Close navigation"
        @click="closeMobileOverlay"
      />
      <span class="sidebar__mobile-brand">Erika</span>
      <Toolbar class="sidebar__mobile-toolbar" />
    </div>

    <SkeletonSidebar v-if="sessionList.loading.value" />
    <template v-else>
      <!-- Search input -->
      <div
        class="sidebar__search-wrap"
        :class="{ 'sidebar__dimmed': isDragOver }"
      >
        <input
          v-model="sessionList.searchQuery.value"
          type="search"
          class="sidebar__search-input"
          placeholder="Filter sessions..."
          aria-label="Filter sessions by filename"
        />
      </div>

      <!-- Filter pills -->
      <div
        class="sidebar__filters filter-pills"
        :class="{ 'sidebar__dimmed': isDragOver }"
        role="group"
        aria-label="Filter by status"
      >
        <button
          v-for="pill in FILTER_PILLS"
          :key="pill.value"
          class="filter-pill"
          :class="{ 'filter-pill--active': sessionList.statusFilter.value === pill.value }"
          :aria-pressed="sessionList.statusFilter.value === pill.value"
          type="button"
          @click="sessionList.statusFilter.value = pill.value"
        >
          {{ pill.label }}
        </button>
      </div>

      <!-- Session list (hidden during drag) -->
      <OverlayScrollbar
        v-show="!isDragOver"
        class="sidebar__list-region"
      >
        <ul
          v-if="sessionList.filteredSessions.value.length > 0"
          class="sidebar__session-list"
        >
          <li
            v-for="session in sessionList.filteredSessions.value"
            :key="session.id"
            class="sidebar__session-item"
          >
            <SessionCard
              :session="session"
              :is-selected="session.id === currentSessionId"
            />
          </li>
        </ul>

        <!-- Empty state: filters active but no results -->
        <div
          v-else-if="sessionList.sessions.value.length > 0"
          class="sidebar__empty-state"
          role="status"
          aria-live="polite"
        >
          <p class="sidebar__empty-message">
            No sessions match your filters.
          </p>
          <button
            class="sidebar__clear-filters-btn"
            type="button"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </OverlayScrollbar>

      <!-- Drop zone (shown during drag, replaces list) -->
      <div
        v-show="isDragOver"
        class="sidebar__drop-zone upload-zone upload-zone--compact upload-zone--drag-over"
        role="region"
        aria-label="Drop .cast file to upload"
      >
        <div class="upload-zone__icon">
          <div
            class="upload-zone__disc-ring"
            aria-hidden="true"
          />
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M14 30V36H34V30" />
            <path d="M24 12V30" />
            <path d="M16 20L24 12L32 20" />
          </svg>
        </div>
        <div class="upload-zone__title">
          Release to upload
        </div>
        <div class="upload-zone__subtitle">
          File will be processed automatically
        </div>
      </div>

      <!-- Upload status live region — screen readers announce result after drag-drop or file pick -->
      <div
        role="status"
        aria-live="polite"
        class="sidebar__upload-status"
        aria-atomic="true"
      >
        {{ uploadStatusMessage }}
      </div>

      <!-- Footer -->
      <div class="sidebar__footer">
        <input
          ref="fileInputRef"
          type="file"
          accept=".cast"
          multiple
          class="sidebar__file-input"
          aria-hidden="true"
          tabindex="-1"
          @change="handleFileInputChange"
        />
        <button
          class="sidebar__new-session-btn btn btn--sm"
          :class="isDragOver ? 'sidebar__browse-fallback' : 'btn--primary'"
          type="button"
          @click="openFilePicker"
        >
          {{ isDragOver ? 'or browse files' : '+ New Session' }}
        </button>
      </div>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { inject, ref, computed, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import SkeletonSidebar from './SkeletonSidebar.vue';
import SessionCard from './SessionCard.vue';
import OverlayScrollbar from './OverlayScrollbar.vue';
import HexGateIcon from './HexGateIcon.vue';
import Toolbar from './toolbar/Toolbar.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import { useUpload } from '../composables/useUpload.js';
import { layoutKey } from '../composables/useLayout.js';
import type { Session } from '../../shared/types/session.js';

/**
 * SidebarPanel occupies the sidebar grid area.
 * Injects sessionListKey to access shared session state.
 * Renders skeleton while loading, then search/filters/list/button.
 * Handles drag-and-drop: the session list is replaced with a drop zone
 * while a file is dragged over the sidebar.
 */

const _injectedSessionList = inject(sessionListKey);
if (!_injectedSessionList) {
  throw new Error(
    'SidebarPanel: sessionListKey not provided. ' +
    'Ensure SpatialShell (or a parent component) calls provide(sessionListKey, useSessionList()).'
  );
}
const sessionList: SessionListState = _injectedSessionList;

const layout = inject(layoutKey);

/** True on mobile viewports — drives mobile brand header visibility. */
const isMobile = computed(() => layout?.isMobile.value ?? false);

/** Closes the mobile sidebar overlay. No-op when layout is not provided. */
function closeMobileOverlay(): void {
  layout?.closeMobileOverlay();
}

const route = useRoute();

/** The currently selected session ID, derived from route params. */
const currentSessionId = computed<string>(() =>
  typeof route.params.id === 'string' ? route.params.id : '',
);

const fileInputRef = ref<HTMLInputElement | null>(null);
const { uploadFileWithOptimistic } = useUpload();

/** Screen reader announcement text for upload actions — cleared after 4 seconds. */
const uploadStatusMessage = ref('');
let uploadStatusTimer: ReturnType<typeof setTimeout> | null = null;

onUnmounted(() => {
  if (uploadStatusTimer !== null) clearTimeout(uploadStatusTimer);
});

/** Sets the upload status message and schedules a clear after 4 seconds. */
function announceUploadStatus(message: string): void {
  if (uploadStatusTimer !== null) clearTimeout(uploadStatusTimer);
  uploadStatusMessage.value = message;
  uploadStatusTimer = setTimeout(() => {
    uploadStatusMessage.value = '';
    uploadStatusTimer = null;
  }, 4000);
}

interface FilterPill {
  label: string;
  value: 'all' | 'ready' | 'processing' | 'failed';
}

const FILTER_PILLS: FilterPill[] = [
  { label: 'All', value: 'all' },
  { label: 'Processing', value: 'processing' },
  { label: 'Ready', value: 'ready' },
  { label: 'Failed', value: 'failed' },
];

/**
 * Drag counter for the dragenter/dragleave pattern.
 * Prevents false hides when dragging over nested elements.
 */
let dragCounter = 0;
const isDragOver = ref(false);

/** Increments counter and shows drop zone on dragenter. */
function onDragEnter(): void {
  dragCounter++;
  isDragOver.value = true;
}

/** Decrements counter and hides drop zone when drag leaves the sidebar entirely. */
function onDragLeave(): void {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDragOver.value = false;
  }
}

/** Handles file drop: resets drag state and initiates optimistic upload for each dropped file. */
function onDrop(event: DragEvent): void {
  dragCounter = 0;
  isDragOver.value = false;
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  for (const file of files) {
    announceUploadStatus(`Uploading ${file.name}…`);
    uploadFileWithOptimistic(file, {
      onOptimisticInsert: (tempSession: Session) => {
        sessionList.sessions.value = [tempSession, ...sessionList.sessions.value];
      },
      onUploadComplete: async (tempId: string) => {
        sessionList.sessions.value = sessionList.sessions.value.filter(s => s.id !== tempId);
        await sessionList.fetchSessions();
        announceUploadStatus('Upload complete.');
      },
    });
  }
}

/** Opens the system file picker for .cast files. */
function openFilePicker(): void {
  fileInputRef.value?.click();
}

/** Handles file selection from the hidden file input. Uses optimistic upload flow for each selected file. */
function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) return;
  for (const file of files) {
    announceUploadStatus(`Uploading ${file.name}…`);
    uploadFileWithOptimistic(file, {
      onOptimisticInsert: (tempSession: Session) => {
        sessionList.sessions.value = [tempSession, ...sessionList.sessions.value];
      },
      onUploadComplete: async (tempId: string) => {
        sessionList.sessions.value = sessionList.sessions.value.filter(s => s.id !== tempId);
        await sessionList.fetchSessions();
        announceUploadStatus('Upload complete.');
      },
    });
  }
}

/** Clears both search query and status filter. */
function clearFilters(): void {
  sessionList.searchQuery.value = '';
  sessionList.statusFilter.value = 'all';
}
</script>

<style scoped>
.sidebar-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
  width: 100%;
  overflow: hidden;
}

.sidebar__search-wrap {
  padding: var(--space-3);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.sidebar__search-input {
  width: 100%;
  height: var(--input-height-sm);
  padding: 0 var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  box-sizing: border-box;
}

.sidebar__search-input::placeholder {
  color: var(--text-muted);
}

.sidebar__search-input:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: -1px;
  border-color: var(--accent-primary);
}

/* Style the native search clear (×) button for dark theme */
.sidebar__search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3.5 3.5l7 7M10.5 3.5l-7 7' stroke='%23999' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;
  cursor: pointer;
}

.sidebar__search-input::-webkit-search-cancel-button:hover {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3.5 3.5l7 7M10.5 3.5l-7 7' stroke='%23ccc' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
}

.sidebar__filters {
  padding: var(--space-1\.5) var(--space-3); /* 6px vertical */
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  flex-wrap: nowrap;
  gap: var(--space-1);
}

/* Override global filter-pill sizing for sidebar context:
   smaller padding, smaller text to fit all 4 pills on one line. */
.sidebar__filters .filter-pill {
  padding: 2px var(--space-1\.5);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  border-radius: var(--radius-sm);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}

.sidebar__list-region {
  /* Layout only — overflow and scrollbar rendering handled by OverlayScrollbar component. */
  flex: 1;
  min-height: 0;
}

.sidebar__session-list {
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0; /* 4px top/bottom -- tighter than space-2 */
  overflow: hidden;
}

.sidebar__session-item {
  /* Padding and hover handled by SessionCard internally. */
  list-style: none;
  /* overflow: hidden removed -- unnecessary and clips focus outlines */
}

.sidebar__empty-state {
  padding: var(--space-6) var(--space-3);
  text-align: center;
}

.sidebar__empty-message {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-3) 0;
}

.sidebar__clear-filters-btn {
  color: var(--accent-primary);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  font-family: var(--font-body);
  padding: 0;
  text-decoration: underline;
}

.sidebar__clear-filters-btn:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: 2px;
}

.sidebar__footer {
  padding: var(--space-3);
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
}

.sidebar__file-input {
  display: none;
}

.sidebar__new-session-btn {
  width: 100%;
  justify-content: center;
}

/* Dimmed state for search/filters during drag */
.sidebar__dimmed {
  opacity: 0.45;
  pointer-events: none;
  transition: opacity 150ms ease-out;
}

/* Drop zone — replaces session list during drag.
   Visual styling is provided by .upload-zone classes from components.css. */
.sidebar__drop-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: var(--space-3);
}

/* Visually hidden live region for screen reader upload status announcements. */
.sidebar__upload-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Footer browse fallback during drag */
.sidebar__browse-fallback {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-muted);
}

/* Mobile touch targets: filter pills get min 44px height via padding compensation
   when rendered inside the mobile overlay. */
@media (max-width: 767px) {
  .sidebar__filters {
    display: flex;
  }

  .sidebar__filters .filter-pill {
    flex: 1;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding-block: var(--space-2);
  }

  .sidebar__new-session-btn {
    height: var(--btn-height-md);
    font-size: var(--text-base);
  }
}

/* Mobile brand header — close button + brand name at the top of the overlay panel.
   Mirrors the BrandMark height and bottom-border styling for visual continuity.
   padding-inline-start uses --space-2 (8px) so the close button's visible 28px box
   lands at x=16px — matching the header hamburger icon position exactly.
   (Button has 8px internal padding, so 8px container + 8px button = 16px.) */
.sidebar__mobile-header {
  display: flex;
  align-items: center;
  height: var(--header-height);
  padding-inline: var(--space-2) var(--space-4);
  background: var(--bg-surface);
  border-bottom: 1px solid color-mix(in srgb, var(--accent-primary) 60%, transparent);
  flex-shrink: 0;
  position: relative;
}

/* Toolbar in mobile header — pushed to the right via margin-left auto. */
.sidebar__mobile-toolbar {
  margin-inline-start: auto;
}

/* Brand name in mobile header — matches BrandMark typography. */
.sidebar__mobile-brand {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  color: var(--text-primary);
  text-shadow: 0 0 20px color-mix(in srgb, var(--accent-primary) 15%, transparent);
  line-height: var(--lh-lg);
}
</style>

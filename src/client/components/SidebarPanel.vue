<template>
  <div
    class="spatial-shell__sidebar sidebar-panel"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
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
      <div v-if="!isDragOver" class="sidebar__list-region">
        <ul
          v-if="sessionList.filteredSessions.value.length > 0"
          class="sidebar__session-list"
          role="list"
        >
          <li
            v-for="session in sessionList.filteredSessions.value"
            :key="session.id"
            class="sidebar__session-item"
            role="listitem"
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
      </div>

      <!-- Drop zone (shown during drag, replaces list) -->
      <div
        v-else
        class="sidebar__drop-zone"
        role="button"
        aria-label="Drop .cast file to upload"
      >
        <div class="sidebar__drop-zone-content">
          <svg
            class="sidebar__drop-icon"
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 6v20M12 14l8-8 8 8"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M6 28v4a2 2 0 002 2h24a2 2 0 002-2v-4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <p class="sidebar__drop-text">Drop .cast file</p>
          <p class="sidebar__drop-hint">to start a new session</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="sidebar__footer">
        <input
          ref="fileInputRef"
          type="file"
          accept=".cast"
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
  </div>
</template>

<script setup lang="ts">
import { inject, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import SkeletonSidebar from './SkeletonSidebar.vue';
import SessionCard from './SessionCard.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import { useUpload } from '../composables/useUpload.js';
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

const route = useRoute();

/** The currently selected session ID, derived from route params. */
const currentSessionId = computed<string>(() =>
  typeof route.params.id === 'string' ? route.params.id : '',
);

const fileInputRef = ref<HTMLInputElement | null>(null);
const { uploadFileWithOptimistic } = useUpload();

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

/** Handles file drop: resets drag state and initiates optimistic upload. */
function onDrop(event: DragEvent): void {
  dragCounter = 0;
  isDragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  uploadFileWithOptimistic(file, {
    onOptimisticInsert: (tempSession: Session) => {
      sessionList.sessions.value = [tempSession, ...sessionList.sessions.value];
    },
    onUploadSuccess: async (tempId: string) => {
      sessionList.sessions.value = sessionList.sessions.value.filter(s => s.id !== tempId);
      await sessionList.fetchSessions();
    },
  });
}

/** Opens the system file picker for .cast files. */
function openFilePicker(): void {
  fileInputRef.value?.click();
}

/** Handles file selection from the hidden file input. Uses optimistic upload flow. */
function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';

  uploadFileWithOptimistic(file, {
    onOptimisticInsert: (tempSession: Session) => {
      sessionList.sessions.value = [tempSession, ...sessionList.sessions.value];
    },
    onUploadSuccess: async (tempId: string) => {
      sessionList.sessions.value = sessionList.sessions.value.filter(s => s.id !== tempId);
      await sessionList.fetchSessions();
    },
  });
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
  width: var(--sidebar-width);
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

.sidebar__search-input:focus {
  outline: none;
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
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  /* Custom thin scrollbar for dark theme */
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.sidebar__list-region::-webkit-scrollbar {
  width: 4px;
}

.sidebar__list-region::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar__list-region::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--radius-full);
}

.sidebar__list-region::-webkit-scrollbar-thumb:hover {
  background: var(--text-disabled);
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

/* Drop zone — replaces session list during drag */
.sidebar__drop-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: var(--radius-md);
  margin: var(--space-2) var(--space-3);
  background: rgba(0, 212, 255, 0.02);
}

.sidebar__drop-zone-content {
  text-align: center;
}

.sidebar__drop-icon {
  color: rgba(0, 212, 255, 0.7);
  margin-bottom: var(--space-3);
}

.sidebar__drop-text {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-primary);
  margin: 0 0 var(--space-1) 0;
}

.sidebar__drop-hint {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
}

/* Footer browse fallback during drag */
.sidebar__browse-fallback {
  background: transparent;
  border: 1px solid var(--border-default);
  color: var(--text-muted);
}
</style>

<script setup lang="ts">
/**
 * Session grid component that renders the appropriate state:
 * - Loading: 3 SkeletonCard instances with distinct variants
 * - Populated: GalleryCard per session
 * - Empty: no-results message with clear-filters action
 */

import type { Session } from '../../shared/types/session.js';
import type { SseConnectionState } from '../composables/useSessionSSE.js';
import GalleryCard from './GalleryCard.vue';
import SkeletonCard from './SkeletonCard.vue';

const props = defineProps<{
  sessions: Session[];
  loading: boolean;
  connectionStates?: Map<string, SseConnectionState>;
}>();

const emit = defineEmits<{
  'clear-filters': [];
}>();
</script>

<template>
  <div class="landing__session-grid">
    <!-- Loading: skeleton placeholders -->
    <template v-if="loading">
      <SkeletonCard :variant="1" />
      <SkeletonCard :variant="2" />
      <SkeletonCard :variant="3" />
    </template>

    <!-- Populated: one card per session -->
    <template v-else-if="sessions.length > 0">
      <GalleryCard
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :connection-state="connectionStates?.get(session.id)"
      />
    </template>

    <!-- Empty / no results -->
    <div
      v-else
      class="landing__no-results"
    >
      <span
        class="icon icon--lg icon-search"
        style="color: var(--text-disabled);"
      />
      <span class="landing__no-results-text">No sessions match your search</span>
      <button
        class="landing__no-results-action"
        @click="emit('clear-filters')"
      >
        Clear filters
      </button>
    </div>
  </div>
</template>

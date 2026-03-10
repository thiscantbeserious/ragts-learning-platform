<script setup lang="ts">
/**
 * Toolbar component with search bar, filter pills, and session count.
 * Emits v-model compatible events for searchQuery and activeFilter.
 */

const props = defineProps<{
  searchQuery: string;
  activeFilter: string;
  sessionCount: number;
  filteredCount: number;
}>();

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  'update:activeFilter': [value: string];
}>();

function sessionCountLabel(): string {
  const isFiltered = props.filteredCount !== props.sessionCount;
  const unit = props.sessionCount === 1 ? 'session' : 'sessions';

  if (isFiltered) {
    return `${props.filteredCount} of ${props.sessionCount} ${unit}`;
  }
  return `${props.sessionCount} ${unit}`;
}
</script>

<template>
  <div class="landing__toolbar">
    <!-- Search bar -->
    <div class="landing__search search-bar">
      <span class="search-bar__icon">
        <span class="icon icon--sm icon-search" />
      </span>
      <input
        type="text"
        class="search-bar__input"
        placeholder="Search sessions..."
        :value="searchQuery"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Filter pills + session count -->
    <div class="landing__toolbar-right">
      <div class="filter-pills">
        <button
          class="filter-pill"
          :class="{ 'filter-pill--active': activeFilter === 'all' }"
          @click="emit('update:activeFilter', 'all')"
        >
          All
        </button>
        <button
          class="filter-pill landing__pill--processing"
          :class="{ 'filter-pill--active': activeFilter === 'processing' }"
          @click="emit('update:activeFilter', 'processing')"
        >
          Processing
        </button>
        <button
          class="filter-pill landing__pill--ready"
          :class="{ 'filter-pill--active': activeFilter === 'ready' }"
          @click="emit('update:activeFilter', 'ready')"
        >
          Ready
        </button>
        <button
          class="filter-pill landing__pill--failed"
          :class="{ 'filter-pill--active': activeFilter === 'failed' }"
          @click="emit('update:activeFilter', 'failed')"
        >
          Failed
        </button>
      </div>

      <span class="landing__session-count">{{ sessionCountLabel() }}</span>
    </div>
  </div>
</template>

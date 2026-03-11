<template>
  <div
    class="skeleton-sidebar"
    role="status"
    aria-busy="true"
    aria-label="Loading sessions"
  >
    <div
      v-for="n in cardCount"
      :key="n"
      class="skeleton--card skeleton-sidebar__card"
    >
      <div class="skeleton--card-row">
        <div class="skeleton skeleton--text skeleton-sidebar__filename" />
        <div class="skeleton skeleton--badge skeleton-sidebar__status" />
      </div>
      <div class="skeleton skeleton--text-sm skeleton-sidebar__meta" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SkeletonSidebar renders shimmer placeholder cards while the session list loads.
 * Card dimensions match SessionCard (~45-50px) to prevent cumulative layout shift.
 */

const cardCount = 4;
</script>

<style scoped>
.skeleton-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
}

/*
 * Card height is controlled by padding + two text rows to target ~45-50px.
 * --rhythm-half (9px) top/bottom + row1 (16px) + gap (9px) + row2 (12px) = ~46px
 */
.skeleton-sidebar__card {
  min-height: calc(var(--rhythm-2) + var(--rhythm-half)); /* 36 + 9 = 45px, matching session card target */
}

.skeleton-sidebar__filename {
  flex: 1;
  height: var(--space-4);
  margin-bottom: 0;
}

.skeleton-sidebar__status {
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.skeleton-sidebar__meta {
  height: var(--space-3);
  width: 55%;
}
</style>

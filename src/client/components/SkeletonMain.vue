<template>
  <div
    class="skeleton-main"
    role="status"
    aria-busy="true"
    aria-label="Loading session"
  >
    <!-- Section header placeholders -->
    <div
      v-for="n in sectionCount"
      :key="n"
      class="skeleton-main__section-header"
    >
      <div class="skeleton skeleton--text skeleton-main__section-title" />
    </div>

    <!-- Terminal body shimmer -->
    <div class="skeleton skeleton-main__terminal" />
  </div>
</template>

<script setup lang="ts">
/**
 * SkeletonMain renders shimmer placeholders for the session detail main area.
 * Matches the section header + terminal layout to prevent CLS.
 */

const sectionCount = 2;
</script>

<style scoped>
.skeleton-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
}

/* Section header placeholder — matches section-header component height */
.skeleton-main__section-header {
  height: var(--rhythm-2);
  display: flex;
  align-items: center;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  padding: 0 var(--space-3);
}

.skeleton-main__section-title {
  width: 200px;
  height: var(--space-4);
  margin-bottom: 0;
}

/* Terminal body shimmer — fixed height approximating a compact terminal block */
.skeleton-main__terminal {
  height: 240px; /* ~13 baseline units, approximating terminal content area */
  border-radius: var(--radius-lg);
}
</style>

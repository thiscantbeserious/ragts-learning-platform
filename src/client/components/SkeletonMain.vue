<template>
  <div
    class="skeleton-main"
    aria-busy="true"
    aria-label="Loading session"
  >
    <!-- Breadcrumb placeholder -->
    <div class="skeleton-main__breadcrumb">
      <div class="skeleton skeleton--text skeleton-main__breadcrumb-text" />
    </div>

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
 * Matches the breadcrumb + section header + terminal layout to prevent CLS.
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

/* Breadcrumb row — matches the ~18px single-line height of the real breadcrumb */
.skeleton-main__breadcrumb {
  height: 18px;
  display: flex;
  align-items: center;
}

.skeleton-main__breadcrumb-text {
  width: 180px;
  height: var(--space-3);
  margin-bottom: 0;
}

/* Section header placeholder — matches section-header component height */
.skeleton-main__section-header {
  height: 36px;
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
  height: 240px;
  border-radius: var(--radius-lg);
}
</style>

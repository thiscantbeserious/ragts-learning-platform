<template>
  <div class="spatial-shell__sidebar">
    <SkeletonSidebar v-if="loading" />
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import SkeletonSidebar from './SkeletonSidebar.vue';

/**
 * SidebarPanel occupies the sidebar grid area.
 * Renders a SkeletonSidebar while loading is true, then yields to the default slot.
 */
defineProps<{
  loading?: boolean;
}>();
</script>

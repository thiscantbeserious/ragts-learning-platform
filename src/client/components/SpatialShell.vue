<template>
  <BrandMark />
  <ShellHeader />
  <SidebarPanel />
  <div class="spatial-shell__main">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { provide, onMounted } from 'vue';
import BrandMark from './BrandMark.vue';
import ShellHeader from './ShellHeader.vue';
import SidebarPanel from './SidebarPanel.vue';
import { useLayout, layoutKey } from '../composables/useLayout.js';

/**
 * SpatialShell is the layout route parent.
 * It renders the permanent shell fixtures (brand, header, sidebar) and
 * provides layout state to children via provide/inject.
 * The main area hosts the active child route via <router-view>.
 */

const layout = useLayout();
provide(layoutKey, layout);

/** Suppress layout transition flash on first paint. */
onMounted(() => {
  requestAnimationFrame(() => {
    const shell = document.querySelector('.spatial-shell');
    if (shell) {
      shell.removeAttribute('data-hydrating');
    }
  });
});
</script>

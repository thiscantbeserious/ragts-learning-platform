<template>
  <BrandMark />
  <ShellHeader />
  <div class="spatial-shell__sidebar">
    <SidebarPanel />
  </div>
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
import { useSessionList, sessionListKey } from '../composables/useSessionList.js';

/**
 * SpatialShell is the layout route parent.
 * It renders the permanent shell fixtures (brand, header, sidebar) and
 * provides layout state and session list state to children via provide/inject.
 * The main area hosts the active child route via <router-view>.
 * Drag handling has been moved to SidebarPanel (Variant E).
 */

const layout = useLayout();
provide(layoutKey, layout);

/** Session list is provided at shell level so sidebar and header can share it. */
const sessionList = useSessionList();
provide(sessionListKey, sessionList);

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

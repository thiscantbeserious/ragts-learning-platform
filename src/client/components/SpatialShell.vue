<template>
  <BrandMark />
  <ShellHeader />
  <div class="spatial-shell__sidebar">
    <!-- Only render SidebarPanel in the grid when not on mobile; the overlay owns it on mobile. -->
    <SidebarPanel v-if="!isMobile" />
  </div>
  <main
    id="main-content"
    class="spatial-shell__main"
    tabindex="-1"
  >
    <router-view />
  </main>
  <!-- Mobile sidebar overlay — rendered outside the grid via Teleport inside the component -->
  <MobileSidebarOverlay />
  <!-- Toast container is fixed-position outside the grid flow -->
  <ToastContainer
    :toasts="toasts"
    @dismiss="removeToast"
  />
</template>

<script setup lang="ts">
import { provide, onMounted } from 'vue';
import BrandMark from './BrandMark.vue';
import ShellHeader from './ShellHeader.vue';
import SidebarPanel from './SidebarPanel.vue';
import MobileSidebarOverlay from './MobileSidebarOverlay.vue';
import ToastContainer from './ToastContainer.vue';
import { useLayout, layoutKey } from '../composables/useLayout.js';
import { useSessionList, sessionListKey } from '../composables/useSessionList.js';
import { usePipelineStatus, pipelineStatusKey } from '../composables/usePipelineStatus.js';
import { useToast } from '../composables/useToast.js';

/**
 * SpatialShell is the layout route parent.
 * It renders the permanent shell fixtures (brand, header, sidebar) and
 * provides layout state and session list state to children via provide/inject.
 * The main area hosts the active child route via <router-view>.
 * Drag handling has been moved to SidebarPanel (Variant E).
 */

const layout = useLayout();
provide(layoutKey, layout);

const { isMobile } = layout;

/** Session list is provided at shell level so sidebar and header can share it. */
const sessionList = useSessionList();
provide(sessionListKey, sessionList);

/** Pipeline status is provided at shell level so toolbar components can inject it. */
const pipelineStatus = usePipelineStatus();
provide(pipelineStatusKey, pipelineStatus);

/** Toast state — shared singleton, consumed by ToastContainer rendered here. */
const { toasts, removeToast } = useToast();

/** Suppress layout transition flash on first paint. */
onMounted(() => {
  requestAnimationFrame(() => {
    const shell = document.querySelector<HTMLElement>('.spatial-shell');
    if (shell) {
      delete shell.dataset['hydrating'];
    }
  });
});
</script>

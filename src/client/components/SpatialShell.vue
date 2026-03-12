<template>
  <BrandMark />
  <ShellHeader />
  <div
    ref="sidebarRef"
    class="spatial-shell__sidebar"
  >
    <SidebarPanel />
    <DropOverlay :visible="isDragOver" />
  </div>
  <div class="spatial-shell__main">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { provide, onMounted, ref } from 'vue';
import BrandMark from './BrandMark.vue';
import ShellHeader from './ShellHeader.vue';
import SidebarPanel from './SidebarPanel.vue';
import DropOverlay from './DropOverlay.vue';
import { useLayout, layoutKey } from '../composables/useLayout.js';
import { useSessionList, sessionListKey } from '../composables/useSessionList.js';
import { useUpload } from '../composables/useUpload.js';
import type { Session } from '../../shared/types/session.js';

/**
 * SpatialShell is the layout route parent.
 * It renders the permanent shell fixtures (brand, header, sidebar) and
 * provides layout state and session list state to children via provide/inject.
 * The main area hosts the active child route via <router-view>.
 * Also registers sidebar-scoped drag handlers for the drop overlay.
 */

const layout = useLayout();
provide(layoutKey, layout);

/** Session list is provided at shell level so sidebar and header can share it. */
const sessionList = useSessionList();
provide(sessionListKey, sessionList);

const { uploadFileWithOptimistic } = useUpload();

/** Template ref for the sidebar element — drag handlers attach here. */
const sidebarRef = ref<HTMLElement | null>(null);

/** Suppress layout transition flash on first paint. */
onMounted(() => {
  requestAnimationFrame(() => {
    const shell = document.querySelector('.spatial-shell');
    if (shell) {
      shell.removeAttribute('data-hydrating');
    }
  });
});

/**
 * Drag counter for the dragenter/dragleave pattern.
 * Incremented on dragenter, decremented on dragleave.
 * Overlay shown when counter > 0, preventing false hide from nested elements.
 */
let dragCounter = 0;
const isDragOver = ref(false);

/** Attach drag event handlers to the sidebar element after mount. */
onMounted(() => {
  if (!sidebarRef.value) return;

  sidebarRef.value.addEventListener('dragenter', handleDragEnter);
  sidebarRef.value.addEventListener('dragleave', handleDragLeave);
  sidebarRef.value.addEventListener('dragover', handleDragOver);
  sidebarRef.value.addEventListener('drop', handleDrop);
});

function handleDragEnter(event: Event): void {
  event.preventDefault();
  dragCounter++;
  isDragOver.value = true;
}

function handleDragOver(event: Event): void {
  event.preventDefault();
}

function handleDragLeave(): void {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    isDragOver.value = false;
  }
}

function handleDrop(event: Event): void {
  event.preventDefault();
  dragCounter = 0;
  isDragOver.value = false;

  const dragEvent = event as DragEvent;
  const file = dragEvent.dataTransfer?.files?.[0];
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
</script>

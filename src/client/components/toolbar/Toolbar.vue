<template>
  <ToolbarPill>
    <PipelineRingTrigger />
    <div class="toolbar-pill__separator" />
    <ToolbarButton
      icon="icon-settings"
      label="Settings"
      @click="navigateToSettings"
    />
    <ToolbarButton
      icon="icon-bell"
      label="Notifications"
    />
    <div class="toolbar-pill__separator" />
    <ToolbarAvatar />
  </ToolbarPill>
</template>

<script setup lang="ts">
/**
 * Toolbar — composes all toolbar items inside the glass pill.
 * Single source of truth for toolbar content, used in both the desktop
 * header (ShellHeader) and the mobile sidebar overlay.
 */
import { useRouter } from 'vue-router';
import ToolbarPill from './ToolbarPill.vue';
import ToolbarAvatar from './ToolbarAvatar.vue';
import ToolbarButton from './ToolbarButton.vue';
import PipelineRingTrigger from './PipelineRingTrigger.vue';

const router = useRouter();

function navigateToSettings(): void {
  router.push('/settings');
}
</script>

<style scoped>
/* Separator — uses toolbar-scoped token from ToolbarPill parent. */
.toolbar-pill__separator {
  width: 1px;
  height: 18px;
  background: var(--toolbar-separator);
  flex-shrink: 0;
}
</style>

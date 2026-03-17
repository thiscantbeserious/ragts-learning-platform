<template>
  <div
    class="toolbar-pill"
    :class="{ 'toolbar-pill--collapsed': isCollapsed }"
    role="toolbar"
    aria-label="Main toolbar"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * ToolbarPill — glass pill container for the main application toolbar.
 * Toolbar items are composed via the default slot by the parent (ShellHeader).
 * Visual design follows the Draft 2b mockup: cyan-tinted glass with backdrop blur.
 *
 * Provides toolbarCollapseKey so child components (e.g. ToolbarAvatar) can
 * toggle the collapsed state without prop-drilling through ShellHeader.
 */
import { ref, readonly, provide } from 'vue';
import { toolbarCollapseKey } from './toolbar_collapse.js';

const isCollapsed = ref(false);

/** Toggles collapsed state on each invocation. */
function toggleCollapse(): void {
  isCollapsed.value = !isCollapsed.value;
}

provide(toolbarCollapseKey, {
  isCollapsed: readonly(isCollapsed),
  toggleCollapse,
});
</script>

<style scoped>
/**
 * Glass pill toolbar container — from Draft 2b (draft-2b-lucide.html).
 * CSS values are copied exactly from the approved mockup spec.
 *
 * max-width drives the collapse animation:
 * - Expanded: large value (500px) accommodates all toolbar items.
 * - Collapsed: 36px = avatar 30px + 3px padding each side.
 * overflow: hidden clips child items that overflow the collapsed width.
 */
.toolbar-pill {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px;
  border-radius: var(--radius-full);
  background: rgba(0, 212, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 212, 255, 0.15);
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.06), inset 0 0 8px rgba(0, 212, 255, 0.03);
  max-width: 500px;
  overflow: hidden;
  transition: max-width var(--duration-normal) var(--easing-default);
}

.toolbar-pill--collapsed {
  max-width: 36px;
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-pill {
    transition: none;
  }
}
</style>

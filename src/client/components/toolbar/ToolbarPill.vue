<template>
  <div
    class="toolbar-pill"
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
 */
</script>

<style scoped>
/**
 * Glass pill toolbar container — from Draft 2b (draft-2b-lucide.html).
 * CSS values are copied exactly from the approved mockup spec.
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
}
</style>

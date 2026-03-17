<template>
  <button
    class="toolbar-btn"
    :aria-label="label"
    :title="label"
    type="button"
  >
    <span
      class="icon"
      :class="icon"
    />
  </button>
</template>

<script setup lang="ts">
/**
 * ToolbarButton — 30px circular icon button for the glass pill toolbar.
 * Accepts an icon class name (e.g. icon-settings) and a label for accessibility.
 * Icon rendering uses the mask-image pattern from design/styles/icons.css.
 */
defineProps<{
  /** CSS class name for the icon mask (e.g. "icon-settings"). */
  icon: string;
  /** Accessible label applied as aria-label and title. */
  label: string;
}>();
</script>

<style scoped>
/**
 * Circular 30px toolbar button — from Draft 2b (draft-2b-lucide.html).
 * CSS values copied exactly from the approved mockup spec.
 */
.toolbar-btn {
  position: relative;
  width: var(--toolbar-btn-size, 30px);
  height: var(--toolbar-btn-size, 30px);
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-normal) var(--easing-default);
  color: var(--text-secondary);
  padding: 0;
  flex-shrink: 0;
}

.toolbar-btn:hover {
  background: var(--toolbar-hover-bg);
  border-color: var(--toolbar-hover-border);
  color: var(--accent-primary);
  box-shadow: 0 0 10px var(--toolbar-hover-shadow);
}

.toolbar-btn:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

.toolbar-btn .icon {
  width: 16px;
  height: 16px;
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-btn {
    transition: none;
  }
}
</style>

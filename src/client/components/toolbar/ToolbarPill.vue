<template>
  <div
    ref="pillRef"
    class="toolbar-pill"
    :style="expandedMaxWidth ? { '--toolbar-expanded-width': expandedMaxWidth + 'px' } : undefined"
    role="toolbar"
    aria-label="Main toolbar"
  >
    <div
      class="toolbar-pill__content"
      :class="{ 'toolbar-pill__content--collapsed': isCollapsed }"
    >
      <slot />
    </div>
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
import { ref, readonly, provide, onMounted, nextTick } from 'vue';
import { toolbarCollapseKey } from './toolbar_collapse.js';

const pillRef = ref<HTMLElement | null>(null);
const expandedMaxWidth = ref(0);
const isCollapsed = ref(false);

onMounted(async () => {
  await nextTick();
  const content = pillRef.value?.querySelector('.toolbar-pill__content') as HTMLElement | null;
  if (content) {
    const style = getComputedStyle(content);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    expandedMaxWidth.value = content.scrollWidth + paddingX;
  }
});

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
/* Toolbar-scoped design tokens — all raw rgba() values extracted here.
   Child components inherit these via the cascade. */
.toolbar-pill {
  --toolbar-glass-bg: rgba(0, 212, 255, 0.04);
  --toolbar-glass-border: rgba(0, 212, 255, 0.15);
  --toolbar-shadow-outer: rgba(0, 212, 255, 0.06);
  --toolbar-shadow-inner: rgba(0, 212, 255, 0.03);
  --toolbar-hover-bg: rgba(0, 212, 255, 0.12);
  --toolbar-hover-border: rgba(0, 212, 255, 0.3);
  --toolbar-hover-shadow: rgba(0, 212, 255, 0.2);
  --toolbar-hover-glow-outer: rgba(0, 212, 255, 0.12);
  --toolbar-hover-glow-wide: rgba(0, 212, 255, 0.06);
  --toolbar-hover-glow-inner: rgba(0, 212, 255, 0.04);
  --toolbar-ring-bg-stroke: rgba(0, 212, 255, 0.12);
  --toolbar-ring-glow: rgba(0, 212, 255, 0.5);
  --toolbar-tron-glow: rgba(0, 212, 255, 0.3);
  --toolbar-separator: rgba(0, 212, 255, 0.15);
  --toolbar-dropdown-bg: rgba(28, 28, 50, 0.95);
  --toolbar-dropdown-border: rgba(0, 212, 255, 0.2);
  --toolbar-dropdown-header-border: rgba(0, 212, 255, 0.1);
  --toolbar-dropdown-section-border: rgba(0, 212, 255, 0.06);
  --toolbar-dropdown-glow: rgba(0, 212, 255, 0.08);
  --toolbar-spinner-border: rgba(0, 212, 255, 0.2);
  --toolbar-avatar-gradient-start: rgba(0, 212, 255, 0.15);
  --toolbar-avatar-gradient-end: rgba(255, 77, 106, 0.1);

  position: relative;
  border-radius: var(--radius-full);
  background: var(--toolbar-glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--toolbar-glass-border);
  box-shadow: 0 0 12px var(--toolbar-shadow-outer), inset 0 0 8px var(--toolbar-shadow-inner);
  transition: box-shadow var(--duration-normal) var(--easing-default);
}

/* Hover glow. */
.toolbar-pill:hover {
  box-shadow:
    0 0 16px var(--toolbar-hover-glow-outer),
    0 0 30px var(--toolbar-hover-glow-wide),
    inset 0 0 8px var(--toolbar-hover-glow-inner);
}

/* TRON trail dot — travels along the pill border on hover.
   Lives on the pill (overflow: visible) so it's never clipped. */
.toolbar-pill:hover::before {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 8px 2px var(--accent-primary-glow),
              0 0 20px 4px var(--toolbar-tron-glow);
  offset-path: rect(0% 100% 100% 0% round var(--radius-full));
  animation: tron-trail 4s linear infinite;
  z-index: 10;
  pointer-events: none;
}

/* Inner content container — handles collapse clipping via overflow: hidden
   while the outer pill stays overflow: visible for the TRON dot. */
/* justify-content: flex-end packs items to the right. When max-width shrinks,
   overflow: hidden clips from the left, keeping the avatar (rightmost) visible
   and clickable. DOM order = visual order = tab order (left to right). */
.toolbar-pill__content {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  --toolbar-pill-height: 38px;
  --toolbar-pill-padding-y: 2px;
  --toolbar-pill-padding-x: 2px;
  --toolbar-btn-size: calc(var(--toolbar-pill-height) - var(--toolbar-pill-padding-y) * 2 - 2px);
  padding: var(--toolbar-pill-padding-y) var(--toolbar-pill-padding-x);
  border-radius: var(--radius-full);
  max-width: var(--toolbar-expanded-width, 240px);
  overflow: hidden;
  transition: max-width var(--duration-fast) cubic-bezier(0.16, 1, 0.3, 1);
  will-change: max-width;
}

.toolbar-pill__content--collapsed {
  max-width: calc(var(--toolbar-btn-size) + var(--toolbar-pill-padding-x) * 2);
}

@media (max-width: 767px) {
  .toolbar-pill__content {
    --toolbar-pill-height: 46px;
    --toolbar-pill-padding-y: 3px;
    --toolbar-pill-padding-x: 3px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-pill__content {
    transition: none;
  }
}
</style>

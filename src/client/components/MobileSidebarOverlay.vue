<template>
  <Teleport to="body">
    <div
      class="mobile-sidebar-overlay__root"
      :class="{ 'mobile-sidebar-overlay__root--open': isMobileOverlayOpen }"
    >
      <!-- Backdrop -->
      <div
        class="mobile-sidebar-overlay__backdrop"
        aria-hidden="true"
        @click="onBackdropClick"
      />
      <!-- Slide-in panel -->
      <div
        ref="panelRef"
        class="mobile-sidebar-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation sidebar"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="mobile-sidebar-overlay">
          <SidebarPanel />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { inject, watch, nextTick, ref, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import SidebarPanel from './SidebarPanel.vue';
import { layoutKey } from '../composables/useLayout.js';

/**
 * MobileSidebarOverlay renders the sidebar as a slide-in overlay on mobile viewports.
 * Wraps SidebarPanel in a full-screen dialog with backdrop, focus trap, and ARIA attributes.
 * Controlled by isMobileOverlayOpen from the injected layout state.
 * Closes automatically on route navigation (session card selection).
 * Locks body scroll while open and returns focus to the trigger element on close.
 *
 * Animation strategy: always in DOM, toggled via .mobile-sidebar-overlay__root--open class.
 * CSS transitions on panel (translateX) and backdrop (opacity) are always present.
 * Visibility is handled with visibility + pointer-events to avoid interaction when closed.
 */

const layout = inject(layoutKey);
if (!layout) {
  throw new Error('MobileSidebarOverlay: layoutKey not provided. Ensure SpatialShell provides it.');
}

const { isMobileOverlayOpen, closeMobileOverlay } = layout;
const route = useRoute();
const panelRef = ref<HTMLElement | null>(null);

/** Tracks the element that was focused before the overlay opened, for focus restoration on close. */
let returnFocusTarget: Element | null = null;

/** Queries all keyboard-focusable elements within the panel. */
function getFocusableElements(): HTMLElement[] {
  if (!panelRef.value) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  return Array.from(panelRef.value.querySelectorAll<HTMLElement>(selector));
}

/** Focus trap: cycles focus within the panel on Tab/Shift+Tab. */
function trapFocus(event: KeyboardEvent): void {
  const focusable = getFocusableElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isShift = event.shiftKey;

  if (isShift && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!isShift && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

/** Handles keydown on the panel: Escape closes, Tab traps. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeMobileOverlay();
    return;
  }
  if (event.key === 'Tab') {
    trapFocus(event);
  }
}

/** Closes the overlay when the backdrop is clicked. */
function onBackdropClick(): void {
  closeMobileOverlay();
}

/** Locks/unlocks body scroll to prevent scrolling behind the overlay. */
function setBodyScrollLock(locked: boolean): void {
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}

/** Restore body scroll on component teardown in case the overlay is open. */
onUnmounted(() => {
  setBodyScrollLock(false);
});

/** Focus the panel when it opens; save the current focus target to restore on close. */
watch(isMobileOverlayOpen, async (isOpen) => {
  if (isOpen) {
    returnFocusTarget = document.activeElement;
    setBodyScrollLock(true);
    await nextTick();
    panelRef.value?.focus();
  } else {
    setBodyScrollLock(false);
    if (returnFocusTarget && 'focus' in returnFocusTarget) {
      (returnFocusTarget as HTMLElement).focus();
    }
    returnFocusTarget = null;
  }
});

/** Close overlay on route change — handles session card selection. */
watch(() => route.fullPath, (newPath, oldPath) => {
  if (newPath !== oldPath && isMobileOverlayOpen.value) {
    closeMobileOverlay();
  }
});
</script>

<style scoped>
/**
 * MobileSidebarOverlay — slide-in sidebar drawer for mobile viewports.
 * Always rendered in DOM; visibility toggled via --open modifier class.
 * CSS transitions on panel/backdrop are always present (no Transition component needed).
 */

/* Root wrapper — always in DOM, hidden when not open. */
.mobile-sidebar-overlay__root {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay-backdrop);
  /* Hidden state: invisible, non-interactive, hide after transition completes. */
  visibility: hidden;
  pointer-events: none;
  transition: visibility 0s var(--duration-fast);
}

/* Open state: immediately visible and interactive. */
.mobile-sidebar-overlay__root--open {
  visibility: visible;
  pointer-events: auto;
  transition: visibility 0s 0s;
}

/* Backdrop: full-viewport dim layer behind the panel. */
.mobile-sidebar-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: var(--bg-overlay);
  opacity: 0;
  transition: opacity var(--duration-fast) ease-out;
}

.mobile-sidebar-overlay__root--open .mobile-sidebar-overlay__backdrop {
  opacity: 1;
}

/* Slide-in panel container: full-width drawer on mobile. */
.mobile-sidebar-overlay__panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100dvh;
  z-index: var(--z-overlay-panel);
  outline: none; /* Panel is focusable but we manage visual focus internally. */
  transform: translateX(-100%);
  transition: transform var(--duration-fast) ease-out;
}

.mobile-sidebar-overlay__root--open .mobile-sidebar-overlay__panel {
  transform: translateX(0);
}

/* Inner wrapper that fills the panel and hosts SidebarPanel. */
.mobile-sidebar-overlay {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
  overflow: hidden;
}

/* Respect prefers-reduced-motion: skip slide/fade animation. */
@media (prefers-reduced-motion: reduce) {
  .mobile-sidebar-overlay__root,
  .mobile-sidebar-overlay__root--open,
  .mobile-sidebar-overlay__backdrop,
  .mobile-sidebar-overlay__panel {
    transition: none;
  }
}
</style>

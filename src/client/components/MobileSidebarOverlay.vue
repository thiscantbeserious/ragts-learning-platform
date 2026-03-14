<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div
        v-if="isMobileOverlayOpen"
        class="mobile-sidebar-overlay__root"
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
          <div
            class="mobile-sidebar-overlay"
          >
            <SidebarPanel />
          </div>
        </div>
      </div>
    </Transition>
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
 * Only rendered when isMobileOverlayOpen is true (controlled by useLayout).
 * Uses fixed positioning so it floats above the grid layout.
 */

/* Root wrapper — contains both backdrop and panel for Transition targeting. */
.mobile-sidebar-overlay__root {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay-backdrop);
}

/* Backdrop: full-viewport dim layer behind the panel. */
.mobile-sidebar-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: var(--bg-overlay);
}

/* Slide-in panel container: fixed left column. */
.mobile-sidebar-overlay__panel {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--sidebar-width);
  height: 100dvh;
  z-index: var(--z-overlay-panel);
  outline: none; /* Panel is focusable but we manage visual focus internally. */
}

/* Inner wrapper that fills the panel and hosts SidebarPanel. */
.mobile-sidebar-overlay {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface);
  overflow: hidden;
}

/* ============================================================
   TRANSITION — Vue Transition "overlay"
   Enter: backdrop fades in, panel slides in from left.
   Leave: backdrop fades out, panel slides out to left.
   ============================================================ */

:global(.overlay-enter-active .mobile-sidebar-overlay__panel),
:global(.overlay-leave-active .mobile-sidebar-overlay__panel) {
  transition: transform 175ms ease-out;
}

:global(.overlay-enter-from .mobile-sidebar-overlay__panel),
:global(.overlay-leave-to .mobile-sidebar-overlay__panel) {
  transform: translateX(-100%);
}

:global(.overlay-enter-active .mobile-sidebar-overlay__backdrop),
:global(.overlay-leave-active .mobile-sidebar-overlay__backdrop) {
  transition: opacity 175ms ease-out;
}

:global(.overlay-enter-from .mobile-sidebar-overlay__backdrop),
:global(.overlay-leave-to .mobile-sidebar-overlay__backdrop) {
  opacity: 0;
}

/* Respect prefers-reduced-motion: skip slide/fade animation. */
@media (prefers-reduced-motion: reduce) {
  :global(.overlay-enter-active .mobile-sidebar-overlay__panel),
  :global(.overlay-leave-active .mobile-sidebar-overlay__panel),
  :global(.overlay-enter-active .mobile-sidebar-overlay__backdrop),
  :global(.overlay-leave-active .mobile-sidebar-overlay__backdrop) {
    transition: none;
  }
}
</style>

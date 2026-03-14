<template>
  <header
    class="spatial-shell__header shell-header"
    aria-label="Application header"
  >
    <!-- Hex Gate nav trigger: visible only on mobile viewports -->
    <button
      v-if="isMobile"
      ref="hamburgerRef"
      class="shell-header__hamburger"
      :class="{ 'is-open': isMobileOverlayOpen }"
      type="button"
      aria-label="Toggle navigation"
      :aria-expanded="isMobileOverlayOpen"
      @click="toggleMobileOverlay"
    >
      <span class="shell-header__hex-box">
        <span
          class="shell-header__hex-inner"
          aria-hidden="true"
        >
          <span class="shell-header__hex-seg shell-header__hex-seg--1" />
          <span class="shell-header__hex-seg shell-header__hex-seg--2" />
          <span class="shell-header__hex-seg shell-header__hex-seg--3" />
          <span class="shell-header__hex-seg shell-header__hex-seg--4" />
          <span class="shell-header__hex-seg shell-header__hex-seg--5" />
        </span>
      </span>
    </button>
    <div class="shell-header__left">
      <nav
        v-if="isSessionRoute"
        class="shell-header__breadcrumb"
        aria-label="Breadcrumb"
      >
        <router-link
          to="/"
          class="shell-header__breadcrumb-home"
        >
          Sessions
        </router-link>
        <span
          class="shell-header__breadcrumb-sep"
          aria-hidden="true"
        >/</span>
        <span class="shell-header__breadcrumb-current">
          {{ sessionLabel }}
        </span>
      </nav>
    </div>
    <div class="shell-header__right" />
  </header>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useRoute } from 'vue-router';
import { sessionListKey } from '../composables/useSessionList.js';
import { layoutKey } from '../composables/useLayout.js';

/**
 * ShellHeader renders the application header bar spanning the two right columns.
 * On session detail routes it shows a reactive breadcrumb: Sessions > {filename}.
 * Session filename is resolved from the injected session list (provided by SpatialShell).
 * On mobile, renders the Hexagonal Gate nav trigger that toggles the MobileSidebarOverlay.
 */

const route = useRoute();
const sessionList = inject(sessionListKey);
const layout = inject(layoutKey);

/** Ref to the hamburger button — used to return focus when overlay closes. */
const hamburgerRef = ref<HTMLElement | null>(null);

/** True on mobile viewports — drives hamburger visibility. */
const isMobile = computed(() => layout?.isMobile.value ?? false);

/** Whether the mobile sidebar overlay is currently visible. */
const isMobileOverlayOpen = computed(() => layout?.isMobileOverlayOpen.value ?? false);

/** True when the current route is a session detail page. */
const isSessionRoute = computed(() => route.name === 'session-detail');

/**
 * Resolves the display label for the current session breadcrumb.
 * Uses filename from the session list if available; falls back to the raw ID.
 */
const sessionLabel = computed(() => {
  const id = route.params.id as string | undefined;
  if (!id) return '';
  const session = sessionList?.sessions.value.find((s) => s.id === id);
  return session?.filename ?? id;
});

/** Toggles the mobile sidebar overlay open or closed. */
function toggleMobileOverlay(): void {
  if (isMobileOverlayOpen.value) {
    layout?.closeMobileOverlay();
  } else {
    layout?.openMobileOverlay();
  }
}

/** Exposes hamburgerRef so the overlay can return focus here on close. */
defineExpose({ hamburgerRef });
</script>

<style scoped>
/**
 * ShellHeader — primary header bar spanning the two right columns.
 * Clean, minimal. The gradient bottom border is the main visual element —
 * a TRON light-trail connecting from the brand mark junction to the right edge.
 */
.shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding-inline: var(--space-6);
  background: var(--bg-surface);
  /* Bottom border — continuous gradient line aligned with BrandMark's ::after. */
  position: relative;
}

.shell-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--accent-primary) 60%, transparent),
    color-mix(in srgb, var(--accent-secondary) 80%, transparent)
  );
}

/* Left section — holds breadcrumbs when on a session detail route. */
.shell-header__left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  flex: 1;
}

/* Right section — will hold global actions in a future stage. */
.shell-header__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* Breadcrumb nav — inline flex row with separator. */
.shell-header__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  min-width: 0;
}

/* "Sessions" home link — muted, underline on hover. */
.shell-header__breadcrumb-home {
  color: var(--text-muted);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.shell-header__breadcrumb-home:hover {
  color: var(--text-secondary);
  text-decoration: underline;
}

/* "/" separator — disabled color, no shrink. */
.shell-header__breadcrumb-sep {
  color: var(--text-disabled);
  flex-shrink: 0;
  user-select: none;
}

/* Current session filename — primary color, mono font, truncated. */
.shell-header__breadcrumb-current {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* ================================================================
   HEXAGONAL GATE NAV TRIGGER
   28px branded box with 5 CSS segments forming a partial hexagon.
   Morphs to an X when the mobile overlay is open.
   ================================================================ */

/* Outer button — 44px touch target with centred icon box. */
.shell-header__hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: var(--space-2);
  background: none;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.shell-header__hamburger:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 28px branded icon box — matches BrandMark aesthetic. */
.shell-header__hex-box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  background: rgba(0, 212, 255, 0.06);
  box-shadow:
    0 0 8px rgba(0, 212, 255, 0.15),
    inset 0 0 6px rgba(0, 212, 255, 0.08);
  transition: box-shadow var(--duration-normal) ease;
}

.shell-header__hamburger:hover .shell-header__hex-box {
  box-shadow:
    0 0 14px rgba(0, 212, 255, 0.35),
    inset 0 0 8px rgba(0, 212, 255, 0.12);
}

/* Glow pulse when opening (is-open added to the button, targets child). */
.shell-header__hamburger.is-open .shell-header__hex-box {
  animation: shell-hex-glow-pulse 450ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.shell-header__hamburger:not(.is-open) .shell-header__hex-box {
  animation: shell-hex-glow-settle 350ms ease forwards;
}

@keyframes shell-hex-glow-pulse {
  0% {
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.15), inset 0 0 6px rgba(0, 212, 255, 0.08);
  }
  40% {
    box-shadow:
      0 0 22px rgba(0, 212, 255, 0.55),
      0 0 44px rgba(0, 212, 255, 0.2),
      inset 0 0 12px rgba(0, 212, 255, 0.25);
  }
  100% {
    box-shadow:
      0 0 10px rgba(0, 212, 255, 0.35),
      inset 0 0 6px rgba(0, 212, 255, 0.08);
  }
}

@keyframes shell-hex-glow-settle {
  0% {
    box-shadow:
      0 0 10px rgba(0, 212, 255, 0.35),
      inset 0 0 6px rgba(0, 212, 255, 0.08);
  }
  30% {
    box-shadow:
      0 0 18px rgba(0, 212, 255, 0.55),
      0 0 36px rgba(0, 212, 255, 0.15),
      inset 0 0 10px rgba(0, 212, 255, 0.25);
  }
  100% {
    box-shadow:
      0 0 8px rgba(0, 212, 255, 0.15),
      inset 0 0 6px rgba(0, 212, 255, 0.08);
  }
}

/* Inner positioning container for the 5 segments. */
.shell-header__hex-inner {
  position: relative;
  width: 15px;
  height: 13px;
}

/* Base segment styles — all 5 share these. */
.shell-header__hex-seg {
  position: absolute;
  height: 1.5px;
  border-radius: 0.75px;
  background: var(--accent-primary);
  will-change: transform, opacity;
  transform-origin: center center;
}

/* === CLOSED STATE: partial hexagon (gap on right) === */
/* Seg 1 — top horizontal */
.shell-header__hex-seg--1 {
  width: 7.5px;
  top: -0.5px;
  left: 3.75px;
  transform: rotate(0deg);
  transition:
    transform 320ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
    opacity 200ms ease 0ms,
    top 320ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
    left 320ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,
    width 320ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
}

/* Seg 2 — top-left diagonal */
.shell-header__hex-seg--2 {
  width: 7.5px;
  top: 2.75px;
  left: -1.5px;
  transform: rotate(-60deg);
  transition:
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1) 40ms,
    opacity 200ms ease 40ms,
    top 300ms cubic-bezier(0.4, 0, 0.2, 1) 40ms,
    left 300ms cubic-bezier(0.4, 0, 0.2, 1) 40ms,
    width 300ms cubic-bezier(0.4, 0, 0.2, 1) 40ms;
}

/* Seg 3 — bottom-left diagonal */
.shell-header__hex-seg--3 {
  width: 7.5px;
  top: 9.25px;
  left: -1.5px;
  transform: rotate(60deg);
  transition:
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1) 80ms,
    opacity 200ms ease 80ms,
    top 300ms cubic-bezier(0.4, 0, 0.2, 1) 80ms,
    left 300ms cubic-bezier(0.4, 0, 0.2, 1) 80ms,
    width 300ms cubic-bezier(0.4, 0, 0.2, 1) 80ms;
}

/* Seg 4 — bottom horizontal */
.shell-header__hex-seg--4 {
  width: 7.5px;
  bottom: -0.5px;
  left: 3.75px;
  transform: rotate(0deg);
  transition:
    transform 320ms cubic-bezier(0.4, 0, 0.2, 1) 120ms,
    opacity 200ms ease 120ms,
    bottom 320ms cubic-bezier(0.4, 0, 0.2, 1) 120ms,
    left 320ms cubic-bezier(0.4, 0, 0.2, 1) 120ms,
    width 320ms cubic-bezier(0.4, 0, 0.2, 1) 120ms;
}

/* Seg 5 — gap-edge (top-right, dimmed) */
.shell-header__hex-seg--5 {
  width: 7.5px;
  top: 2.75px;
  right: -1.5px;
  transform: rotate(60deg);
  opacity: 0.3;
  transition:
    transform 280ms cubic-bezier(0.4, 0, 0.2, 1) 60ms,
    opacity 250ms ease 60ms,
    top 280ms cubic-bezier(0.4, 0, 0.2, 1) 60ms,
    right 280ms cubic-bezier(0.4, 0, 0.2, 1) 60ms,
    width 280ms cubic-bezier(0.4, 0, 0.2, 1) 60ms;
}

/* === OPEN STATE: X cross === */
.shell-header__hamburger.is-open .shell-header__hex-seg--1 {
  width: 12px;
  top: 5.75px;
  left: 1.5px;
  transform: rotate(45deg);
  opacity: 1;
}

.shell-header__hamburger.is-open .shell-header__hex-seg--2 {
  width: 0;
  top: 5.75px;
  left: 7.5px;
  transform: rotate(0deg);
  opacity: 0;
}

.shell-header__hamburger.is-open .shell-header__hex-seg--3 {
  width: 0;
  top: 5.75px;
  left: 7.5px;
  transform: rotate(0deg);
  opacity: 0;
}

.shell-header__hamburger.is-open .shell-header__hex-seg--4 {
  width: 12px;
  top: 5.75px;
  left: 1.5px;
  transform: rotate(-45deg);
  opacity: 1;
}

.shell-header__hamburger.is-open .shell-header__hex-seg--5 {
  width: 0;
  top: 5.75px;
  right: 7.5px;
  transform: rotate(0deg);
  opacity: 0;
}

/* Respect reduced-motion preference — instant state, no animation. */
@media (prefers-reduced-motion: reduce) {
  .shell-header__hex-seg,
  .shell-header__hex-seg--1,
  .shell-header__hex-seg--2,
  .shell-header__hex-seg--3,
  .shell-header__hex-seg--4,
  .shell-header__hex-seg--5 {
    transition: none !important;
  }

  .shell-header__hamburger.is-open .shell-header__hex-box,
  .shell-header__hamburger:not(.is-open) .shell-header__hex-box {
    animation: none !important;
  }
}
</style>

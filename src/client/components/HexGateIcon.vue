<template>
  <button class="hex-gate-icon" :class="{ 'is-open': isOpen }" type="button">
    <span class="hex-gate-icon__box">
      <span class="hex-gate-icon__inner" aria-hidden="true">
        <span class="hex-gate-icon__seg hex-gate-icon__seg--1" />
        <span class="hex-gate-icon__seg hex-gate-icon__seg--2" />
        <span class="hex-gate-icon__seg hex-gate-icon__seg--3" />
        <span class="hex-gate-icon__seg hex-gate-icon__seg--4" />
        <span class="hex-gate-icon__seg hex-gate-icon__seg--5" />
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * HexGateIcon — 44px touch-target button with a 28px branded hex gate icon.
 * Morphs between a partial hexagon (closed) and an X cross (open).
 * Used in ShellHeader (toggle) and SidebarPanel (close button on mobile).
 *
 * Pass `aria-label` as an HTML attribute — it inherits onto the root <button>.
 * Pass `:isOpen` prop to control the hex (closed) vs X (open) visual state.
 */

defineProps<{
  /** Whether the icon is in its open (X) state. */
  isOpen: boolean;
}>();
</script>

<style scoped>
/* ================================================================
   HEXAGONAL GATE ICON
   44px touch target containing a 28px branded box.
   5 CSS segments form a partial hexagon (closed) or X (open).
   ================================================================ */

/* Outer button — 44px minimum touch target. */
.hex-gate-icon {
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

.hex-gate-icon:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 28px branded icon box — matches BrandMark aesthetic. */
.hex-gate-icon__box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
  box-shadow:
    0 0 8px color-mix(in srgb, var(--accent-primary) 15%, transparent),
    inset 0 0 6px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  transition: box-shadow var(--duration-normal) ease;
}

.hex-gate-icon:hover .hex-gate-icon__box {
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-primary) 35%, transparent),
    inset 0 0 8px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

/* Glow pulse when opening (is-open state). */
.hex-gate-icon.is-open .hex-gate-icon__box {
  animation: hex-gate-glow-pulse 450ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.hex-gate-icon:not(.is-open) .hex-gate-icon__box {
  animation: hex-gate-glow-settle 350ms ease forwards;
}

@keyframes hex-gate-glow-pulse {
  0% {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--accent-primary) 15%, transparent),
      inset 0 0 6px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }

  40% {
    box-shadow:
      0 0 22px color-mix(in srgb, var(--accent-primary) 55%, transparent),
      0 0 44px color-mix(in srgb, var(--accent-primary) 20%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--accent-primary) 25%, transparent);
  }

  100% {
    box-shadow:
      0 0 10px color-mix(in srgb, var(--accent-primary) 35%, transparent),
      inset 0 0 6px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }
}

@keyframes hex-gate-glow-settle {
  0% {
    box-shadow:
      0 0 10px color-mix(in srgb, var(--accent-primary) 35%, transparent),
      inset 0 0 6px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }

  30% {
    box-shadow:
      0 0 18px color-mix(in srgb, var(--accent-primary) 55%, transparent),
      0 0 36px color-mix(in srgb, var(--accent-primary) 15%, transparent),
      inset 0 0 10px color-mix(in srgb, var(--accent-primary) 25%, transparent);
  }

  100% {
    box-shadow:
      0 0 8px color-mix(in srgb, var(--accent-primary) 15%, transparent),
      inset 0 0 6px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }
}

/* Inner positioning container for the 5 segments. */
.hex-gate-icon__inner {
  position: relative;
  width: 15px;
  height: 13px;
}

/* Base segment styles — all 5 share these. */
.hex-gate-icon__seg {
  position: absolute;
  height: 1.5px;
  border-radius: 0.75px;
  background: var(--accent-primary);
  will-change: transform, opacity;
  transform-origin: center center;
}

/* === CLOSED STATE: partial hexagon (gap on right) === */

/* Seg 1 — top horizontal */
.hex-gate-icon__seg--1 {
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
.hex-gate-icon__seg--2 {
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
.hex-gate-icon__seg--3 {
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
.hex-gate-icon__seg--4 {
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
.hex-gate-icon__seg--5 {
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
.hex-gate-icon.is-open .hex-gate-icon__seg--1 {
  width: 12px;
  top: 5.75px;
  left: 1.5px;
  transform: rotate(45deg);
  opacity: 1;
}

.hex-gate-icon.is-open .hex-gate-icon__seg--2 {
  width: 0;
  top: 5.75px;
  left: 7.5px;
  transform: rotate(0deg);
  opacity: 0;
}

.hex-gate-icon.is-open .hex-gate-icon__seg--3 {
  width: 0;
  top: 5.75px;
  left: 7.5px;
  transform: rotate(0deg);
  opacity: 0;
}

.hex-gate-icon.is-open .hex-gate-icon__seg--4 {
  width: 12px;
  top: 5.75px;
  left: 1.5px;
  transform: rotate(-45deg);
  opacity: 1;
}

.hex-gate-icon.is-open .hex-gate-icon__seg--5 {
  width: 0;
  top: 5.75px;
  right: 7.5px;
  transform: rotate(0deg);
  opacity: 0;
}

/* Respect reduced-motion preference — instant state, no animation. */
@media (prefers-reduced-motion: reduce) {
  .hex-gate-icon__seg,
  .hex-gate-icon__seg--1,
  .hex-gate-icon__seg--2,
  .hex-gate-icon__seg--3,
  .hex-gate-icon__seg--4,
  .hex-gate-icon__seg--5 {
    transition: none !important;
  }

  .hex-gate-icon.is-open .hex-gate-icon__box,
  .hex-gate-icon:not(.is-open) .hex-gate-icon__box {
    animation: none !important;
  }
}
</style>

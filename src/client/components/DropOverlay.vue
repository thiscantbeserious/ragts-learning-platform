<template>
  <div
    class="drop-overlay"
    :class="{ 'drop-overlay--visible': visible }"
    aria-dropeffect="copy"
    aria-label="Drop zone — release to upload"
    aria-live="polite"
  >
    <div class="drop-overlay__frame">
      <p class="drop-overlay__message">
        Drop <code>.cast</code> file to upload
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DropOverlay — full-viewport drag target shown during file drag.
 *
 * Rendered by SpatialShell when a file drag enters the viewport.
 * Uses the dragenter counter pattern for accurate show/hide.
 * Respects prefers-reduced-motion: animated border glow replaced with static border.
 */
withDefaults(defineProps<{ visible?: boolean }>(), { visible: false });
</script>

<style scoped>
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--duration-fast, 100ms) var(--easing-default, ease-out);
}

.drop-overlay--visible {
  pointer-events: auto;
  opacity: 1;
}

/* Centered drop target frame */
.drop-overlay__frame {
  border: 2px dashed var(--accent-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-10) var(--space-12);
  text-align: center;
  box-shadow:
    0 0 20px 4px var(--accent-primary-glow, rgba(0, 212, 255, 0.3)),
    inset 0 0 20px 4px rgba(0, 212, 255, 0.06);
  animation: dropOverlayGlow 2s ease-in-out infinite;
}

.drop-overlay__message {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  color: var(--accent-primary);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  margin: 0;
}

.drop-overlay__message code {
  font-family: var(--font-mono);
  color: var(--accent-primary);
}

/* Animated border glow — pulses in/out */
@keyframes dropOverlayGlow {
  0%, 100% {
    box-shadow:
      0 0 20px 4px rgba(0, 212, 255, 0.3),
      inset 0 0 20px 4px rgba(0, 212, 255, 0.06);
  }
  50% {
    box-shadow:
      0 0 40px 10px rgba(0, 212, 255, 0.55),
      inset 0 0 30px 6px rgba(0, 212, 255, 0.12);
  }
}

/* Reduced motion: static border glow, no animation */
@media (prefers-reduced-motion: reduce) {
  .drop-overlay__frame {
    animation: none;
    box-shadow:
      0 0 20px 4px rgba(0, 212, 255, 0.3),
      inset 0 0 20px 4px rgba(0, 212, 255, 0.06);
  }
}
</style>

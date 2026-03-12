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
 * DropOverlay — sidebar-scoped drag target shown during file drag.
 *
 * Rendered inside the sidebar by SpatialShell when a file drag enters the sidebar.
 * Uses the dragenter counter pattern for accurate show/hide.
 * Respects prefers-reduced-motion: animated border glow replaced with static border.
 */
withDefaults(defineProps<{ visible?: boolean }>(), { visible: false });
</script>

<style scoped>
.drop-overlay {
  position: absolute;
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

.drop-overlay__frame {
  border: 2px dashed var(--accent-primary);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-5);
  text-align: center;
  margin: var(--space-3);
  box-shadow:
    0 0 16px 3px var(--accent-primary-glow, rgba(0, 212, 255, 0.3)),
    inset 0 0 16px 3px rgba(0, 212, 255, 0.05);
  animation: dropOverlayGlow 2s ease-in-out infinite;
}

.drop-overlay__message {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--accent-primary);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  margin: 0;
}

.drop-overlay__message code {
  font-family: var(--font-mono);
  color: var(--accent-primary);
}

@keyframes dropOverlayGlow {
  0%, 100% {
    box-shadow:
      0 0 16px 3px rgba(0, 212, 255, 0.25),
      inset 0 0 16px 3px rgba(0, 212, 255, 0.05);
  }
  50% {
    box-shadow:
      0 0 30px 8px rgba(0, 212, 255, 0.45),
      inset 0 0 24px 5px rgba(0, 212, 255, 0.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .drop-overlay__frame {
    animation: none;
    box-shadow:
      0 0 16px 3px rgba(0, 212, 255, 0.25),
      inset 0 0 16px 3px rgba(0, 212, 255, 0.05);
  }
}
</style>

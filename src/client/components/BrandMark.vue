<template>
  <div class="spatial-shell__brand brand-mark">
    <router-link
      to="/"
      class="brand-mark__logotype"
      aria-label="Erika — go to home"
    >
      <div
        class="brand-mark__icon"
        aria-hidden="true"
      >
        E
      </div>
      <span class="brand-mark__name">Erika</span>
    </router-link>
  </div>
</template>

<style scoped>
/**
 * BrandMark — top-left corner of the spatial shell (260px x 54px).
 * Contains the Erika logotype with icon and name. Acts as the visual
 * cap of the sidebar, connected to the ShellHeader via bottom border.
 */
.brand-mark {
  display: flex;
  align-items: center;
  height: var(--header-height);
  padding-inline: var(--space-4);
  background: var(--bg-surface);
  position: relative;
  box-shadow: inset -1px 0 0 var(--border-default);
}

/* Bottom border — gradient line that aligns with the header's bottom border. */
.brand-mark::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-primary) 40%,
    var(--accent-primary) 100%
  );
  opacity: 0.6;
}

.brand-mark__logotype {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: inherit;
}

.brand-mark__icon {
  width: 28px;
  height: 28px;
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--accent-primary);
  background: rgba(0, 212, 255, 0.06);
  box-shadow:
    0 0 8px rgba(0, 212, 255, 0.15),
    inset 0 0 6px rgba(0, 212, 255, 0.08);
  transition: box-shadow var(--duration-normal) var(--easing-default);
  flex-shrink: 0;
}

.brand-mark__logotype:hover .brand-mark__icon {
  box-shadow:
    0 0 14px rgba(0, 212, 255, 0.35),
    inset 0 0 8px rgba(0, 212, 255, 0.12);
}

.brand-mark__name {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  color: var(--text-primary);
  line-height: var(--lh-lg);
  text-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
  transition: text-shadow var(--duration-normal) var(--easing-default);
}

.brand-mark__logotype:hover .brand-mark__name {
  text-shadow: 0 0 24px rgba(0, 212, 255, 0.3);
}

/* Mobile: brand mark is hidden (single-column layout, no sidebar). */
@media (max-width: 767px) {
  .brand-mark {
    display: none;
  }
}
</style>

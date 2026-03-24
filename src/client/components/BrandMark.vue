<template>
  <div class="spatial-shell__brand brand-mark">
    <router-link to="/" class="brand-mark__logotype" aria-label="Erika — go to home">
      <div class="brand-mark__icon" aria-hidden="true">E</div>
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

/* Bottom border — straight line that connects seamlessly with ShellHeader's ::after. */
.brand-mark::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: color-mix(in srgb, var(--accent-primary) 60%, transparent);
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
  background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
  box-shadow:
    0 0 8px color-mix(in srgb, var(--accent-primary) 15%, transparent),
    inset 0 0 6px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  transition: box-shadow var(--duration-normal) var(--easing-default);
  flex-shrink: 0;
}

.brand-mark__logotype:hover .brand-mark__icon {
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-primary) 35%, transparent),
    inset 0 0 8px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.brand-mark__name {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide);
  color: var(--text-primary);
  line-height: var(--lh-lg);
  text-shadow: 0 0 20px color-mix(in srgb, var(--accent-primary) 15%, transparent);
  transition: text-shadow var(--duration-normal) var(--easing-default);
}

.brand-mark__logotype:hover .brand-mark__name {
  text-shadow: 0 0 24px color-mix(in srgb, var(--accent-primary) 30%, transparent);
}

/* Mobile: brand mark is hidden (single-column layout, no sidebar). */
@media (max-width: 767px) {
  .brand-mark {
    display: none;
  }
}
</style>

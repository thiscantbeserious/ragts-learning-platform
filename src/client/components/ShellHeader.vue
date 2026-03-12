<template>
  <header
    class="spatial-shell__header shell-header"
    aria-label="Application header"
  >
    <div class="shell-header__left" />
    <div class="shell-header__right" />
  </header>
</template>

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
  position: relative;
}

/* TRON gradient bottom border — runs from cyan (left) through to pink (right). */
.shell-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    var(--accent-primary) 0%,
    var(--accent-primary) 40%,
    var(--accent-secondary) 85%,
    transparent 100%
  );
  opacity: 0.7;
  box-shadow:
    0 0 8px var(--accent-primary-glow),
    0 0 20px rgba(0, 212, 255, 0.12);
}

/* Left section — will hold breadcrumbs in a future stage. */
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
</style>

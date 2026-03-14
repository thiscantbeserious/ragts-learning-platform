<template>
  <header
    class="spatial-shell__header shell-header"
    aria-label="Application header"
  >
    <!-- Hamburger: visible only on mobile viewports -->
    <button
      v-if="isMobile"
      ref="hamburgerRef"
      class="shell-header__hamburger"
      type="button"
      aria-label="Open navigation"
      @click="openMobileOverlay"
    >
      <span
        class="shell-header__hamburger-bar"
        aria-hidden="true"
      />
      <span
        class="shell-header__hamburger-bar"
        aria-hidden="true"
      />
      <span
        class="shell-header__hamburger-bar"
        aria-hidden="true"
      />
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
 * On mobile, renders a hamburger toggle that opens the MobileSidebarOverlay.
 */

const route = useRoute();
const sessionList = inject(sessionListKey);
const layout = inject(layoutKey);

/** Ref to the hamburger button — used to return focus when overlay closes. */
const hamburgerRef = ref<HTMLElement | null>(null);

/** True on mobile viewports — drives hamburger visibility. */
const isMobile = computed(() => layout?.isMobile.value ?? false);

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

/** Opens the mobile sidebar overlay. No-op when layout is not injected. */
function openMobileOverlay(): void {
  layout?.openMobileOverlay();
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

/* Hamburger button — visible only on mobile (v-if driven by isMobile). */
.shell-header__hamburger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
  width: 44px; /* 44px min touch target */
  height: 44px;
  padding: var(--space-3);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  flex-shrink: 0;
  box-sizing: border-box;
}

.shell-header__hamburger:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Three horizontal bars that form the hamburger icon. */
.shell-header__hamburger-bar {
  display: block;
  width: 18px;
  height: 2px;
  background: currentColor;
  border-radius: 1px;
}
</style>

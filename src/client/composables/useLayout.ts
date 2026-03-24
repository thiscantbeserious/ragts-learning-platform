import { ref, readonly, watch, onScopeDispose, getCurrentScope } from 'vue';
import type { InjectionKey, Ref } from 'vue';

const STORAGE_KEY = 'erika:layout:sidebar-open';

/** Shape of the layout state provided to child components. */
export interface LayoutState {
  /** Whether the sidebar panel is currently open. */
  isSidebarOpen: Readonly<Ref<boolean>>;
  /** Toggles the sidebar open/closed, persisting to localStorage. */
  toggleSidebar: () => void;
  /** True when the viewport is narrower than 768px (mobile breakpoint). */
  isMobile: Readonly<Ref<boolean>>;
  /** Whether the mobile sidebar overlay is currently visible. Always false on desktop. */
  isMobileOverlayOpen: Readonly<Ref<boolean>>;
  /** Opens the mobile sidebar overlay. No-op on desktop. */
  openMobileOverlay: () => void;
  /** Closes the mobile sidebar overlay and clears open state. */
  closeMobileOverlay: () => void;
}

/**
 * Injection key for the layout state.
 * Used with Vue's provide/inject to share layout state across the component tree.
 */
export const layoutKey: InjectionKey<LayoutState> = Symbol('layout');

/** Reads sidebar state from localStorage. Returns true (open) on missing or invalid values. */
function readStoredSidebarOpen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'boolean') return true;
    return parsed;
  } catch {
    return true;
  }
}

/**
 * Manages sidebar open/close state with localStorage persistence.
 * Provides `isSidebarOpen`, `toggleSidebar`, and `isMobile`.
 * `isMobile` is reactive — it updates when the viewport crosses the 768px breakpoint.
 * Use `provide(layoutKey, useLayout())` in SpatialShell to share state with children.
 */
export function useLayout(): LayoutState {
  const isSidebarOpen = ref(readStoredSidebarOpen());

  const mq =
    typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(max-width: 767px)')
      : null;

  const isMobile = ref(mq?.matches ?? false);

  /** Updates isMobile when the viewport crosses the mobile breakpoint. */
  function onMediaChange(e: MediaQueryListEvent): void {
    isMobile.value = e.matches;
  }

  if (mq) {
    mq.addEventListener('change', onMediaChange);
    // Only register dispose if there is an active effect scope (e.g. a Vue component or effectScope()).
    if (getCurrentScope()) {
      onScopeDispose(() => mq.removeEventListener('change', onMediaChange));
    }
  }

  function toggleSidebar(): void {
    isSidebarOpen.value = !isSidebarOpen.value;
    try {
      localStorage.setItem(STORAGE_KEY, String(isSidebarOpen.value));
    } catch {
      // Persistence is best-effort; silently swallow storage errors (e.g. quota exceeded).
    }
  }

  const isMobileOverlayOpen = ref(false);

  /**
   * Auto-close the mobile overlay when the viewport transitions out of mobile.
   * Prevents stale overlay + body scroll-lock on desktop after resize.
   */
  watch(isMobile, (mobile) => {
    if (!mobile && isMobileOverlayOpen.value) {
      isMobileOverlayOpen.value = false;
    }
  });

  /** Opens the mobile sidebar overlay. No-op on desktop. */
  function openMobileOverlay(): void {
    if (!isMobile.value) return;
    isMobileOverlayOpen.value = true;
  }

  /** Closes the mobile sidebar overlay. */
  function closeMobileOverlay(): void {
    isMobileOverlayOpen.value = false;
  }

  return {
    isSidebarOpen: readonly(isSidebarOpen),
    toggleSidebar,
    isMobile: readonly(isMobile),
    isMobileOverlayOpen: readonly(isMobileOverlayOpen),
    openMobileOverlay,
    closeMobileOverlay,
  };
}

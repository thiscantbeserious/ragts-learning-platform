import { ref, readonly } from 'vue';
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

/** Checks whether the current viewport matches the mobile breakpoint (< 768px). */
function checkIsMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Manages sidebar open/close state with localStorage persistence.
 * Provides `isSidebarOpen`, `toggleSidebar`, and `isMobile`.
 * Use `provide(layoutKey, useLayout())` in SpatialShell to share state with children.
 */
export function useLayout(): LayoutState {
  const isSidebarOpen = ref(readStoredSidebarOpen());
  const isMobile = ref(checkIsMobile());

  function toggleSidebar(): void {
    isSidebarOpen.value = !isSidebarOpen.value;
    localStorage.setItem(STORAGE_KEY, String(isSidebarOpen.value));
  }

  return {
    isSidebarOpen: readonly(isSidebarOpen),
    toggleSidebar,
    isMobile: readonly(isMobile),
  };
}

/**
 * Tests for useLayout composable.
 *
 * Covers sidebar state management, localStorage persistence,
 * and invalid JSON handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLayout } from './useLayout.js';

const STORAGE_KEY = 'erika:layout:sidebar-open';

/** Creates a simple in-memory localStorage stub. */
function makeLocalStorageStub() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const key of Object.keys(store)) delete store[key]; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    _store: store,
  };
}

let localStorageStub: ReturnType<typeof makeLocalStorageStub>;

describe('useLayout()', () => {
  beforeEach(() => {
    localStorageStub = makeLocalStorageStub();
    vi.stubGlobal('localStorage', localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('defaults isSidebarOpen to true when no localStorage value', () => {
      const { isSidebarOpen } = useLayout();
      expect(isSidebarOpen.value).toBe(true);
    });

    it('reads isSidebarOpen from localStorage when value is "true"', () => {
      localStorageStub._store[STORAGE_KEY] = 'true';
      const { isSidebarOpen } = useLayout();
      expect(isSidebarOpen.value).toBe(true);
    });

    it('reads isSidebarOpen as false from localStorage when value is "false"', () => {
      localStorageStub._store[STORAGE_KEY] = 'false';
      const { isSidebarOpen } = useLayout();
      expect(isSidebarOpen.value).toBe(false);
    });

    it('falls back to true when localStorage contains invalid JSON', () => {
      localStorageStub._store[STORAGE_KEY] = '{invalid-json}';
      const { isSidebarOpen } = useLayout();
      expect(isSidebarOpen.value).toBe(true);
    });

    it('falls back to true when localStorage contains unexpected type', () => {
      localStorageStub._store[STORAGE_KEY] = '"not-a-boolean"';
      const { isSidebarOpen } = useLayout();
      expect(isSidebarOpen.value).toBe(true);
    });
  });

  describe('toggleSidebar()', () => {
    it('flips isSidebarOpen from true to false', () => {
      const { isSidebarOpen, toggleSidebar } = useLayout();
      expect(isSidebarOpen.value).toBe(true);
      toggleSidebar();
      expect(isSidebarOpen.value).toBe(false);
    });

    it('flips isSidebarOpen from false to true', () => {
      localStorageStub._store[STORAGE_KEY] = 'false';
      const { isSidebarOpen, toggleSidebar } = useLayout();
      expect(isSidebarOpen.value).toBe(false);
      toggleSidebar();
      expect(isSidebarOpen.value).toBe(true);
    });

    it('persists the new value to localStorage after toggle', () => {
      const { toggleSidebar } = useLayout();
      toggleSidebar();
      expect(localStorageStub.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'false');
    });

    it('persists true to localStorage after toggling back', () => {
      localStorageStub._store[STORAGE_KEY] = 'false';
      const { toggleSidebar } = useLayout();
      toggleSidebar();
      expect(localStorageStub.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'true');
    });
  });

  describe('isMobile', () => {
    it('exposes isMobile as a ref', () => {
      const { isMobile } = useLayout();
      expect(typeof isMobile.value).toBe('boolean');
    });
  });

  describe('return shape', () => {
    it('returns isSidebarOpen, toggleSidebar, and isMobile', () => {
      const layout = useLayout();
      expect('isSidebarOpen' in layout).toBe(true);
      expect('toggleSidebar' in layout).toBe(true);
      expect('isMobile' in layout).toBe(true);
    });
  });
});

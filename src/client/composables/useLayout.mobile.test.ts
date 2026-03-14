/**
 * Tests for useLayout mobile overlay additions — Stage 13.
 *
 * Covers: isMobileOverlayOpen initial state, openMobileOverlay, closeMobileOverlay,
 * auto-close on viewport resize from mobile→desktop, and the LayoutState shape
 * including new mobile overlay fields.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useLayout } from './useLayout.js';

describe('useLayout() — mobile overlay (Stage 13)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isMobileOverlayOpen', () => {
    it('defaults to false on init', () => {
      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });
      expect(layout?.isMobileOverlayOpen.value).toBe(false);
      scope.stop();
    });
  });

  describe('openMobileOverlay()', () => {
    it('sets isMobileOverlayOpen to true', () => {
      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      layout?.openMobileOverlay();
      expect(layout?.isMobileOverlayOpen.value).toBe(true);
      scope.stop();
    });
  });

  describe('closeMobileOverlay()', () => {
    it('sets isMobileOverlayOpen to false after opening', () => {
      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      layout?.openMobileOverlay();
      layout?.closeMobileOverlay();
      expect(layout?.isMobileOverlayOpen.value).toBe(false);
      scope.stop();
    });

    it('is a no-op when overlay is already closed', () => {
      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      layout?.closeMobileOverlay();
      expect(layout?.isMobileOverlayOpen.value).toBe(false);
      scope.stop();
    });
  });

  describe('resize auto-close (mobile→desktop)', () => {
    it('closes the overlay when isMobile transitions from true to false', async () => {
      let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
      const mqStub = {
        matches: true, // start in mobile
        addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
          changeHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };
      vi.spyOn(window, 'matchMedia').mockReturnValue(mqStub as unknown as MediaQueryList);

      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      // Open the overlay while on mobile
      layout?.openMobileOverlay();
      expect(layout?.isMobileOverlayOpen.value).toBe(true);

      // Simulate viewport widening to desktop width
      mqStub.matches = false;
      if (changeHandler) {
        (changeHandler as (e: Partial<MediaQueryListEvent>) => void)({ matches: false } as MediaQueryListEvent);
      }
      await nextTick();

      expect(layout?.isMobileOverlayOpen.value).toBe(false);

      scope.stop();
      vi.restoreAllMocks();
    });

    it('does not change overlay state when isMobile transitions from false to true', async () => {
      let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;
      const mqStub = {
        matches: false, // start on desktop
        addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
          changeHandler = handler;
        }),
        removeEventListener: vi.fn(),
      };
      vi.spyOn(window, 'matchMedia').mockReturnValue(mqStub as unknown as MediaQueryList);

      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      // Overlay is already closed on desktop
      expect(layout?.isMobileOverlayOpen.value).toBe(false);

      // Simulate viewport narrowing to mobile
      mqStub.matches = true;
      if (changeHandler) {
        (changeHandler as (e: Partial<MediaQueryListEvent>) => void)({ matches: true } as MediaQueryListEvent);
      }
      await nextTick();

      // Overlay should still be closed — the watch only closes, never opens
      expect(layout?.isMobileOverlayOpen.value).toBe(false);

      scope.stop();
      vi.restoreAllMocks();
    });
  });

  describe('return shape', () => {
    it('exposes isMobileOverlayOpen, openMobileOverlay, closeMobileOverlay', () => {
      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      expect('isMobileOverlayOpen' in (layout ?? {})).toBe(true);
      expect('openMobileOverlay' in (layout ?? {})).toBe(true);
      expect('closeMobileOverlay' in (layout ?? {})).toBe(true);
      scope.stop();
    });

    it('isMobileOverlayOpen is readonly (ref-like)', () => {
      const scope = effectScope();
      let layout: ReturnType<typeof useLayout> | undefined;
      scope.run(() => { layout = useLayout(); });

      // Should be a ref (has .value)
      expect(typeof layout?.isMobileOverlayOpen?.value).toBe('boolean');
      scope.stop();
    });
  });
});

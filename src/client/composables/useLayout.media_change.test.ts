/**
 * Branch coverage tests for useLayout — onMediaChange handler (line 50).
 *
 * The onMediaChange function is the listener registered with matchMedia.addEventListener.
 * It updates isMobile when the media query fires a change event.
 * This test directly triggers the registered listener to exercise the function body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useLayout } from './useLayout.js';

describe('useLayout() — onMediaChange handler (line 50)', () => {
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
    vi.restoreAllMocks();
  });

  it('onMediaChange sets isMobile.value to true when e.matches is true', () => {
    let registeredHandler: ((e: MediaQueryListEvent) => void) | null = null;
    const mqStub = {
      matches: false,
      addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
        registeredHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mqStub as unknown as MediaQueryList);

    const scope = effectScope();
    let layout: ReturnType<typeof useLayout> | undefined;
    scope.run(() => {
      layout = useLayout();
    });

    // Initially desktop
    expect(layout?.isMobile.value).toBe(false);

    // Fire the media change event with matches: true (viewport shrinks to mobile)
    registeredHandler!({ matches: true } as MediaQueryListEvent);

    expect(layout?.isMobile.value).toBe(true);

    scope.stop();
  });

  it('onMediaChange sets isMobile.value to false when e.matches is false', () => {
    let registeredHandler: ((e: MediaQueryListEvent) => void) | null = null;
    const mqStub = {
      matches: true, // start as mobile
      addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
        registeredHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mqStub as unknown as MediaQueryList);

    const scope = effectScope();
    let layout: ReturnType<typeof useLayout> | undefined;
    scope.run(() => {
      layout = useLayout();
    });

    // Initially mobile
    expect(layout?.isMobile.value).toBe(true);

    // Fire the media change event with matches: false (viewport widens to desktop)
    registeredHandler!({ matches: false } as MediaQueryListEvent);

    expect(layout?.isMobile.value).toBe(false);

    scope.stop();
  });
});

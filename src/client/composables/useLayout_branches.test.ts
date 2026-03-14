/**
 * Branch coverage tests for useLayout composable — uncovered branches.
 *
 * Lines targeted:
 *   50-61 — matchMedia initialization:
 *     - mq is null when window is undefined (SSR/non-browser path)
 *     - getCurrentScope() returns null → onScopeDispose not registered
 *     - isMobile defaults to false when mq is null
 *
 * These branches are not exercised by the existing useLayout.test.ts because
 * all those tests run in happy-dom where window is always defined.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useLayout } from './useLayout.js';

describe('useLayout() — no-window / no-scope branches (lines 50-61)', () => {
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

  it('defaults isMobile to false when matchMedia returns null (mq === null path)', () => {
    // Simulate environment where matchMedia is not available
    vi.spyOn(window, 'matchMedia').mockReturnValue(null as unknown as MediaQueryList);

    const scope = effectScope();
    let layout: ReturnType<typeof useLayout> | undefined;
    scope.run(() => { layout = useLayout(); });

    // isMobile should default to false (mq?.matches ?? false → null?.matches → false)
    expect(layout?.isMobile.value).toBe(false);

    scope.stop();
  });

  it('does not throw when matchMedia is null and scope is disposed', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(null as unknown as MediaQueryList);

    const scope = effectScope();
    scope.run(() => { useLayout(); });

    // Stopping the scope when mq is null should not throw
    expect(() => scope.stop()).not.toThrow();
  });

  it('does not register scope dispose when no active scope exists (getCurrentScope = null)', () => {
    // Call useLayout outside any effectScope — getCurrentScope() returns undefined/null
    // This exercises the `if (getCurrentScope())` false branch — no onScopeDispose call
    const mqStub = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mqStub as unknown as MediaQueryList);

    // Call outside any scope — should not throw even without scope dispose registration
    expect(() => { useLayout(); }).not.toThrow();

    // removeEventListener should NOT be called (no scope to dispose)
    // addEventListener was called to attach the change handler
    expect(mqStub.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('registers scope dispose cleanup when called inside an effectScope', () => {
    const mqStub = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mqStub as unknown as MediaQueryList);

    const scope = effectScope();
    scope.run(() => { useLayout(); });

    // Stopping scope should trigger removeEventListener (via onScopeDispose callback)
    scope.stop();
    expect(mqStub.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

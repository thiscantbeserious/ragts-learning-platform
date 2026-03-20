/**
 * Tests for useScheduler composable — structured timer lifecycle.
 *
 * Covers: createScheduler after() basics, handle.cancel(), cancelAll(),
 * Vue lifecycle integration via effectScope, and NOOP_HANDLE behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { createScheduler, useScheduler } from './useScheduler.js';
import type { Scheduler } from './useScheduler.js';

describe('createScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('after() basics', () => {
    it('fires callback after the specified delay', () => {
      const scheduler = createScheduler();
      const cb = vi.fn();
      scheduler.after(5000, cb);
      vi.advanceTimersByTime(5000);
      expect(cb).toHaveBeenCalledOnce();
    });

    it('does not fire callback before the specified delay', () => {
      const scheduler = createScheduler();
      const cb = vi.fn();
      scheduler.after(5000, cb);
      vi.advanceTimersByTime(4999);
      expect(cb).not.toHaveBeenCalled();
    });

    it('after(0, cb) returns a handle but callback never fires', () => {
      const scheduler = createScheduler();
      const cb = vi.fn();
      const handle = scheduler.after(0, cb);
      vi.advanceTimersByTime(60_000);
      expect(cb).not.toHaveBeenCalled();
      expect(handle).toBeDefined();
    });

    it('after(-1, cb) returns a handle but callback never fires', () => {
      const scheduler = createScheduler();
      const cb = vi.fn();
      const handle = scheduler.after(-1, cb);
      vi.advanceTimersByTime(60_000);
      expect(cb).not.toHaveBeenCalled();
      expect(handle).toBeDefined();
    });

    it('multiple after() calls schedule independent timers', () => {
      const scheduler = createScheduler();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      scheduler.after(1000, cb1);
      scheduler.after(3000, cb2);

      vi.advanceTimersByTime(1000);
      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);
      expect(cb2).toHaveBeenCalledOnce();
    });

    it('callback receives no arguments', () => {
      const scheduler = createScheduler();
      let argCount = -1;
      scheduler.after(100, (...args) => {
        argCount = args.length;
      });
      vi.advanceTimersByTime(100);
      expect(argCount).toBe(0);
    });
  });

  describe('handle.cancel()', () => {
    it('prevents the callback from firing', () => {
      const scheduler = createScheduler();
      const cb = vi.fn();
      const handle = scheduler.after(1000, cb);
      handle.cancel();
      vi.advanceTimersByTime(2000);
      expect(cb).not.toHaveBeenCalled();
    });

    it('calling cancel() twice is a no-op (no throw)', () => {
      const scheduler = createScheduler();
      const handle = scheduler.after(1000, vi.fn());
      expect(() => {
        handle.cancel();
        handle.cancel();
      }).not.toThrow();
    });

    it('calling cancel() after callback has fired is a no-op (no throw)', () => {
      const scheduler = createScheduler();
      const handle = scheduler.after(1000, vi.fn());
      vi.advanceTimersByTime(1000);
      expect(() => handle.cancel()).not.toThrow();
    });

    it('cancelling one handle does not affect other scheduled callbacks', () => {
      const scheduler = createScheduler();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const handle1 = scheduler.after(1000, cb1);
      scheduler.after(1000, cb2);

      handle1.cancel();
      vi.advanceTimersByTime(1000);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledOnce();
    });
  });

  describe('cancelAll()', () => {
    it('prevents all pending callbacks from firing', () => {
      const scheduler = createScheduler();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      scheduler.after(500, cb1);
      scheduler.after(1000, cb2);

      scheduler.cancelAll();
      vi.advanceTimersByTime(2000);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });

    it('cancelAll() when no timers are pending is a no-op (no throw)', () => {
      const scheduler = createScheduler();
      expect(() => scheduler.cancelAll()).not.toThrow();
    });

    it('after cancelAll(), new after() calls still work', () => {
      const scheduler = createScheduler();
      scheduler.after(500, vi.fn());
      scheduler.cancelAll();

      const cb = vi.fn();
      scheduler.after(500, cb);
      vi.advanceTimersByTime(500);
      expect(cb).toHaveBeenCalledOnce();
    });

    it('cancelAll() does not affect callbacks that have already fired', () => {
      const scheduler = createScheduler();
      const cb = vi.fn();
      scheduler.after(100, cb);

      vi.advanceTimersByTime(100);
      expect(cb).toHaveBeenCalledOnce();

      scheduler.cancelAll();
      // cb was already called; cancelAll should not reset call count or throw
      expect(cb).toHaveBeenCalledOnce();
    });
  });
});

describe('useScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls cancelAll() when the effectScope is disposed', () => {
    const scope = effectScope();
    let scheduler: Scheduler | undefined;
    scope.run(() => {
      scheduler = useScheduler();
    });

    const cb = vi.fn();
    scheduler!.after(1000, cb);
    scope.stop(); // triggers onScopeDispose -> cancelAll
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('works outside any scope (no throw, no auto-cleanup)', () => {
    // Called outside effectScope — should not throw and should schedule normally
    let scheduler: Scheduler | undefined;
    expect(() => {
      scheduler = useScheduler();
    }).not.toThrow();

    const cb = vi.fn();
    scheduler!.after(100, cb);
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledOnce();
  });
});

describe('NOOP_HANDLE', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handle returned by after(0, cb) has a cancel() that is a no-op', () => {
    const scheduler = createScheduler();
    const handle = scheduler.after(0, vi.fn());
    expect(() => handle.cancel()).not.toThrow();
    // Calling twice is also safe
    expect(() => handle.cancel()).not.toThrow();
  });
});

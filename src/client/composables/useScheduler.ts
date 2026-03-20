import { onScopeDispose, getCurrentScope } from 'vue';

/** Opaque handle returned by scheduler.after(). */
export interface SchedulerHandle {
  /** Cancel this scheduled callback. No-op if already fired or cancelled. */
  cancel(): void;
}

/** Structured timer lifecycle: schedule delayed callbacks, cancel individually or all at once. */
export interface Scheduler {
  /**
   * Schedule a callback to run after delayMs milliseconds.
   * Returns a cancellable handle.
   * When delayMs <= 0, callback never fires (returns a no-op handle).
   */
  after(delayMs: number, callback: () => void): SchedulerHandle;
  /** Cancel all pending scheduled callbacks. Scheduler remains reusable after this call. */
  cancelAll(): void;
}

/** Shared no-op handle for delayMs <= 0 — avoids allocation per call. */
const NOOP_HANDLE: SchedulerHandle = Object.freeze({ cancel() {} });

/**
 * Creates a standalone scheduler instance with no Vue lifecycle coupling.
 * Use for module-level singletons (e.g., useToast auto-dismiss timer management).
 */
export function createScheduler(): Scheduler {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  return {
    after(delayMs, callback) {
      if (delayMs <= 0) return NOOP_HANDLE;

      let cancelled = false;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!cancelled) callback();
      }, delayMs);
      timers.add(timer);

      return {
        cancel() {
          if (!cancelled) {
            cancelled = true;
            clearTimeout(timer);
            timers.delete(timer);
          }
        },
      };
    },

    cancelAll() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

/**
 * Vue composable: creates a scheduler with automatic cancelAll() on scope dispose.
 * Use inside component setup() or composable functions for lifecycle-safe timer management.
 *
 * When called outside a Vue scope (e.g., in a plain function), behaves identically
 * to createScheduler() — no auto-cleanup, no error.
 */
export function useScheduler(): Scheduler {
  const scheduler = createScheduler();
  if (getCurrentScope()) {
    onScopeDispose(() => scheduler.cancelAll());
  }
  return scheduler;
}

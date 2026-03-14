import { ref } from 'vue';

export type ToastRole = 'status' | 'alert';

export interface Toast {
  id: number;
  /** Optional short heading displayed above the message. */
  title?: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  /** ARIA role: 'alert' for errors (assertive), 'status' for informational (polite). */
  role: ToastRole;
}

/** Default dismiss durations per toast type in milliseconds. */
const DISMISS_DURATION: Record<Toast['type'], number> = {
  success: 5000,
  info: 5000,
  warning: 6000,
  error: 8000,
};

let nextId = 0;

/** Shared reactive toast list — module-level singleton so any composable can add toasts. */
const toasts = ref<Toast[]>([]);

/** Tracks active auto-dismiss timers by toast id so they can be cancelled on manual dismiss. */
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Provides access to the global toast list and helpers to add/remove toasts.
 * All callers share the same reactive state, so toasts added from upload or SSE
 * are displayed by the single ToastContainer rendered in SpatialShell.
 */
export function useToast() {
  /**
   * Adds a toast notification. Auto-dismisses after durationMs (defaults by type).
   * @param message - Toast body text.
   * @param type - Visual variant: 'success' | 'info' | 'warning' | 'error'.
   * @param options - Optional title and durationMs override.
   */
  function addToast(
    message: string,
    type: Toast['type'] = 'info',
    options?: { title?: string; durationMs?: number } | number,
  ): void {
    const id = nextId++;
    const role: ToastRole = type === 'error' ? 'alert' : 'status';
    // Support legacy numeric third argument for backward compat
    const opts = typeof options === 'number' ? { durationMs: options } : (options ?? {});
    const duration = opts.durationMs ?? DISMISS_DURATION[type];
    const title = opts.title;

    toasts.value.push({ id, title, message, type, role });

    if (duration > 0) {
      timers.set(id, setTimeout(() => { removeToast(id); }, duration));
    }
  }

  /** Removes a toast by id and cancels its auto-dismiss timer if one is pending. */
  function removeToast(id: number): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return {
    toasts,
    addToast,
    removeToast,
  };
}

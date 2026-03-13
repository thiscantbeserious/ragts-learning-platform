import { ref } from 'vue';

export type ToastRole = 'status' | 'alert';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  /** ARIA role: 'alert' for errors (assertive), 'status' for informational (polite). */
  role: ToastRole;
}

/** Default dismiss durations per toast type in milliseconds. */
const DISMISS_DURATION: Record<Toast['type'], number> = {
  success: 5000,
  info: 5000,
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
   * @param type - Visual variant: 'success' | 'info' | 'error'.
   * @param durationMs - Override auto-dismiss time in ms. Pass 0 to disable auto-dismiss.
   */
  function addToast(
    message: string,
    type: Toast['type'] = 'info',
    durationMs?: number,
  ): void {
    const id = nextId++;
    const role: ToastRole = type === 'error' ? 'alert' : 'status';
    const duration = durationMs ?? DISMISS_DURATION[type];

    toasts.value.push({ id, message, type, role });

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

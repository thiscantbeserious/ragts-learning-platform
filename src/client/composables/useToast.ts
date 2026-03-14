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
  /** Optional icon class from design system (e.g., 'icon-file-check'). When set, renders a design system icon instead of the default SVG. */
  icon?: string;
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
 * Resets module-level singleton state between tests.
 * Only for use in test files — do not call in production code.
 */
export function resetToastState(): void {
  nextId = 0;
  toasts.value = [];
  timers.forEach(clearTimeout);
  timers.clear();
}

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
    options?: { title?: string; durationMs?: number; icon?: string } | number,
  ): void {
    const id = nextId++;
    const role: ToastRole = type === 'error' ? 'alert' : 'status';
    // Support legacy numeric third argument for backward compat
    const opts = typeof options === 'number' ? { durationMs: options } : (options ?? {});
    const duration = opts.durationMs ?? DISMISS_DURATION[type];
    const title = opts.title;
    const icon = typeof opts === 'object' ? opts.icon : undefined;

    toasts.value.push({ id, title, message, type, role, icon });

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

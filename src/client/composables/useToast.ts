import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  /** Optional heading displayed above the message. */
  title?: string;
}

let nextId = 0;

/** Composable for managing a reactive list of toast notifications with auto-dismiss. */
export function useToast() {
  const toasts = ref<Toast[]>([]);

  function addToast(message: string, type: Toast['type'] = 'info', title?: string, durationMs = 4000): void {
    const id = nextId++;
    toasts.value.push({ id, message, type, ...(title ? { title } : {}) });

    setTimeout(() => {
      removeToast(id);
    }, durationMs);
  }

  function removeToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return {
    toasts,
    addToast,
    removeToast,
  };
}

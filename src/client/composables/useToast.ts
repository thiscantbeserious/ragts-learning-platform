import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let nextId = 0;

export function useToast() {
  const toasts = ref<Toast[]>([]);

  function addToast(message: string, type: Toast['type'] = 'info', durationMs = 4000): void {
    const id = nextId++;
    toasts.value.push({ id, message, type });

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

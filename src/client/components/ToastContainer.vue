<script setup lang="ts">
import type { Toast } from '../composables/useToast';

defineProps<{
  toasts: Toast[];
}>();

const emit = defineEmits<{
  dismiss: [id: number];
}>();

/** Maps a toast type to its corresponding design system icon name. */
const typeIconMap: Record<Toast['type'], string> = {
  success: 'icon-check-circle',
  error: 'icon-error-circle',
  info: 'icon-info',
};
</script>

<template>
  <div class="toast-stack">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.type}`"
    >
      <div class="toast__icon">
        <span class="icon icon--md" :class="typeIconMap[toast.type]" />
      </div>
      <div class="toast__content">
        <div v-if="toast.title" class="toast__title">{{ toast.title }}</div>
        <div class="toast__message">{{ toast.message }}</div>
      </div>
      <button
        class="toast__close"
        aria-label="Dismiss notification"
        @click="emit('dismiss', toast.id)"
      >
        <span class="icon icon--sm icon-close" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* .toast-stack, .toast, .toast--success/error/info, .toast__icon, .toast__content,
   .toast__title, .toast__message, .toast__close come from design/styles/components.css */

@keyframes toast-in {
  from {
    transform: translateY(var(--space-2));
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.toast {
  animation: toast-in var(--duration-normal) var(--easing-default);
}
</style>

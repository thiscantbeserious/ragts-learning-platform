<script setup lang="ts">
import type { Toast } from '../composables/useToast';

defineProps<{
  toasts: Toast[];
}>();

const emit = defineEmits<{
  dismiss: [id: number];
}>();
</script>

<template>
  <div class="toast-container">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`toast--${toast.type}`"
    >
      <span class="toast__message">{{ toast.message }}</span>
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
/* .toast, .toast--success/error/info come from design/styles/components.css */

.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: var(--toast-max-width);
}

.toast--success {
  background: var(--status-success-subtle);
  border: 1px solid color-mix(in srgb, var(--status-success) 30%, transparent);
  color: var(--status-success);
}

.toast--error {
  background: var(--status-error-subtle);
  border: 1px solid color-mix(in srgb, var(--status-error) 30%, transparent);
  color: var(--status-error);
}

.toast--info {
  background: var(--status-info-subtle);
  border: 1px solid color-mix(in srgb, var(--status-info) 30%, transparent);
  color: var(--status-info);
}

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
  font-size: var(--text-sm);
}
</style>

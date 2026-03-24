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
      :role="toast.role"
      :aria-live="toast.role === 'alert' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      <div class="toast__icon" aria-hidden="true">
        <!-- Custom icon from design system -->
        <template v-if="toast.icon">
          <span class="icon icon--md" :class="toast.icon" aria-hidden="true" />
        </template>
        <!-- Default inline SVG icons -->
        <template v-else>
          <!-- success -->
          <svg
            v-if="toast.type === 'success'"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="10" cy="10" r="8" />
            <path d="M7 10l2 2 4-4" />
          </svg>
          <!-- warning -->
          <svg
            v-else-if="toast.type === 'warning'"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M10 2L1.5 17h17L10 2z" />
            <path d="M10 8v4M10 14v.5" />
          </svg>
          <!-- error -->
          <svg
            v-else-if="toast.type === 'error'"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="10" cy="10" r="8" />
            <path d="M7 7l6 6M13 7l-6 6" />
          </svg>
          <!-- info (default) -->
          <svg
            v-else
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="10" cy="10" r="8" />
            <path d="M10 9v5M10 6.5v.5" />
          </svg>
        </template>
      </div>
      <div class="toast__content">
        <div v-if="toast.title" class="toast__title">
          {{ toast.title }}
        </div>
        <div class="toast__message">
          {{ toast.message }}
        </div>
      </div>
      <button
        class="toast__close"
        aria-label="Dismiss notification"
        type="button"
        @click="emit('dismiss', toast.id)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* .toast and .toast__* come from design/styles/components.css */

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

/* Ensure the close button meets 44px touch target on mobile */
@media (max-width: 767px) {
  .toast__close {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>

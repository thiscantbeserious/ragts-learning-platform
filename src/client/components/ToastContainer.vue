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
      <button class="toast__dismiss" @click="emit('dismiss', toast.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 360px;
}

.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  animation: toast-in 0.2s ease-out;
}

.toast--success {
  background: rgba(50, 205, 50, 0.15);
  border: 1px solid rgba(50, 205, 50, 0.3);
  color: #32cd32;
}

.toast--error {
  background: rgba(255, 80, 80, 0.15);
  border: 1px solid rgba(255, 80, 80, 0.3);
  color: #ff5050;
}

.toast--info {
  background: rgba(74, 158, 255, 0.15);
  border: 1px solid rgba(74, 158, 255, 0.3);
  color: #4a9eff;
}

.toast__message {
  flex: 1;
}

.toast__dismiss {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0 0.25rem;
  opacity: 0.7;
  line-height: 1;
}

.toast__dismiss:hover {
  opacity: 1;
}

@keyframes toast-in {
  from {
    transform: translateY(0.5rem);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>

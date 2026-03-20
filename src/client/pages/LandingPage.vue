<script setup lang="ts">
import UploadZone from '../components/UploadZone.vue';
import SessionList from '../components/SessionList.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useUpload } from '../composables/useUpload';
import { useSessionList } from '../composables/useSessionList';
import { useToast } from '../composables/useToast';

const { sessions, loading, error: listError, fetchSessions, deleteSession } = useSessionList();
const { toasts, fireToast, removeToast } = useToast();

const {
  uploading,
  error: uploadError,
  isDragging,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleFileInput,
  clearError,
} = useUpload(() => {
  fetchSessions();
  fireToast('Session uploaded successfully', 'success');
});

async function onDelete(id: string): Promise<void> {
  const success = await deleteSession(id);
  if (success) {
    fireToast('Session deleted', 'info');
  } else {
    fireToast('Failed to delete session', 'error');
  }
}
</script>

<template>
  <div class="landing-page container">
    <main class="landing-page__content">
      <UploadZone
        :uploading="uploading"
        :error="uploadError"
        :is-dragging="isDragging"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @file-input="handleFileInput"
        @clear-error="clearError"
      />

      <section class="landing-page__sessions">
        <h2 class="section__title">
          Sessions
        </h2>
        <SessionList
          :sessions="sessions"
          :loading="loading"
          :error="listError"
          @delete="onDelete"
        />
      </section>
    </main>

    <ToastContainer
      :toasts="toasts"
      @dismiss="removeToast"
    />
  </div>
</template>

<style scoped>
.landing-page {
  padding: var(--space-8) var(--container-padding);
}

.landing-page__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}
</style>

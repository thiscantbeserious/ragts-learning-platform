<script setup lang="ts">
import UploadZone from '../components/UploadZone.vue';
import SessionList from '../components/SessionList.vue';
import ToastContainer from '../components/ToastContainer.vue';
import { useUpload } from '../composables/useUpload';
import { useSessionList } from '../composables/useSessionList';
import { useToast } from '../composables/useToast';

const { sessions, loading, error: listError, fetchSessions, deleteSession } = useSessionList();
const { toasts, addToast, removeToast } = useToast();

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
  addToast('Session uploaded successfully', 'success');
});

async function onDelete(id: string): Promise<void> {
  const success = await deleteSession(id);
  if (success) {
    addToast('Session deleted', 'info');
  } else {
    addToast('Failed to delete session', 'error');
  }
}
</script>

<template>
  <div class="landing-page">
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
        <h2>Sessions</h2>
        <SessionList
          :sessions="sessions"
          :loading="loading"
          :error="listError"
          @delete="onDelete"
        />
      </section>
    </main>

    <ToastContainer :toasts="toasts" @dismiss="removeToast" />
  </div>
</template>

<style scoped>
.landing-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.landing-page__content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.landing-page__sessions h2 {
  font-size: 1.1rem;
  color: #b0b0b0;
  margin-bottom: 0.75rem;
  font-weight: 500;
}
</style>

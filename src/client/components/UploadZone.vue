<script setup lang="ts">
const props = defineProps<{
  uploading: boolean;
  error: string | null;
  isDragging: boolean;
}>();

const emit = defineEmits<{
  drop: [event: DragEvent];
  dragover: [];
  dragleave: [];
  fileInput: [event: Event];
  clearError: [];
}>();

function onDragOver(e: DragEvent): void {
  e.preventDefault();
  emit('dragover');
}

function onDragLeave(): void {
  emit('dragleave');
}

function onDrop(e: DragEvent): void {
  e.preventDefault();
  emit('drop', e);
}

function onFileInput(e: Event): void {
  emit('fileInput', e);
}
</script>

<template>
  <div
    class="upload-zone"
    :class="{
      'upload-zone--drag-over': isDragging,
      'upload-zone--uploading': uploading,
    }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="upload-zone__content">
      <div
        v-if="uploading"
        class="upload-zone__spinner-text"
      >
        <span class="spinner" />
        Uploading...
      </div>
      <template v-else>
        <span class="icon icon--xl icon-upload upload-zone__icon" />
        <p class="upload-zone__title">
          Drag &amp; drop a <code>.cast</code> file here
        </p>
        <p class="upload-zone__subtitle">
          or
        </p>
        <label class="btn btn--primary upload-zone__browse">
          Browse files
          <input
            type="file"
            accept=".cast"
            class="upload-zone__input"
            @change="onFileInput"
          />
        </label>
      </template>
    </div>
    <div
      v-if="error"
      class="upload-zone__error-bar"
    >
      <span>{{ error }}</span>
      <button
        class="upload-zone__error-dismiss"
        @click="emit('clearError')"
      >
        <span class="icon icon--sm icon-close" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* .upload-zone base and state classes come from design/styles/components.css */

.upload-zone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.upload-zone__icon {
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}

.upload-zone__title code {
  color: var(--accent-primary);
  background: var(--accent-primary-subtle);
  padding: 0.1em 0.4em;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.upload-zone__input {
  display: none;
}

.upload-zone__spinner-text {
  color: var(--accent-primary);
  font-size: var(--text-base);
  padding: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.upload-zone__error-bar {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--status-error-subtle);
  border: 1px solid color-mix(in srgb, var(--status-error) 20%, transparent);
  border-radius: var(--radius-md);
  color: var(--status-error);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.upload-zone__error-dismiss {
  background: none;
  border: none;
  color: var(--status-error);
  cursor: pointer;
  padding: var(--space-1);
  line-height: 1;
  display: flex;
  align-items: center;
}
</style>

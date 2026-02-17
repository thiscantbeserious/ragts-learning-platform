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
    :class="{ 'upload-zone--dragging': isDragging, 'upload-zone--uploading': uploading }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="upload-zone__content">
      <div v-if="uploading" class="upload-zone__spinner">Uploading...</div>
      <template v-else>
        <div class="upload-zone__icon">&#8593;</div>
        <p class="upload-zone__text">
          Drag & drop a <code>.cast</code> file here
        </p>
        <p class="upload-zone__subtext">or</p>
        <label class="upload-zone__button">
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
    <div v-if="error" class="upload-zone__error">
      <span>{{ error }}</span>
      <button class="upload-zone__error-dismiss" @click="emit('clearError')">×</button>
    </div>
  </div>
</template>

<style scoped>
.upload-zone {
  border: 2px dashed #333;
  border-radius: 12px;
  padding: 2.5rem;
  text-align: center;
  transition: border-color 0.2s, background-color 0.2s;
  cursor: pointer;
}

.upload-zone--dragging {
  border-color: #4a9eff;
  background-color: rgba(74, 158, 255, 0.05);
}

.upload-zone--uploading {
  opacity: 0.7;
  pointer-events: none;
}

.upload-zone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.upload-zone__icon {
  font-size: 2rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.upload-zone__text {
  color: #b0b0b0;
  font-size: 1rem;
}

.upload-zone__text code {
  color: #4a9eff;
  background: rgba(74, 158, 255, 0.1);
  padding: 0.1em 0.4em;
  border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.upload-zone__subtext {
  color: #666;
  font-size: 0.85rem;
}

.upload-zone__button {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  background: #4a9eff;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s;
}

.upload-zone__button:hover {
  background: #3a8eef;
}

.upload-zone__input {
  display: none;
}

.upload-zone__spinner {
  color: #4a9eff;
  font-size: 1rem;
  padding: 1rem;
}

.upload-zone__error {
  margin-top: 1rem;
  padding: 0.6rem 1rem;
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 6px;
  color: #ff5050;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.upload-zone__error-dismiss {
  background: none;
  border: none;
  color: #ff5050;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0 0.25rem;
  line-height: 1;
}
</style>

import { ref } from 'vue';

export function useUpload(onSuccess?: () => void) {
  const uploading = ref(false);
  const error = ref<string | null>(null);
  const isDragging = ref(false);

  async function uploadFile(file: File): Promise<void> {
    error.value = null;

    if (!file.name.endsWith('.cast')) {
      error.value = 'Only .cast files are supported';
      return;
    }

    uploading.value = true;
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json() as { error?: string; details?: string };

      if (!res.ok) {
        error.value = data.error || `Upload failed (${res.status})`;
        if (data.details) {
          error.value += `: ${data.details}`;
        }
        return;
      }

      onSuccess?.();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Upload failed';
    } finally {
      uploading.value = false;
    }
  }

  function handleDrop(event: DragEvent): void {
    isDragging.value = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  }

  function handleDragOver(): void {
    isDragging.value = true;
  }

  function handleDragLeave(): void {
    isDragging.value = false;
  }

  function handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      uploadFile(input.files[0]);
      input.value = '';
    }
  }

  function clearError(): void {
    error.value = null;
  }

  return {
    uploading,
    error,
    isDragging,
    uploadFile,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInput,
    clearError,
  };
}

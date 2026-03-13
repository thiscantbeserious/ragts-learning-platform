import { ref } from 'vue';
import type { Session } from '../../shared/types/session.js';
import { useToast } from './useToast.js';

/** Shape of the upload response from POST /api/upload. */
export interface UploadResponse {
  id?: string;
  error?: string;
  details?: string;
}

/** Callbacks for optimistic upload flow. */
export interface OptimisticCallbacks {
  /** Called immediately when upload starts with a temporary session entry. */
  onOptimisticInsert: (tempSession: Session) => void;
  /** Called after upload completes (success or failure); removes the optimistic entry and refreshes. */
  onUploadComplete: (tempId: string) => Promise<void>;
}

export function useUpload(onSuccess?: () => void) {
  const uploading = ref(false);
  const error = ref<string | null>(null);
  const isDragging = ref(false);
  const { addToast } = useToast();

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

      const data = await res.json() as UploadResponse;

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

  /**
   * Uploads a file with optimistic UI: inserts a temporary session entry
   * immediately, then swaps it with real data (or removes on failure).
   * Uses the OptimisticCallbacks to manage sidebar state externally.
   */
  async function uploadFileWithOptimistic(
    file: File,
    callbacks: OptimisticCallbacks,
  ): Promise<void> {
    error.value = null;

    if (!file.name.endsWith('.cast')) {
      error.value = 'Only .cast files are supported';
      return;
    }

    const tempId = `uploading-${Date.now()}`;
    const tempSession: Session = {
      id: tempId,
      filename: file.name,
      filepath: '',
      size_bytes: file.size,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      detection_status: 'pending',
    };

    callbacks.onOptimisticInsert(tempSession);

    uploading.value = true;
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json() as UploadResponse;

      if (!res.ok) {
        const msg = data.error || `Upload failed (${res.status})`;
        error.value = data.details ? `${msg}: ${data.details}` : msg;
        await callbacks.onUploadComplete(tempId);
        addToast(`Upload failed: ${error.value}`, 'error');
        return;
      }

      await callbacks.onUploadComplete(tempId);
      addToast(`${file.name} uploaded — processing started`, 'success');
      onSuccess?.();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Upload failed';
      await callbacks.onUploadComplete(tempId);
      addToast(`Upload failed: ${error.value ?? 'Upload failed'}`, 'error');
    } finally {
      uploading.value = false;
    }
  }

  function handleDrop(event: DragEvent): void {
    isDragging.value = false;
    const files = event.dataTransfer?.files;
    const file = files?.[0];
    if (file !== undefined) {
      uploadFile(file);
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
    const file = input.files?.[0];
    if (file !== undefined) {
      uploadFile(file);
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
    uploadFileWithOptimistic,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInput,
    clearError,
  };
}

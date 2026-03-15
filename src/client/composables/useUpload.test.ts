import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUpload } from './useUpload';

function makeOkResponse(body: object): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: object): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('useUpload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('uploadFile', () => {
    it('sets uploading to false after successful upload', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: '1' }));
      const { uploading, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.cast'));
      expect(uploading.value).toBe(false);
    });

    it('clears error on start of upload', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({}));
      const { error, uploadFile } = useUpload();
      error.value = 'previous error';
      await uploadFile(new File(['data'], 'session.cast'));
      expect(error.value).toBeNull();
    });

    it('sets error for non-.cast file without calling fetch', async () => {
      const { error, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.mp4'));
      expect(error.value).toBe('Only .cast files are supported');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sets error on server error response without details', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(422, { error: 'Invalid file' }));
      const { error, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.cast'));
      expect(error.value).toBe('Invalid file');
    });

    it('sets error with details appended when server provides details', async () => {
      vi.mocked(fetch).mockResolvedValue(
        makeErrorResponse(422, { error: 'Invalid file', details: 'missing header' })
      );
      const { error, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.cast'));
      expect(error.value).toBe('Invalid file: missing header');
    });

    it('uses fallback error message when server error has no error field', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500, {}));
      const { error, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.cast'));
      expect(error.value).toBe('Upload failed (500)');
    });

    it('sets error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      const { error, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.cast'));
      expect(error.value).toBe('Network error');
    });

    it('sets generic error for non-Error network failure', async () => {
      vi.mocked(fetch).mockRejectedValue('unknown');
      const { error, uploadFile } = useUpload();
      await uploadFile(new File(['data'], 'session.cast'));
      expect(error.value).toBe('Upload failed');
    });

    it('calls onSuccess callback on successful upload', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({}));
      const onSuccess = vi.fn();
      const { uploadFile } = useUpload(onSuccess);
      await uploadFile(new File(['data'], 'session.cast'));
      expect(onSuccess).toHaveBeenCalledOnce();
    });

    it('does not throw when no onSuccess callback is provided', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({}));
      const { uploadFile } = useUpload();
      await expect(uploadFile(new File(['data'], 'session.cast'))).resolves.toBeUndefined();
    });
  });

  describe('handleDragOver', () => {
    it('sets isDragging to true', () => {
      const { handleDragOver, isDragging } = useUpload();
      expect(isDragging.value).toBe(false);
      handleDragOver();
      expect(isDragging.value).toBe(true);
    });
  });

  describe('handleDragLeave', () => {
    it('sets isDragging to false', () => {
      const { handleDragLeave, isDragging } = useUpload();
      isDragging.value = true;
      handleDragLeave();
      expect(isDragging.value).toBe(false);
    });
  });

  describe('clearError', () => {
    it('resets error to null', () => {
      const { error, clearError } = useUpload();
      error.value = 'some error';
      clearError();
      expect(error.value).toBeNull();
    });
  });

  describe('handleDrop', () => {
    it('sets isDragging to false and uploads file when dataTransfer has a file', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: '1' }));
      const { handleDrop, isDragging } = useUpload();
      isDragging.value = true;
      const file = new File(['data'], 'session.cast');
      const event = { dataTransfer: { files: [file] } } as unknown as DragEvent;
      handleDrop(event);
      expect(isDragging.value).toBe(false);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('sets isDragging to false and does not fetch when dataTransfer is null', async () => {
      const { handleDrop, isDragging } = useUpload();
      isDragging.value = true;
      const event = { dataTransfer: null } as unknown as DragEvent;
      handleDrop(event);
      expect(isDragging.value).toBe(false);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('handleFileInput', () => {
    it('uploads file when input has a selected file', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: '1' }));
      const { handleFileInput } = useUpload();
      const file = new File(['data'], 'session.cast');
      const input = { files: [file] } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      handleFileInput(event);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('does not fetch when input has no files', async () => {
      const { handleFileInput } = useUpload();
      const input = { files: null } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;
      handleFileInput(event);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('uploadFileWithOptimistic', () => {
    it('calls onOptimisticInsert immediately before upload completes', async () => {
      let fetchCalled = false;
      vi.mocked(fetch).mockImplementation(() => {
        fetchCalled = true;
        return Promise.resolve(makeOkResponse({ id: 'server-1' }));
      });

      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      expect(onOptimisticInsert).toHaveBeenCalledOnce();
      expect(fetchCalled).toBe(true);
    });

    it('inserts optimistic entry with correct filename and uploading-prefixed id', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: 'server-1' }));
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'my-session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      const inserted = onOptimisticInsert.mock.calls[0]?.[0];
      expect(inserted).toBeDefined();
      expect(inserted.filename).toBe('my-session.cast');
      expect(inserted.id).toMatch(/^uploading-\d+-\d+$/);
    });

    it('calls onUploadComplete with the temp id on success', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: 'server-1' }));
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      const inserted = onOptimisticInsert.mock.calls[0]?.[0];
      expect(onUploadComplete).toHaveBeenCalledWith(inserted.id);
    });

    it('calls onUploadComplete even when upload fails (to clean up optimistic entry)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500, { error: 'Server error' }));
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      expect(onUploadComplete).toHaveBeenCalledOnce();
    });

    it('sets error message on upload failure', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(422, { error: 'Bad file' }));
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { error, uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      expect(error.value).toBe('Bad file');
    });

    it('sets error for non-.cast file without calling fetch or inserting optimistic entry', async () => {
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn();
      const { error, uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'video.mp4'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      expect(error.value).toBe('Only .cast files are supported');
      expect(onOptimisticInsert).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('calls onUploadComplete on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      expect(onUploadComplete).toHaveBeenCalledOnce();
    });

    it('sets uploading to false after completion', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: 'server-1' }));
      const onOptimisticInsert = vi.fn();
      const onUploadComplete = vi.fn().mockResolvedValue(undefined);
      const { uploading, uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadComplete,
      });

      expect(uploading.value).toBe(false);
    });
  });
});

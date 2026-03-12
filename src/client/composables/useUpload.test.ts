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

function makeDragEvent(files?: File[]): DragEvent {
  return {
    dataTransfer: files !== undefined ? { files } : undefined,
  } as unknown as DragEvent;
}

function makeInputEvent(file?: File): Event {
  const input = {
    files: file !== undefined ? [file] : null,
    value: 'some-path',
  };
  return { target: input } as unknown as Event;
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

  describe('handleDrop', () => {
    it('calls uploadFile for the first file in dataTransfer', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({}));
      const { handleDrop, isDragging } = useUpload();
      isDragging.value = true;
      const file = new File(['data'], 'session.cast');
      handleDrop(makeDragEvent([file]));
      expect(isDragging.value).toBe(false);
      // Allow async uploadFile to complete
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    });

    it('sets isDragging to false when dataTransfer is undefined', () => {
      const { handleDrop, isDragging } = useUpload();
      isDragging.value = true;
      handleDrop(makeDragEvent(undefined));
      expect(isDragging.value).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('does not call uploadFile when dataTransfer files is empty', () => {
      const { handleDrop } = useUpload();
      handleDrop(makeDragEvent([]));
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('handleFileInput', () => {
    it('calls uploadFile and clears input value when file is selected', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({}));
      const { handleFileInput } = useUpload();
      const file = new File(['data'], 'session.cast');
      const event = makeInputEvent(file);
      handleFileInput(event);
      const input = event.target as HTMLInputElement;
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      expect(input.value).toBe('');
    });

    it('does not call uploadFile when no file is selected', () => {
      const { handleFileInput } = useUpload();
      handleFileInput(makeInputEvent(undefined));
      expect(fetch).not.toHaveBeenCalled();
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

  describe('uploadFileWithOptimistic', () => {
    it('calls onOptimisticInsert immediately before upload completes', async () => {
      let fetchCalled = false;
      vi.mocked(fetch).mockImplementation(() => {
        fetchCalled = true;
        return Promise.resolve(makeOkResponse({ id: 'server-1' }));
      });

      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      expect(onOptimisticInsert).toHaveBeenCalledOnce();
      expect(fetchCalled).toBe(true);
    });

    it('inserts optimistic entry with correct filename and uploading-prefixed id', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: 'server-1' }));
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'my-session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      const inserted = onOptimisticInsert.mock.calls[0]?.[0];
      expect(inserted).toBeDefined();
      expect(inserted.filename).toBe('my-session.cast');
      expect(inserted.id).toMatch(/^uploading-\d+$/);
    });

    it('calls onUploadSuccess with the temp id on success', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: 'server-1' }));
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      const inserted = onOptimisticInsert.mock.calls[0]?.[0];
      expect(onUploadSuccess).toHaveBeenCalledWith(inserted.id);
    });

    it('calls onUploadSuccess even when upload fails (to clean up optimistic entry)', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500, { error: 'Server error' }));
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      expect(onUploadSuccess).toHaveBeenCalledOnce();
    });

    it('sets error message on upload failure', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(422, { error: 'Bad file' }));
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { error, uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      expect(error.value).toBe('Bad file');
    });

    it('sets error for non-.cast file without calling fetch or inserting optimistic entry', async () => {
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn();
      const { error, uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'video.mp4'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      expect(error.value).toBe('Only .cast files are supported');
      expect(onOptimisticInsert).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('calls onUploadSuccess on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      expect(onUploadSuccess).toHaveBeenCalledOnce();
    });

    it('sets uploading to false after completion', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse({ id: 'server-1' }));
      const onOptimisticInsert = vi.fn();
      const onUploadSuccess = vi.fn().mockResolvedValue(undefined);
      const { uploading, uploadFileWithOptimistic } = useUpload();

      await uploadFileWithOptimistic(new File(['data'], 'session.cast'), {
        onOptimisticInsert,
        onUploadSuccess,
      });

      expect(uploading.value).toBe(false);
    });
  });
});

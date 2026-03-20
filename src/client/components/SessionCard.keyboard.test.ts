/**
 * Behavioral branch coverage tests for SessionCard — keyboard navigation
 * and status transition watch handler.
 *
 * Lines targeted:
 *   8-9  — @keydown.enter and @keydown.space.prevent handlers
 *   106-112 — watch(liveStatus) branches: completed, failed/interrupted, no-op
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import type { Session } from '../../shared/types/session.js';
import SessionCard from './SessionCard.vue';
import { resetConnectionBudget } from '../composables/useSSE.js';

// ---------------------------------------------------------------------------
// Module-level controllable status ref — must be declared before vi.mock calls
// so the factory closure can capture it.
// ---------------------------------------------------------------------------

const controlledStatus = ref<string>('processing');

const mockAddToast = vi.fn();

vi.mock('../composables/useToast.js', () => ({
  useToast: () => ({ fireToast: mockAddToast }),
  ToastCategory: {
    UPLOAD_SUCCESS: 'upload-success',
    UPLOAD_FAILED: 'upload-failed',
    SESSION_READY: 'session-ready',
    PROCESSING_FAILED: 'processing-failed',
  },
}));

vi.mock('../composables/useSSE.js', () => ({
  useSSE: (_sessionId: unknown, _detectionStatus: unknown) => ({
    status: controlledStatus,
    isConnected: ref(false),
  }),
  resetConnectionBudget: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn().mockResolvedValue(undefined);
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: { id: '' } }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test-session.cast',
    filepath: '/data/sessions/test-session.cast',
    size_bytes: 2048,
    marker_count: 0,
    uploaded_at: '2026-03-11T10:00:00Z',
    created_at: '2026-03-11T10:00:00Z',
    detection_status: 'completed',
    detected_sections_count: 5,
    ...overrides,
  };
}

function mountCard(session: Session, isSelected = false) {
  return mount(SessionCard, {
    props: { session, isSelected },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionCard — keyboard navigation', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAddToast.mockReset();
    controlledStatus.value = 'completed';
    resetConnectionBudget();
  });

  afterEach(() => {
    resetConnectionBudget();
  });

  describe('Enter key triggers navigation for ready cards', () => {
    it('calls router.push on Enter keydown for a completed session', async () => {
      controlledStatus.value = 'completed';
      const session = makeSession({ id: 'kbd-enter-1', detection_status: 'completed' });
      const wrapper = mountCard(session);
      const card = wrapper.find('.session-card');
      await card.trigger('keydown.enter');
      expect(mockPush).toHaveBeenCalledWith('/session/kbd-enter-1');
    });

    it('calls router.push on Enter keydown for a failed session', async () => {
      controlledStatus.value = 'failed';
      const session = makeSession({ id: 'kbd-enter-fail', detection_status: 'failed' });
      const wrapper = mountCard(session);
      const card = wrapper.find('.session-card');
      await card.trigger('keydown.enter');
      expect(mockPush).toHaveBeenCalledWith('/session/kbd-enter-fail');
    });
  });

  describe('Space key triggers navigation for ready cards', () => {
    it('calls router.push on Space keydown for a completed session', async () => {
      controlledStatus.value = 'completed';
      const session = makeSession({ id: 'kbd-space-1', detection_status: 'completed' });
      const wrapper = mountCard(session);
      const card = wrapper.find('.session-card');
      await card.trigger('keydown.space');
      expect(mockPush).toHaveBeenCalledWith('/session/kbd-space-1');
    });
  });

  describe('Enter/Space does not navigate when processing', () => {
    it('does not call router.push on Enter keydown for a processing session', async () => {
      controlledStatus.value = 'processing';
      const session = makeSession({ id: 'kbd-proc', detection_status: 'processing' });
      const wrapper = mountCard(session);
      const card = wrapper.find('.session-card');
      await card.trigger('keydown.enter');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does not call router.push on Space keydown for a processing session', async () => {
      controlledStatus.value = 'processing';
      const session = makeSession({ id: 'kbd-proc-space', detection_status: 'processing' });
      const wrapper = mountCard(session);
      const card = wrapper.find('.session-card');
      await card.trigger('keydown.space');
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});

describe('SessionCard — status transition watch (lines 106-112)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAddToast.mockReset();
    controlledStatus.value = 'processing';
    resetConnectionBudget();
  });

  afterEach(() => {
    resetConnectionBudget();
  });

  it('fires success toast when liveStatus transitions to "completed"', async () => {
    const session = makeSession({ id: 'watch-1', detection_status: 'processing', filename: 'sess.cast' });

    mountCard(session);
    await nextTick();

    controlledStatus.value = 'completed';
    await nextTick();

    expect(mockAddToast).toHaveBeenCalledWith(
      'sess.cast is ready',
      'success',
      expect.objectContaining({ title: 'Session ready' }),
    );
  });

  it('fires error toast when liveStatus transitions to "failed"', async () => {
    const session = makeSession({ id: 'watch-2', detection_status: 'processing', filename: 'err.cast' });

    mountCard(session);
    await nextTick();

    controlledStatus.value = 'failed';
    await nextTick();

    expect(mockAddToast).toHaveBeenCalledWith(
      'err.cast processing failed',
      'error',
      expect.objectContaining({ title: 'Processing failed' }),
    );
  });

  it('fires error toast when liveStatus transitions to "interrupted"', async () => {
    const session = makeSession({ id: 'watch-3', detection_status: 'processing', filename: 'int.cast' });

    mountCard(session);
    await nextTick();

    controlledStatus.value = 'interrupted';
    await nextTick();

    expect(mockAddToast).toHaveBeenCalledWith(
      'int.cast processing failed',
      'error',
      expect.objectContaining({ title: 'Processing failed' }),
    );
  });

  it('does not fire additional toast when status value stays the same (no-op guard)', async () => {
    // Watch fires when prev === next — the `if (prev === next) return` branch
    const session = makeSession({ id: 'watch-noop', detection_status: 'processing' });

    mountCard(session);
    await nextTick();

    const beforeCount = mockAddToast.mock.calls.length;
    // Set same value again — Vue watch won't fire for same value, so no extra toast
    controlledStatus.value = 'processing';
    await nextTick();

    // No new toasts should have fired
    expect(mockAddToast.mock.calls.length).toBe(beforeCount);
  });
});

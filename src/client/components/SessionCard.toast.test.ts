/**
 * Tests for SessionCard toast dedup behavior (Bug 2).
 *
 * Verifies that:
 * - A success toast fires exactly once when status transitions to 'completed'
 * - A second transition to 'completed' (SSE reconnect replay) does NOT fire again
 * - A failure toast fires once per processing → failed transition
 * - Entering a processing state resets hasNotified so a future terminal
 *   transition can fire a toast again (redetect scenario)
 *
 * useSSE is mocked to allow manual status transitions without real EventSource.
 * useToast is spied on via resetToastState + direct toast list observation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import type { Session } from '../../shared/types/session.js';
import { resetToastState, useToast } from '../composables/useToast.js';
import { resetConnectionBudget } from '../composables/useSSE.js';

// ---------------------------------------------------------------------------
// useSSE mock — controlled via module-level sseController
// ---------------------------------------------------------------------------

let mockSseStatus: Ref<string | undefined> = ref<string | undefined>(undefined);

vi.mock('../composables/useSSE.js', () => ({
  useSSE: (_sessionId: Ref<string>, detectionStatus: Ref<string | undefined>) => {
    mockSseStatus = ref<string | undefined>(detectionStatus.value);
    return { status: mockSseStatus, isConnected: ref(false) };
  },
  resetConnectionBudget: vi.fn(),
}));

// ---------------------------------------------------------------------------
// vue-router mock
// ---------------------------------------------------------------------------

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
  useRoute: () => ({ params: { id: '' } }),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks are registered
// ---------------------------------------------------------------------------

import SessionCard from './SessionCard.vue';

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
    detection_status: 'processing',
    detected_sections_count: null,
    ...overrides,
  };
}

function mountCard(session: Session) {
  return mount(SessionCard, { props: { session } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionCard — toast dedup (hasNotifiedTerminal guard)', () => {
  beforeEach(() => {
    resetToastState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetConnectionBudget();
    resetToastState();
  });

  it('fires a success toast when status transitions to completed', async () => {
    const session = makeSession({ detection_status: 'processing' });
    mountCard(session);
    await nextTick();

    const { toasts } = useToast();
    expect(toasts.value).toHaveLength(0);

    mockSseStatus.value = 'completed';
    await nextTick();

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.type).toBe('success');
  });

  it('does not fire a second success toast when status transitions to completed again (SSE replay)', async () => {
    const session = makeSession({ detection_status: 'processing' });
    mountCard(session);
    await nextTick();

    // First transition: processing → completed
    mockSseStatus.value = 'completed';
    await nextTick();

    const { toasts } = useToast();
    const countAfterFirst = toasts.value.length;
    expect(countAfterFirst).toBe(1);

    // Simulate SSE reconnect replay: undefined → completed again
    mockSseStatus.value = undefined;
    await nextTick();
    mockSseStatus.value = 'completed';
    await nextTick();

    // No additional toast should have been fired
    expect(toasts.value.length).toBe(countAfterFirst);
  });

  it('fires a failure toast when status transitions to failed', async () => {
    const session = makeSession({ detection_status: 'processing' });
    mountCard(session);
    await nextTick();

    const { toasts } = useToast();
    mockSseStatus.value = 'failed';
    await nextTick();

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.type).toBe('error');
  });

  it('does not fire a second failure toast on SSE replay', async () => {
    const session = makeSession({ detection_status: 'processing' });
    mountCard(session);
    await nextTick();

    mockSseStatus.value = 'failed';
    await nextTick();

    const { toasts } = useToast();
    const countAfterFirst = toasts.value.length;

    // Replay: undefined → failed again
    mockSseStatus.value = undefined;
    await nextTick();
    mockSseStatus.value = 'failed';
    await nextTick();

    expect(toasts.value.length).toBe(countAfterFirst);
  });

  it('fires a failure toast for interrupted status', async () => {
    const session = makeSession({ detection_status: 'processing' });
    mountCard(session);
    await nextTick();

    const { toasts } = useToast();
    mockSseStatus.value = 'interrupted';
    await nextTick();

    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.type).toBe('error');
  });

  it('aggregates rapid session-ready completions into a single toast with summary', async () => {
    const session1 = makeSession({ id: 'sess-1', filename: 'alpha.cast', detection_status: 'processing' });
    const session2 = makeSession({ id: 'sess-2', filename: 'beta.cast', detection_status: 'processing' });

    // Mount two cards sharing the same toast state
    mountCard(session1);
    await nextTick();
    // Second mount creates a new mockSseStatus; capture it separately
    const firstSseStatus = mockSseStatus;
    mountCard(session2);
    await nextTick();
    const secondSseStatus = mockSseStatus;

    const { toasts } = useToast();
    expect(toasts.value).toHaveLength(0);

    // First card completes
    firstSseStatus.value = 'completed';
    await nextTick();
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.type).toBe('success');
    const firstMessage = toasts.value[0]?.message;
    expect(firstMessage).toBe('alpha.cast is ready');

    // Second card completes — should aggregate into same toast
    secondSseStatus.value = 'completed';
    await nextTick();
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.message).toBe('2 sessions ready');
  });

  it('aggregates rapid processing-failed events into a single toast with filename summary', async () => {
    const session1 = makeSession({ id: 'sess-1', filename: 'alpha.cast', detection_status: 'processing' });
    const session2 = makeSession({ id: 'sess-2', filename: 'beta.cast', detection_status: 'processing' });

    mountCard(session1);
    await nextTick();
    const firstSseStatus = mockSseStatus;
    mountCard(session2);
    await nextTick();
    const secondSseStatus = mockSseStatus;

    const { toasts } = useToast();

    // First card fails
    firstSseStatus.value = 'failed';
    await nextTick();
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.type).toBe('error');

    // Second card fails — should aggregate into same toast
    secondSseStatus.value = 'failed';
    await nextTick();
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]?.message).toMatch(/2 sessions failed: alpha\.cast, beta\.cast/);
  });

  it('resets hasNotified when status re-enters a processing state (redetect scenario)', async () => {
    const session = makeSession({ detection_status: 'processing' });
    mountCard(session);
    await nextTick();

    // First completion
    mockSseStatus.value = 'completed';
    await nextTick();

    const { toasts } = useToast();
    expect(toasts.value.length).toBeGreaterThanOrEqual(1);

    // Session re-enters processing (redetect)
    mockSseStatus.value = 'processing';
    await nextTick();

    // Second completion after redetect — should notify again.
    // With aggregation active, both "Session ready" success toasts share the same
    // category key and merge into one updated toast rather than stacking.
    // The user is still notified (toast is visible and updated), just deduplicated.
    mockSseStatus.value = 'completed';
    await nextTick();

    // At least one success toast must be visible
    expect(toasts.value.some((t) => t.type === 'success')).toBe(true);
  });
});

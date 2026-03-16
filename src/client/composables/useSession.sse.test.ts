/**
 * Tests for useSession SSE integration (Bug 4).
 *
 * Verifies that when the SSE status transitions to a terminal state (completed/failed),
 * useSession re-fetches the session data so the detail view auto-refreshes without
 * requiring a manual page reload.
 *
 * useSSE is mocked to allow manual status control. fetch is stubbed per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { Ref } from 'vue';
import type { SessionDetailResponse } from '../../shared/types/index.js';

// ---------------------------------------------------------------------------
// useSSE mock — module-level controller for driving status
// ---------------------------------------------------------------------------

let mockSseStatus: Ref<string | undefined> = ref<string | undefined>(undefined);

vi.mock('./useSSE.js', () => ({
  useSSE: (_sessionId: Ref<string>, detectionStatus: Ref<string | undefined>) => {
    mockSseStatus = ref<string | undefined>(detectionStatus.value);
    return { status: mockSseStatus, isConnected: ref(false) };
  },
  resetConnectionBudget: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

// eslint-disable-next-line import/first
import { useSession } from './useSession.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeSessionResponse(overrides: Partial<SessionDetailResponse> = {}): SessionDetailResponse {
  return {
    id: 'sess-1',
    filename: 'session.cast',
    content: { header: { version: 2, width: 80, height: 24, timestamp: 0, title: '' }, markers: [] },
    snapshot: null,
    sections: [],
    detection_status: 'completed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSession — SSE auto-refresh integration (Bug 4)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockSseStatus.value = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('re-fetches session when SSE status transitions to completed', async () => {
    const initialResponse = makeSessionResponse({ detection_status: 'processing', sections: [] });
    const refreshedResponse = makeSessionResponse({ detection_status: 'completed', sections: [
      { id: 'sec-1', type: 'detected', label: 'Section 1', startEvent: 0, endEvent: 5, startLine: null, endLine: null, snapshot: null },
    ]});

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(initialResponse))
      .mockResolvedValueOnce(makeOkResponse(refreshedResponse));

    const idRef = ref('sess-1');
    const { sections, detectionStatus } = useSession(idRef);

    // Wait for initial fetch to complete
    await nextTick();
    await nextTick();

    expect(fetch).toHaveBeenCalledTimes(1);

    // SSE reports completion
    mockSseStatus.value = 'completed';
    await nextTick();
    await nextTick();

    // Should have re-fetched
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sections.value).toHaveLength(1);
    expect(detectionStatus.value).toBe('completed');
  });

  it('re-fetches session when SSE status transitions to failed', async () => {
    const initialResponse = makeSessionResponse({ detection_status: 'processing', sections: [] });
    const failedResponse = makeSessionResponse({ detection_status: 'failed', sections: [] });

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(initialResponse))
      .mockResolvedValueOnce(makeOkResponse(failedResponse));

    const idRef = ref('sess-1');
    const { detectionStatus } = useSession(idRef);

    await nextTick();
    await nextTick();

    expect(fetch).toHaveBeenCalledTimes(1);

    mockSseStatus.value = 'failed';
    await nextTick();
    await nextTick();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(detectionStatus.value).toBe('failed');
  });

  it('does not re-fetch when SSE transitions to an intermediate processing state', async () => {
    const initialResponse = makeSessionResponse({ detection_status: 'processing', sections: [] });

    vi.mocked(fetch).mockResolvedValueOnce(makeOkResponse(initialResponse));

    const idRef = ref('sess-1');
    useSession(idRef);

    await nextTick();
    await nextTick();

    expect(fetch).toHaveBeenCalledTimes(1);

    // SSE transitions through intermediate states — no re-fetch expected
    mockSseStatus.value = 'detecting';
    await nextTick();
    mockSseStatus.value = 'replaying';
    await nextTick();
    mockSseStatus.value = 'storing';
    await nextTick();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

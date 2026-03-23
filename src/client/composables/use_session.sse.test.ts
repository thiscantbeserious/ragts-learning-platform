/**
 * Tests for use_session composable — SSE auto-refresh and session ID change.
 *
 * Covers: re-fetch on SSE terminal state transition, no re-fetch for intermediate
 * states, re-fetch when session ID ref changes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { Ref } from 'vue';
import type { SessionMetadataResponse } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// useSSE mock — module-level ref replaced per test to avoid watcher accumulation
// ---------------------------------------------------------------------------

let mockSseStatus: Ref<string | undefined> = ref<string | undefined>(undefined);

vi.mock('./useSSE.js', () => ({
  useSSE: () => ({ status: mockSseStatus, isConnected: ref(false) }),
  resetConnectionBudget: vi.fn(),
}));

import { useSessionV2 } from './use_session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flush(count = 10): Promise<void> {
  for (let i = 0; i < count; i++) await nextTick();
}

/** Makes a meta response with sectionCount above threshold (no bulk fetch). */
function makeMetaResponse(
  overrides: Partial<SessionMetadataResponse> = {}
): SessionMetadataResponse {
  return {
    id: 'sess-1',
    filename: 'session.cast',
    content: {
      header: { version: 2, width: 80, height: 24, timestamp: 0, title: '' },
      markers: [],
    },
    sections: [],
    detection_status: 'completed',
    totalLines: 0,
    sectionCount: 6,
    ...overrides,
  };
}

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionV2 — SSE auto-refresh', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Fresh ref per test prevents watcher accumulation across tests
    mockSseStatus = ref(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('re-fetches when SSE transitions to completed', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ detection_status: 'processing' }))
    );

    const { detectionStatus } = useSessionV2(ref('sess-1'));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ detection_status: 'completed' }))
    );
    mockSseStatus.value = 'completed';
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(detectionStatus.value).toBe('completed');
  });

  it('re-fetches when SSE transitions to failed', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ detection_status: 'processing' }))
    );

    useSessionV2(ref('sess-1'));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ detection_status: 'failed' }))
    );
    mockSseStatus.value = 'failed';
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch when SSE transitions to an intermediate state', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ detection_status: 'processing' }))
    );

    useSessionV2(ref('sess-1'));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    mockSseStatus.value = 'detecting';
    await flush();
    mockSseStatus.value = 'replaying';
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch when SSE transitions to undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(makeMetaResponse()));

    useSessionV2(ref('sess-1'));
    await flush();
    const callCount = vi.mocked(fetch).mock.calls.length;

    mockSseStatus.value = undefined;
    await flush();

    expect(vi.mocked(fetch).mock.calls.length).toBe(callCount);
  });
});

describe('useSessionV2 — session ID change', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockSseStatus = ref(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('re-fetches when the session ID ref changes', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(makeMetaResponse()));
    const idRef = ref('sess-1');
    useSessionV2(idRef);

    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    idRef.value = 'sess-2';
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondUrl = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain('sess-2');
  });
});

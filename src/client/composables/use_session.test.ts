/**
 * Tests for use_session composable — initial state, metadata fetch, error states.
 *
 * Covers: initial reactive state, successful metadata fetch (filename, sections,
 * detection_status), 404/non-ok/network errors, fallback error message.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { Ref } from 'vue';
import type { SessionMetadataResponse } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// useSSE mock
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

export function makeMetaResponse(
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
    // Default above SMALL_SESSION_THRESHOLD to avoid bulk fetch in metadata tests
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

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// initial state
// ---------------------------------------------------------------------------

describe('useSessionV2 — initial state', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockSseStatus = ref(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('starts with loading true', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
    const { loading } = useSessionV2(ref('sess-1'));
    expect(loading.value).toBe(true);
  });

  it('starts with empty sections', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
    const { sections } = useSessionV2(ref('sess-1'));
    expect(sections.value).toEqual([]);
  });

  it('starts with null error', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
    const { error } = useSessionV2(ref('sess-1'));
    expect(error.value).toBeNull();
  });

  it('starts with empty filename', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
    const { filename } = useSessionV2(ref('sess-1'));
    expect(filename.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// metadata fetch
// ---------------------------------------------------------------------------

describe('useSessionV2 — metadata fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockSseStatus = ref(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sets loading to false after fetch completes', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(makeMetaResponse()));
    const { loading } = useSessionV2(ref('sess-1'));
    await flush();
    expect(loading.value).toBe(false);
  });

  it('populates filename from the response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ filename: 'my-session.cast' }))
    );
    const { filename } = useSessionV2(ref('sess-1'));
    await flush();
    expect(filename.value).toBe('my-session.cast');
  });

  it('populates detection_status from the response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ detection_status: 'completed' }))
    );
    const { detectionStatus } = useSessionV2(ref('sess-1'));
    await flush();
    expect(detectionStatus.value).toBe('completed');
  });

  it('populates sections from metadata response', async () => {
    const section = {
      id: 'sec-1', type: 'detected' as const, label: 'Section sec-1',
      startEvent: 0, endEvent: 10, startLine: 0, endLine: 9,
      lineCount: 10, preview: null,
    };
    vi.mocked(fetch).mockResolvedValue(
      makeOkResponse(makeMetaResponse({ sections: [section], sectionCount: 6 }))
    );
    const { sections } = useSessionV2(ref('sess-1'));
    await flush();
    expect(sections.value).toHaveLength(1);
    expect(sections.value[0]?.id).toBe('sec-1');
  });

  it('sets error on 404 response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404));
    const { error, loading } = useSessionV2(ref('sess-1'));
    await flush();
    expect(error.value).toBe('Session not found');
    expect(loading.value).toBe(false);
  });

  it('sets error on non-ok non-404 response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500));
    const { error } = useSessionV2(ref('sess-1'));
    await flush();
    expect(error.value).toContain('500');
  });

  it('sets error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
    const { error } = useSessionV2(ref('sess-1'));
    await flush();
    expect(error.value).toBe('Network error');
  });

  it('sets fallback error when thrown value is not an Error', async () => {
    vi.mocked(fetch).mockRejectedValue('string error');
    const { error } = useSessionV2(ref('sess-1'));
    await flush();
    expect(error.value).toBe('Failed to load session');
  });
});

/**
 * Tests for useSessionV2 — 0-section session snapshot fetching.
 *
 * When a session has sectionCount === 0, the composable should fetch the
 * session-level snapshot via GET /api/sessions/:id/snapshot and expose it
 * via the returned `snapshot` ref.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { SessionMetadataResponse, SessionSnapshotResponse } from '../../shared/types/api.js';
import type { TerminalSnapshot } from '#vt-wasm/types';

// ---------------------------------------------------------------------------
// useSSE mock
// ---------------------------------------------------------------------------

vi.mock('./useSSE.js', () => ({
  useSSE: () => ({ status: ref(undefined), isConnected: ref(false) }),
  resetConnectionBudget: vi.fn(),
}));

import { useSessionV2 } from './use_session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flush(count = 10): Promise<void> {
  for (let i = 0; i < count; i++) await nextTick();
}

function makeMetaResponse(
  overrides: Partial<SessionMetadataResponse> = {},
): SessionMetadataResponse {
  return {
    id: 'sess-zero',
    filename: 'zero-sections.cast',
    content: {
      header: { version: 2, width: 80, height: 24, timestamp: 0, title: '' },
      markers: [],
    },
    sections: [],
    detection_status: 'completed',
    totalLines: 0,
    sectionCount: 0,
    ...overrides,
  };
}

function makeSnapshotResponse(snapshot: TerminalSnapshot | null): SessionSnapshotResponse {
  return { id: 'sess-zero', snapshot };
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

function makeTerminalSnapshot(lineCount = 3): TerminalSnapshot {
  return {
    cols: 80,
    rows: 24,
    lines: Array.from({ length: lineCount }, (_, i) => ({
      spans: [{ text: `line ${i + 1}` }],
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionV2 — 0-section snapshot fetching', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('starts with null snapshot', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
    const { snapshot } = useSessionV2(ref('sess-zero'));
    expect(snapshot.value).toBeNull();
  });

  it('fetches snapshot endpoint when sectionCount is 0', async () => {
    const terminalSnapshot = makeTerminalSnapshot(5);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeMetaResponse({ sectionCount: 0 })))
      .mockResolvedValueOnce(makeOkResponse(makeSnapshotResponse(terminalSnapshot)));

    const { snapshot } = useSessionV2(ref('sess-zero'));
    await flush();

    expect(fetch).toHaveBeenCalledWith('/api/sessions/sess-zero/snapshot');
    expect(snapshot.value).toEqual(terminalSnapshot);
  });

  it('does NOT fetch snapshot endpoint when sectionCount > 0', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeMetaResponse({ sectionCount: 3, sections: [] })))
      .mockResolvedValueOnce(makeOkResponse({ sections: {} })); // bulk content fetch

    await flush();

    const calls = vi.mocked(fetch).mock.calls;
    const snapshotCalls = calls.filter(
      ([url]) => typeof url === 'string' && url.includes('/snapshot'),
    );
    expect(snapshotCalls).toHaveLength(0);
  });

  it('sets snapshot to null when server returns null snapshot', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeMetaResponse({ sectionCount: 0 })))
      .mockResolvedValueOnce(makeOkResponse(makeSnapshotResponse(null)));

    const { snapshot } = useSessionV2(ref('sess-zero'));
    await flush();

    expect(snapshot.value).toBeNull();
  });

  it('leaves snapshot null and sets error when snapshot fetch fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeMetaResponse({ sectionCount: 0 })))
      .mockResolvedValueOnce(makeErrorResponse(500));

    const { snapshot, error } = useSessionV2(ref('sess-zero'));
    await flush();

    expect(snapshot.value).toBeNull();
    expect(error.value).toBeTruthy();
  });

  it('resets snapshot to null on re-load (non-soft)', async () => {
    const terminalSnapshot = makeTerminalSnapshot(2);
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeMetaResponse({ sectionCount: 0 })))
      .mockResolvedValueOnce(makeOkResponse(makeSnapshotResponse(terminalSnapshot)));

    const sessionId = ref('sess-zero');
    const { snapshot } = useSessionV2(sessionId);
    await flush();
    expect(snapshot.value).toEqual(terminalSnapshot);

    // Reload with a different session that has sectionCount > 0
    vi.mocked(fetch).mockResolvedValueOnce(
      makeOkResponse(makeMetaResponse({ id: 'sess-2', sectionCount: 6, sections: [] })),
    );
    sessionId.value = 'sess-2';
    await flush();

    expect(snapshot.value).toBeNull();
  });
});

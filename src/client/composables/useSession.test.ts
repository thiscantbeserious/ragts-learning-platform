/**
 * Tests for useSession composable.
 *
 * Covers: initial state, successful fetch (sections mapped, snapshot parsed),
 * 404 response, non-ok response, network error, snapshot variants (string/object/null),
 * session ID change triggers a new fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';

// Mock useSSE before importing useSession — EventSource is not available in happy-dom.
// Returns a reactive ref so the watch in useSession does not throw on undefined.
vi.mock('./useSSE.js', () => ({
  useSSE: vi.fn().mockReturnValue({
    status: ref('completed'),
    isConnected: ref(false),
  }),
}));

import { useSession } from './useSession.js';
import type { SessionDetailResponse } from '../../shared/types/index.js';

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

function makeErrorResponse(status: number, body: unknown = {}): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Minimal valid SessionDetailResponse with no sections and no snapshot. */
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

describe('useSession', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with loading true', () => {
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
      const { loading } = useSession(ref('sess-1'));
      expect(loading.value).toBe(true);
    });

    it('starts with empty sections', () => {
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
      const { sections } = useSession(ref('sess-1'));
      expect(sections.value).toEqual([]);
    });

    it('starts with null snapshot', () => {
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
      const { snapshot } = useSession(ref('sess-1'));
      expect(snapshot.value).toBeNull();
    });

    it('starts with null error', () => {
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);
      const { error } = useSession(ref('sess-1'));
      expect(error.value).toBeNull();
    });
  });

  describe('successful fetch', () => {
    it('sets loading to false after fetch completes', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(makeSessionResponse()));
      const { loading } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(loading.value).toBe(false);
    });

    it('populates filename from the response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ filename: 'my-session.cast' }))
      );
      const { filename } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(filename.value).toBe('my-session.cast');
    });

    it('populates detection_status from the response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ detection_status: 'completed' }))
      );
      const { detectionStatus } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(detectionStatus.value).toBe('completed');
    });

    it('maps sections from the response', async () => {
      const sections = [
        {
          id: 'sec-1', type: 'marker' as const, label: 'Intro',
          startEvent: 0, endEvent: 10, startLine: null, endLine: null, snapshot: null,
        },
      ];
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ sections }))
      );
      const { sections: sectionsRef } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(sectionsRef.value).toHaveLength(1);
      expect(sectionsRef.value[0]?.label).toBe('Intro');
    });

    it('coerces undefined startLine/endLine to null in sections', async () => {
      const sections = [
        {
          id: 'sec-2', type: 'detected' as const, label: 'Body',
          startEvent: 5, endEvent: 20,
          startLine: undefined as unknown as null,
          endLine: undefined as unknown as null,
          snapshot: null,
        },
      ];
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ sections }))
      );
      const { sections: sectionsRef } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(sectionsRef.value[0]?.startLine).toBeNull();
      expect(sectionsRef.value[0]?.endLine).toBeNull();
    });

    it('parses a JSON string snapshot into an object', async () => {
      const snapshotObj = { screen: [], cursor: { x: 0, y: 0, visible: true } };
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ snapshot: JSON.stringify(snapshotObj) }))
      );
      const { snapshot } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(snapshot.value).toMatchObject({ cursor: { x: 0, y: 0, visible: true } });
    });

    it('accepts an already-parsed snapshot object', async () => {
      const snapshotObj = { screen: [], cursor: { x: 1, y: 2, visible: false } };
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ snapshot: snapshotObj as never }))
      );
      const { snapshot } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(snapshot.value).toMatchObject({ cursor: { x: 1, y: 2, visible: false } });
    });

    it('sets snapshot to null when response has no snapshot', async () => {
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ snapshot: null }))
      );
      const { snapshot } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(snapshot.value).toBeNull();
    });

    it('sets snapshot to null when snapshot JSON is empty string', async () => {
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ snapshot: '' }))
      );
      const { snapshot } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(snapshot.value).toBeNull();
    });

    it('sets snapshot to null when snapshot JSON is invalid', async () => {
      vi.mocked(fetch).mockResolvedValue(
        makeOkResponse(makeSessionResponse({ snapshot: 'not-json{{{' }))
      );
      const { snapshot } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(snapshot.value).toBeNull();
    });
  });

  describe('error states', () => {
    it('sets error to "Session not found" on 404 response', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404));
      const { error, loading } = useSession(ref('sess-missing'));
      await nextTick();
      await nextTick();
      expect(error.value).toBe('Session not found');
      expect(loading.value).toBe(false);
    });

    it('sets error message on non-ok non-404 response', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500));
      const { error } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(error.value).toContain('500');
    });

    it('sets error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      const { error } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(error.value).toBe('Network error');
    });

    it('sets a fallback error message when thrown value is not an Error', async () => {
      vi.mocked(fetch).mockRejectedValue('string error');
      const { error } = useSession(ref('sess-1'));
      await nextTick();
      await nextTick();
      expect(error.value).toBe('Failed to load session');
    });
  });

  describe('session ID change', () => {
    it('fetches again when the session ID ref changes', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(makeSessionResponse()));
      const idRef = ref('sess-1');
      useSession(idRef);

      await nextTick();
      await nextTick();

      idRef.value = 'sess-2';
      await nextTick();
      await nextTick();

      expect(fetch).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(fetch).mock.calls[1];
      expect(secondCall?.[0]).toContain('sess-2');
    });
  });
});

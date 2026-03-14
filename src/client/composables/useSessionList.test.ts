/**
 * Tests for useSessionList composable enhancements.
 *
 * Covers session fetching, search filtering, status filtering,
 * and composition of search + status filters together.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from 'vue';
import { useSessionList } from './useSessionList.js';
import type { Session } from '../../shared/types/session.js';

/**
 * Runs a composable inside a real Vue app so that lifecycle hooks (e.g. onMounted) fire.
 * Returns the composable's return value. The app is unmounted after the returned promise settles.
 */
function withSetup<T>(composable: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const app = createApp({
    setup() {
      result = composable();
      return () => null;
    },
  });
  const root = document.createElement('div');
  app.mount(root);
  return { result, unmount: () => app.unmount() };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test.cast',
    filepath: '/data/sessions/test.cast',
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    detection_status: 'completed',
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

describe('useSessionList()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('starts with empty sessions array', () => {
      const { sessions } = useSessionList();
      expect(sessions.value).toEqual([]);
    });

    it('starts with loading false', () => {
      const { loading } = useSessionList();
      expect(loading.value).toBe(false);
    });

    it('starts with null error', () => {
      const { error } = useSessionList();
      expect(error.value).toBeNull();
    });

    it('starts with empty searchQuery', () => {
      const { searchQuery } = useSessionList();
      expect(searchQuery.value).toBe('');
    });

    it('starts with statusFilter "all"', () => {
      const { statusFilter } = useSessionList();
      expect(statusFilter.value).toBe('all');
    });
  });

  describe('fetchSessions()', () => {
    it('populates sessions on success', async () => {
      const session = makeSession({ filename: 'alpha.cast' });
      vi.mocked(fetch).mockResolvedValue(makeOkResponse([session]));
      const { sessions, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(sessions.value).toHaveLength(1);
      expect(sessions.value[0]?.filename).toBe('alpha.cast');
    });

    it('sets error on HTTP failure', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500));
      const { error, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(error.value).toMatch(/500/);
    });

    it('sets error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network down'));
      const { error, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(error.value).toBe('Network down');
    });

    it('calls fetchSessions automatically on mount', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkResponse([]));
      const { unmount } = withSetup(() => useSessionList());
      // Allow the microtask queue to flush so the fetch resolves
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      unmount();
    });
  });

  describe('filteredSessions computed', () => {
    it('returns all sessions when searchQuery is empty and statusFilter is "all"', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'alpha.cast' }),
        makeSession({ id: '2', filename: 'beta.cast' }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      expect(composable.filteredSessions.value).toHaveLength(2);
    });

    it('filters sessions by searchQuery case-insensitively', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'alpha.cast' }),
        makeSession({ id: '2', filename: 'BETA.cast' }),
        makeSession({ id: '3', filename: 'gamma.cast' }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.searchQuery.value = 'beta';
      expect(composable.filteredSessions.value).toHaveLength(1);
      expect(composable.filteredSessions.value[0]?.filename).toBe('BETA.cast');
    });

    it('matches partial filename substring in searchQuery', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'session-2024-01.cast' }),
        makeSession({ id: '2', filename: 'other.cast' }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.searchQuery.value = '2024';
      expect(composable.filteredSessions.value).toHaveLength(1);
      expect(composable.filteredSessions.value[0]?.id).toBe('1');
    });

    it('returns empty array when searchQuery matches nothing', async () => {
      const sessions = [makeSession({ filename: 'alpha.cast' })];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.searchQuery.value = 'zzz-no-match';
      expect(composable.filteredSessions.value).toHaveLength(0);
    });

    it('filters by statusFilter "ready" — shows only completed sessions', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'a.cast', detection_status: 'completed' }),
        makeSession({ id: '2', filename: 'b.cast', detection_status: 'processing' }),
        makeSession({ id: '3', filename: 'c.cast', detection_status: 'failed' }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.statusFilter.value = 'ready';
      expect(composable.filteredSessions.value).toHaveLength(1);
      expect(composable.filteredSessions.value[0]?.id).toBe('1');
    });

    it('filters by statusFilter "processing" — shows processing-family statuses', async () => {
      const processingStatuses = [
        'pending', 'processing', 'queued', 'validating',
        'detecting', 'replaying', 'deduplicating', 'storing',
      ] as const;
      const sessions = processingStatuses.map((status, i) =>
        makeSession({ id: String(i), filename: `${status}.cast`, detection_status: status }),
      );
      sessions.push(makeSession({ id: '99', filename: 'done.cast', detection_status: 'completed' }));
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.statusFilter.value = 'processing';
      expect(composable.filteredSessions.value).toHaveLength(processingStatuses.length);
    });

    it('filters by statusFilter "failed" — shows failed and interrupted sessions', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'a.cast', detection_status: 'failed' }),
        makeSession({ id: '2', filename: 'b.cast', detection_status: 'interrupted' }),
        makeSession({ id: '3', filename: 'c.cast', detection_status: 'completed' }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.statusFilter.value = 'failed';
      expect(composable.filteredSessions.value).toHaveLength(2);
    });

    it('composes searchQuery and statusFilter — both must match', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'alpha-complete.cast', detection_status: 'completed' }),
        makeSession({ id: '2', filename: 'alpha-processing.cast', detection_status: 'processing' }),
        makeSession({ id: '3', filename: 'beta-complete.cast', detection_status: 'completed' }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.searchQuery.value = 'alpha';
      composable.statusFilter.value = 'ready';
      expect(composable.filteredSessions.value).toHaveLength(1);
      expect(composable.filteredSessions.value[0]?.id).toBe('1');
    });

    it('treats undefined detection_status as non-matching for ready/processing/failed filters', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'no-status.cast', detection_status: undefined }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.statusFilter.value = 'ready';
      expect(composable.filteredSessions.value).toHaveLength(0);
    });

    it('includes session with undefined detection_status when statusFilter is "all"', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'no-status.cast', detection_status: undefined }),
      ];
      vi.mocked(fetch).mockResolvedValue(makeOkResponse(sessions));
      const composable = useSessionList();
      await composable.fetchSessions();
      composable.statusFilter.value = 'all';
      expect(composable.filteredSessions.value).toHaveLength(1);
    });
  });

  describe('return shape', () => {
    it('exposes searchQuery, statusFilter, and filteredSessions', () => {
      const composable = useSessionList();
      expect('searchQuery' in composable).toBe(true);
      expect('statusFilter' in composable).toBe(true);
      expect('filteredSessions' in composable).toBe(true);
    });
  });
});

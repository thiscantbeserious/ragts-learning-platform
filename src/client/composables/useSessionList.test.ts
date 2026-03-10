import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSessionList } from './useSessionList.js';
import type { Session } from '../../shared/types/session.js';

/** Builds a minimal Session fixture with optional overrides. */
function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    filename: `${overrides.id}.cast`,
    filepath: `/sessions/${overrides.id}.cast`,
    size_bytes: 1024,
    marker_count: 3,
    uploaded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    detection_status: 'completed',
    ...overrides,
  };
}

function makeOkJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const SESSION_A = makeSession({ id: 'a', filename: 'alpha.cast', detection_status: 'completed', marker_count: 2, detected_sections_count: 5 });
const SESSION_B = makeSession({ id: 'b', filename: 'beta.cast', detection_status: 'processing' });
const SESSION_C = makeSession({ id: 'c', filename: 'gamma.cast', detection_status: 'pending' });

describe('useSessionList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchSessions', () => {
    it('populates sessions on successful fetch', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([SESSION_A, SESSION_B]));
      const { sessions, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(sessions.value).toHaveLength(2);
    });

    it('sets loading to false after fetch completes', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([]));
      const { loading, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(loading.value).toBe(false);
    });

    it('sets error when fetch returns non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500, {}));
      const { error, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(error.value).toContain('500');
    });

    it('sets error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      const { error, fetchSessions } = useSessionList();
      await fetchSessions();
      expect(error.value).toBe('Network error');
    });
  });

  describe('deleteSession', () => {
    it('returns true and re-fetches sessions on successful delete', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeOkJsonResponse({}))        // DELETE
        .mockResolvedValueOnce(makeOkJsonResponse([SESSION_A])); // re-fetch
      const { sessions, deleteSession } = useSessionList();
      const result = await deleteSession('b');
      expect(result).toBe(true);
      expect(sessions.value).toHaveLength(1);
    });

    it('returns false and sets error on delete failure', async () => {
      vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404, { error: 'Not found' }));
      const { error, deleteSession } = useSessionList();
      const result = await deleteSession('unknown');
      expect(result).toBe(false);
      expect(error.value).toBe('Not found');
    });

    it('returns false and sets error on network failure during delete', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      const { error, deleteSession } = useSessionList();
      const result = await deleteSession('a');
      expect(result).toBe(false);
      expect(error.value).toBe('Network error');
    });
  });

  describe('updateSession', () => {
    it('merges patch into matching session in-place', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([SESSION_A, SESSION_B, SESSION_C]));
      const { sessions, fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      updateSession('b', { detection_status: 'validating' });

      const updated = sessions.value.find((s) => s.id === 'b');
      expect(updated?.detection_status).toBe('validating');
    });

    it('leaves other session fields intact after patch merge', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([SESSION_A, SESSION_B]));
      const { sessions, fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      updateSession('b', { detection_status: 'detecting' });

      const updated = sessions.value.find((s) => s.id === 'b');
      expect(updated?.filename).toBe('beta.cast');
    });

    it('does not affect other sessions when patching one', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([SESSION_A, SESSION_B]));
      const { sessions, fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      updateSession('b', { detection_status: 'processing' });

      const unchanged = sessions.value.find((s) => s.id === 'a');
      expect(unchanged?.detection_status).toBe('completed');
    });

    it('is a no-op when the session ID does not exist', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([SESSION_A, SESSION_B]));
      const { sessions, fetchSessions, updateSession } = useSessionList();
      await fetchSessions();
      const before = sessions.value.map((s) => ({ ...s }));

      updateSession('nonexistent', { detection_status: 'failed' });

      expect(sessions.value).toEqual(before);
    });

    it('re-fetches the single session via GET /api/sessions/:id when patch sets detection_status to completed', async () => {
      const completedSession: Session = { ...SESSION_B, detection_status: 'completed', marker_count: 10, detected_sections_count: 4 };
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeOkJsonResponse([SESSION_A, SESSION_B]))  // initial fetchSessions
        .mockResolvedValueOnce(makeOkJsonResponse(completedSession));        // GET /api/sessions/b
      const { fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      await updateSession('b', { detection_status: 'completed' });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('/api/sessions/b');
    });

    it('merges detail response into session when re-fetching after completed status', async () => {
      const completedSession: Session = { ...SESSION_B, detection_status: 'completed', marker_count: 10, detected_sections_count: 4 };
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeOkJsonResponse([SESSION_A, SESSION_B]))
        .mockResolvedValueOnce(makeOkJsonResponse(completedSession));
      const { sessions, fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      await updateSession('b', { detection_status: 'completed' });

      const updated = sessions.value.find((s) => s.id === 'b');
      expect(updated?.marker_count).toBe(10);
      expect(updated?.detected_sections_count).toBe(4);
    });

    it('does NOT call GET /api/sessions (full list) when patch sets detection_status to completed', async () => {
      const completedSession: Session = { ...SESSION_B, detection_status: 'completed' };
      vi.mocked(fetch)
        .mockResolvedValueOnce(makeOkJsonResponse([SESSION_A, SESSION_B]))
        .mockResolvedValueOnce(makeOkJsonResponse(completedSession));
      const { fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      await updateSession('b', { detection_status: 'completed' });

      const calls = vi.mocked(fetch).mock.calls;
      const listCalls = calls.filter((c) => c[0] === '/api/sessions');
      expect(listCalls).toHaveLength(1); // only initial fetch, not a second one
    });

    it('does not re-fetch single session when patch does not set detection_status to completed', async () => {
      vi.mocked(fetch).mockResolvedValue(makeOkJsonResponse([SESSION_A, SESSION_B]));
      const { fetchSessions, updateSession } = useSessionList();
      await fetchSessions();

      updateSession('b', { detection_status: 'detecting' });

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});

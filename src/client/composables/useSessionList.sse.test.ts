/**
 * Tests for useSessionList SSE-triggered refresh (Bug 1).
 *
 * Verifies that useSessionList exposes a refreshOnSessionComplete() callback
 * that, when called, re-fetches the session list so the sidebar reflects the
 * latest server state after a session pipeline completes.
 *
 * The composable itself doesn't know about SSE — the callback is meant to be
 * called by SessionCard (or any SSE-aware consumer) when a terminal state fires.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSessionList } from './useSessionList.js';
import type { Session } from '../../shared/types/session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionList() — refreshOnSessionComplete', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes a refreshOnSessionComplete callback', () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse([]));
    const composable = useSessionList();
    expect(typeof composable.refreshOnSessionComplete).toBe('function');
  });

  it('refreshOnSessionComplete calls fetchSessions (re-fetches the list)', async () => {
    const initialSessions = [makeSession({ id: '1', filename: 'a.cast', detection_status: 'processing' })];
    const updatedSessions = [makeSession({ id: '1', filename: 'a.cast', detection_status: 'completed', detected_sections_count: 5 })];

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(initialSessions))
      .mockResolvedValueOnce(makeOkResponse(updatedSessions));

    const { sessions, fetchSessions, refreshOnSessionComplete } = useSessionList();
    await fetchSessions();

    expect(sessions.value[0]?.detection_status).toBe('processing');

    await refreshOnSessionComplete();

    expect(sessions.value[0]?.detection_status).toBe('completed');
    expect(sessions.value[0]?.detected_sections_count).toBe(5);
  });

  it('refreshOnSessionComplete re-fetches the full list from the server', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse([]));

    const { refreshOnSessionComplete } = useSessionList();
    await refreshOnSessionComplete();

    // Should have called /api/sessions
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/sessions');
  });
});

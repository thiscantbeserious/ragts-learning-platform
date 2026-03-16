import { ref, computed, onMounted } from 'vue';
import type { ComputedRef, InjectionKey, Ref } from 'vue';
import type { Session } from '../../shared/types/session.js';

/** Status filter values for the sidebar filter pills. */
export type StatusFilter = 'all' | 'ready' | 'processing' | 'failed';

/** Shape of the session list state provided to child components. */
export interface SessionListState {
  sessions: Ref<Session[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  searchQuery: Ref<string>;
  statusFilter: Ref<StatusFilter>;
  filteredSessions: ComputedRef<Session[]>;
  fetchSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<boolean>;
  /** Re-fetches the session list. Call when a session reaches a terminal state via SSE. */
  refreshOnSessionComplete: () => Promise<void>;
}

/**
 * Injection key for session list state.
 * Provided by SpatialShell, injected by sidebar and header components.
 */
export const sessionListKey: InjectionKey<SessionListState> = Symbol('sessionList');

/** Detection statuses that map to the "Processing" filter pill. */
const PROCESSING_STATUSES = new Set<Session['detection_status']>([
  'pending', 'processing', 'queued', 'validating',
  'detecting', 'replaying', 'deduplicating', 'storing',
]);

/** Maps a session's detection_status to its StatusFilter group. */
function classifyStatus(session: Session): StatusFilter | null {
  const status = session.detection_status;
  if (status === 'completed') return 'ready';
  if (status === 'failed' || status === 'interrupted') return 'failed';
  if (status !== undefined && PROCESSING_STATUSES.has(status)) return 'processing';
  return null;
}

/** Returns true if the session matches the active status filter. */
function matchesStatusFilter(session: Session, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  return classifyStatus(session) === filter;
}

/** Returns true if the session filename contains the query (case-insensitive). */
function matchesSearch(session: Session, query: string): boolean {
  if (query === '') return true;
  return session.filename.toLowerCase().includes(query.toLowerCase());
}

/**
 * Manages the session list with search and status filtering.
 * Fetches sessions from /api/sessions on mount.
 * Exposes filteredSessions as a computed combining searchQuery and statusFilter.
 */
export function useSessionList() {
  const sessions = ref<Session[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Reactive search query — filters by filename substring match. */
  const searchQuery = ref('');

  /** Reactive status filter — one of 'all' | 'ready' | 'processing' | 'failed'. */
  const statusFilter = ref<StatusFilter>('all');

  /** Sessions filtered by both searchQuery and statusFilter. */
  const filteredSessions: ComputedRef<Session[]> = computed(() =>
    sessions.value.filter(session =>
      matchesSearch(session, searchQuery.value) &&
      matchesStatusFilter(session, statusFilter.value),
    ),
  );

  async function fetchSessions(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) {
        throw new Error(`Failed to fetch sessions (${res.status})`);
      }
      sessions.value = await res.json() as Session[];
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load sessions';
    } finally {
      loading.value = false;
    }
  }

  async function deleteSession(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        error.value = data.error || `Delete failed (${res.status})`;
        return false;
      }
      await fetchSessions();
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Delete failed';
      return false;
    }
  }

  /**
   * Re-fetches the full session list from the server.
   * Call this from SSE-aware consumers (e.g. SessionCard) when a session
   * reaches a terminal state so the sidebar reflects updated server data.
   */
  async function refreshOnSessionComplete(): Promise<void> {
    await fetchSessions();
  }

  onMounted(fetchSessions);

  return {
    sessions,
    loading,
    error,
    searchQuery,
    statusFilter,
    filteredSessions,
    fetchSessions,
    deleteSession,
    refreshOnSessionComplete,
  };
}

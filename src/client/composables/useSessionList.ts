import { ref, onMounted } from 'vue';
import type { Session } from '../../shared/types/session.js';

export function useSessionList() {
  const sessions = ref<Session[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

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
   * Merges patch into the matching session in-place.
   * If patch includes detection_status: 'completed', re-fetches the single session
   * via GET /api/sessions/:id to obtain final counts. No-op for unknown IDs.
   */
  async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
    const index = sessions.value.findIndex((s) => s.id === id);
    if (index === -1) return;

    sessions.value[index] = { ...sessions.value[index]!, ...patch };

    if (patch.detection_status === 'completed') {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.ok) {
        sessions.value[index] = await res.json() as Session;
      }
    }
  }

  onMounted(fetchSessions);

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    deleteSession,
    updateSession,
  };
}

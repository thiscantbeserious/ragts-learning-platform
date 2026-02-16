import { ref, onMounted } from 'vue';
import type { Session } from '../../shared/types';

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

  onMounted(fetchSessions);

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    deleteSession,
  };
}

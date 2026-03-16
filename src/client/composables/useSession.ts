import { ref, computed, watch, toValue, type MaybeRef } from 'vue';
import type { TerminalSnapshot } from '#vt-wasm/types';
import type { Section, SessionDetailResponse } from '../../shared/types/index.js';
import { useSSE } from './useSSE.js';

export type { Section } from '../../shared/types/index.js';

/**
 * Parse snapshot JSON string into TerminalSnapshot object.
 * Returns null if parsing fails or snapshot is empty.
 */
function parseSnapshot(snapshotJson: string): TerminalSnapshot | null {
  try {
    if (!snapshotJson || snapshotJson.trim() === '') {
      return null;
    }
    const parsed = JSON.parse(snapshotJson) as TerminalSnapshot;
    return parsed;
  } catch (err) {
    console.error('Failed to parse snapshot JSON:', err);
    return null;
  }
}

/**
 * Normalise sections from the API response.
 * Ensures null coercion on optional line-range fields.
 */
function mapSections(apiSections: Section[]): Section[] {
  return apiSections.map((s) => ({
    ...s,
    startLine: s.startLine ?? null,
    endLine: s.endLine ?? null,
    snapshot: s.snapshot ?? null,
  }));
}

export function useSession(sessionId: MaybeRef<string>) {
  const session = ref<SessionDetailResponse | null>(null);
  const sections = ref<Section[]>([]);
  const snapshot = ref<TerminalSnapshot | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const detectionStatus = ref<SessionDetailResponse['detection_status']>('completed');

  const filename = computed(() => session.value?.filename ?? '');

  async function fetchSession(id: string): Promise<void> {
    loading.value = true;
    error.value = null;
    session.value = null;
    sections.value = [];
    snapshot.value = null;
    detectionStatus.value = 'pending';
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.status === 404) {
        error.value = 'Session not found';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load session (${res.status})`);
      }
      const data = await res.json() as SessionDetailResponse;
      session.value = data;
      detectionStatus.value = data.detection_status;
      sections.value = mapSections(data.sections);

      // Parse session-level snapshot (handles both string and parsed object)
      if (data.snapshot) {
        if (typeof data.snapshot === 'string') {
          snapshot.value = parseSnapshot(data.snapshot);
        } else {
          snapshot.value = data.snapshot;
        }
      } else {
        snapshot.value = null;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load session';
    } finally {
      loading.value = false;
    }
  }

  // Normalise sessionId to a Ref so useSSE can watch it
  const sessionIdRef = computed(() => toValue(sessionId));

  watch(sessionIdRef, (id) => {
    if (id) fetchSession(id);
  }, { immediate: true });

  // SSE integration — re-fetch when pipeline reaches a terminal state
  const { status: sseStatus } = useSSE(sessionIdRef, detectionStatus);
  watch(sseStatus, (next) => {
    const id = toValue(sessionId);
    if (id && (next === 'completed' || next === 'failed')) {
      void fetchSession(id);
    }
  });

  return {
    session,
    sections,
    snapshot,
    loading,
    error,
    filename,
    detectionStatus,
  };
}

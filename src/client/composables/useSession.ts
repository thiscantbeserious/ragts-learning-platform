import { ref, computed, watch, isRef, toValue, type Ref, type MaybeRef } from 'vue';
import type { AsciicastFile } from '../../shared/asciicast-types';
import type { TerminalSnapshot } from '../../../packages/vt-wasm/types';

/**
 * Client-side section interface.
 * Maps from the API section response shape.
 */
export interface Section {
  id: string;
  type: 'marker' | 'detected';
  label: string;
  startEvent: number;
  endEvent: number;
  snapshot: TerminalSnapshot | null;
}

/**
 * API section row structure.
 */
interface ApiSection {
  id: string;
  session_id: string;
  type: 'marker' | 'detected';
  start_event: number;
  end_event: number;
  label: string;
  snapshot: string; // JSON string of TerminalSnapshot
  created_at: string;
}

interface SessionResponse {
  id: string;
  filename: string;
  content: AsciicastFile;
  sections: ApiSection[];
  detection_status: 'pending' | 'processing' | 'completed' | 'failed';
}

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
 * Map API sections to client-side sections.
 */
function mapSections(apiSections: ApiSection[]): Section[] {
  return apiSections.map((apiSection) => ({
    id: apiSection.id,
    type: apiSection.type,
    label: apiSection.label,
    startEvent: apiSection.start_event,
    endEvent: apiSection.end_event,
    snapshot: parseSnapshot(apiSection.snapshot),
  }));
}

export function useSession(sessionId: MaybeRef<string>) {
  const session = ref<SessionResponse | null>(null);
  const sections = ref<Section[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const detectionStatus = ref<'pending' | 'processing' | 'completed' | 'failed'>('completed');

  const filename = computed(() => session.value?.filename ?? '');

  async function fetchSession(id: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.status === 404) {
        error.value = 'Session not found';
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load session (${res.status})`);
      }
      const data = await res.json() as SessionResponse;
      session.value = data;
      detectionStatus.value = data.detection_status;
      sections.value = mapSections(data.sections);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load session';
    } finally {
      loading.value = false;
    }
  }

  watch(() => toValue(sessionId), (id) => {
    if (id) fetchSession(id);
  }, { immediate: true });

  return {
    session,
    sections,
    loading,
    error,
    filename,
    detectionStatus,
  };
}

import { ref, computed, watch, isRef, toValue, type Ref, type MaybeRef } from 'vue';
import type { AsciicastFile } from '../../shared/asciicast-types';
import type { TerminalSnapshot } from '../../../packages/vt-wasm/types';

/**
 * Client-side section interface.
 * Maps from the API section response shape.
 * Supports hybrid rendering:
 * - CLI sections: use session snapshot + startLine/endLine ranges
 * - TUI sections: use per-section viewport snapshot
 */
export interface Section {
  id: string;
  type: 'marker' | 'detected';
  label: string;
  startEvent: number;
  endEvent: number;
  startLine: number | null;   // CLI sections — index into session snapshot
  endLine: number | null;     // CLI sections — index into session snapshot
  snapshot: TerminalSnapshot | null;  // TUI sections — per-section viewport
}

/**
 * API section response structure (camelCase from the route handler).
 * Includes both line-range fields (CLI) and snapshot (TUI).
 */
interface ApiSection {
  id: string;
  type: 'marker' | 'detected';
  label: string;
  startEvent: number;
  endEvent: number;
  startLine: number | null;  // CLI sections — line range start
  endLine: number | null;    // CLI sections — line range end
  snapshot: TerminalSnapshot | null;  // Parsed by route handler (TUI sections)
}

/**
 * Session API response structure.
 * Includes session-level snapshot (unified terminal document)
 * plus sections with their individual snapshots or line ranges.
 */
interface SessionResponse {
  id: string;
  filename: string;
  content: AsciicastFile;
  snapshot?: string | TerminalSnapshot | null;  // Session-level snapshot (JSON string or parsed)
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
 * Preserves line ranges (CLI) and snapshots (TUI).
 * Backward compatible: if start_line/end_line are missing, section still works with snapshot.
 */
function mapSections(apiSections: ApiSection[]): Section[] {
  return apiSections.map((apiSection) => ({
    id: apiSection.id,
    type: apiSection.type,
    label: apiSection.label,
    startEvent: apiSection.startEvent,
    endEvent: apiSection.endEvent,
    startLine: apiSection.startLine ?? null,
    endLine: apiSection.endLine ?? null,
    snapshot: apiSection.snapshot ?? null,
  }));
}

export function useSession(sessionId: MaybeRef<string>) {
  const session = ref<SessionResponse | null>(null);
  const sections = ref<Section[]>([]);
  const snapshot = ref<TerminalSnapshot | null>(null);
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

  watch(() => toValue(sessionId), (id) => {
    if (id) fetchSession(id);
  }, { immediate: true });

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

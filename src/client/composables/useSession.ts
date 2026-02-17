import { ref, computed, watch, isRef, toValue, type Ref, type MaybeRef } from 'vue';
import type { AsciicastFile, ParsedEvent, Marker } from '../../shared/asciicast-types';

export interface Section {
  type: 'preamble' | 'marker';
  label?: string;
  time?: number;
  lines: string[];
}

interface SessionResponse {
  id: string;
  filename: string;
  size_bytes: number;
  marker_count: number;
  uploaded_at: string;
  content: AsciicastFile;
}

/**
 * Build sections from parsed events and markers.
 * Content before first marker is preamble (always expanded).
 * Each marker starts a new collapsible section.
 */
function buildSections(events: ParsedEvent[], markers: Marker[]): Section[] {
  const sections: Section[] = [];

  if (markers.length === 0) {
    // No markers: single section with all output
    const lines = extractOutputLines(events, 0, events.length);
    if (lines.length > 0) {
      sections.push({ type: 'preamble', lines });
    }
    return sections;
  }

  // Preamble: events before first marker
  const firstMarkerIndex = markers[0].index;
  if (firstMarkerIndex > 0) {
    const lines = extractOutputLines(events, 0, firstMarkerIndex);
    if (lines.length > 0) {
      sections.push({ type: 'preamble', lines });
    }
  }

  // Marker sections
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const startIdx = marker.index + 1; // Events after marker
    const endIdx = i + 1 < markers.length ? markers[i + 1].index : events.length;
    const lines = extractOutputLines(events, startIdx, endIdx);

    sections.push({
      type: 'marker',
      label: marker.label,
      time: marker.time,
      lines,
    });
  }

  return sections;
}

/**
 * Extract output lines from a range of events.
 * Concatenates output event data and splits on newlines.
 */
function extractOutputLines(events: ParsedEvent[], start: number, end: number): string[] {
  let buffer = '';
  for (let i = start; i < end; i++) {
    const event = events[i];
    if (event && event.type === 'o' && typeof event.data === 'string') {
      buffer += event.data;
    }
  }

  if (buffer.length === 0) return [];

  // Split on newlines, keep trailing empty line only if there's content
  const lines = buffer.split('\n');
  // Remove trailing empty string from final newline
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function useSession(sessionId: MaybeRef<string>) {
  const session = ref<SessionResponse | null>(null);
  const sections = ref<Section[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

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
      sections.value = buildSections(data.content.events, data.content.markers);
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
  };
}

/**
 * useSession — metadata-first session composable with lazy section content loading.
 *
 * Fetches session metadata (header + section metadata) first, then:
 * - Small sessions (sectionCount <= SMALL_SESSION_THRESHOLD): bulk-fetches all section
 *   content in a single request via the /sections/content endpoint.
 * - Large sessions: exposes fetchSectionContent() for on-demand per-section loading.
 * - Zero-section sessions: fetches the full session snapshot via /snapshot endpoint.
 *
 * All fetched content pages are stored in an injected SectionCache (defaults to
 * the module-level singleton from useSectionCache). Cache hits short-circuit HTTP.
 *
 * SSE integration mirrors useSession: soft re-fetch on terminal state transitions.
 */
import { ref, computed, watch, toValue, type MaybeRef } from 'vue';
import type { TerminalSnapshot } from '#vt-wasm/types';
import type {
  SessionMetadataResponse,
  SectionMetadata,
  SectionContentPage,
  BulkSectionContentResponse,
  SessionSnapshotResponse,
} from '../../shared/types/api.js';
import { SMALL_SESSION_THRESHOLD, DEFAULT_SECTION_PAGE_LIMIT } from '../../shared/constants.js';
import { useSectionCache, makeCacheKey, type SectionCache } from './use_section_cache.js';
import { useSSE } from './useSSE.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { SectionMetadata, SectionContentPage } from '../../shared/types/api.js';
export type { SectionCache } from './use_section_cache.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function fetchMetadata(id: string): Promise<SessionMetadataResponse> {
  const res = await fetch(`/api/sessions/${id}`);
  if (res.status === 404) throw Object.assign(new Error('Session not found'), { is404: true });
  if (!res.ok) throw new Error(`Failed to load session (${res.status})`);
  return res.json() as Promise<SessionMetadataResponse>;
}

async function fetchBulkContent(id: string): Promise<BulkSectionContentResponse> {
  const res = await fetch(`/api/sessions/${id}/sections/content`);
  if (!res.ok) throw new Error(`Failed to load section content (${res.status})`);
  return res.json() as Promise<BulkSectionContentResponse>;
}

async function fetchSessionSnapshot(id: string): Promise<SessionSnapshotResponse> {
  const res = await fetch(`/api/sessions/${id}/snapshot`);
  if (!res.ok) throw new Error(`Failed to load session snapshot (${res.status})`);
  return res.json() as Promise<SessionSnapshotResponse>;
}

async function fetchOneSectionPage(
  sessionId: string,
  sectionId: string,
  offset: number,
  limit: number,
): Promise<SectionContentPage> {
  const url = `/api/sessions/${sessionId}/sections/${sectionId}/content?offset=${offset}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load section ${sectionId} (${res.status})`);
  return res.json() as Promise<SectionContentPage>;
}

function storeBulkInCache(bulk: BulkSectionContentResponse, cache: SectionCache): void {
  for (const [, page] of Object.entries(bulk.sections)) {
    cache.set(makeCacheKey(page.sectionId, page.offset), page);
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

const TERMINAL = new Set(['completed', 'failed', 'interrupted']);

/**
 * Reactive session composable with metadata-first loading strategy.
 *
 * @param sessionId - reactive or static session identifier
 * @param cache - optional SectionCache injection (defaults to module singleton)
 */
export function useSession(sessionId: MaybeRef<string>, cache?: SectionCache) {
  const _cache = useSectionCache(cache);

  const session = ref<SessionMetadataResponse | null>(null);
  const sections = ref<SectionMetadata[]>([]);
  const snapshot = ref<TerminalSnapshot | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const detectionStatus = ref<SessionMetadataResponse['detection_status']>('completed');

  const filename = computed(() => session.value?.filename ?? '');
  const sessionIdRef = computed(() => toValue(sessionId));

  async function load(id: string, soft = false): Promise<void> {
    if (!soft) {
      loading.value = true;
      error.value = null;
      session.value = null;
      sections.value = [];
      snapshot.value = null;
    }
    try {
      const meta = await fetchMetadata(id);
      session.value = meta;
      sections.value = meta.sections;
      detectionStatus.value = meta.detection_status;

      if (meta.sectionCount === 0) {
        await loadSessionSnapshot(id);
      } else if (meta.sectionCount <= SMALL_SESSION_THRESHOLD) {
        await loadBulkContent(id);
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load session';
    } finally {
      loading.value = false;
    }
  }

  async function loadBulkContent(id: string): Promise<void> {
    const bulk = await fetchBulkContent(id);
    storeBulkInCache(bulk, _cache);
  }

  /** Fetches the session-level snapshot for 0-section sessions. */
  async function loadSessionSnapshot(id: string): Promise<void> {
    const result = await fetchSessionSnapshot(id);
    snapshot.value = result.snapshot;
  }

  /**
   * Fetches a page of terminal lines for one section.
   * Returns the cached page immediately if available; otherwise fetches from the server
   * and stores the result in the cache before returning.
   */
  async function fetchSectionContent(
    sectionId: string,
    offset = 0,
    limit = DEFAULT_SECTION_PAGE_LIMIT,
  ): Promise<SectionContentPage> {
    const key = makeCacheKey(sectionId, offset);
    const cached = _cache.get(key);
    if (cached !== undefined) return cached;

    const id = toValue(sessionId);
    const page = await fetchOneSectionPage(id, sectionId, offset, limit);
    _cache.set(key, page);
    return page;
  }

  watch(
    sessionIdRef,
    (id) => {
      if (id) void load(id);
    },
    { immediate: true },
  );

  const { status: sseStatus } = useSSE(sessionIdRef, detectionStatus);

  watch(sseStatus, (next, prev) => {
    const id = toValue(sessionId);
    if (!id || !next) return;
    if (TERMINAL.has(next) && !TERMINAL.has(prev ?? '')) {
      void load(id, true);
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
    fetchSectionContent,
  };
}

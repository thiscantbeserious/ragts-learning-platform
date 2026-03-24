/**
 * Tests for use_session composable — large-session lazy per-section content fetch.
 *
 * Covers: no auto-bulk for large sessions, fetchSectionContent fetches and caches,
 * cache hit short-circuits HTTP, offset/limit passed in request URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { Ref } from 'vue';
import type { SessionMetadataResponse, SectionContentPage } from '../../shared/types/api.js';
import type { SectionCache } from './use_section_cache.js';

// ---------------------------------------------------------------------------
// useSSE mock
// ---------------------------------------------------------------------------

let mockSseStatus: Ref<string | undefined> = ref<string | undefined>(undefined);

vi.mock('./useSSE.js', () => ({
  useSSE: () => ({ status: mockSseStatus, isConnected: ref(false) }),
  resetConnectionBudget: vi.fn(),
}));

import { useSession } from './use_session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flush(count = 10): Promise<void> {
  for (let i = 0; i < count; i++) await nextTick();
}

/** Generates 6 sections — above the SMALL_SESSION_THRESHOLD of 5. */
function makeLargeMetaResponse(): SessionMetadataResponse {
  const sections = Array.from({ length: 6 }, (_, i) => ({
    id: `sec-${i}`,
    type: 'detected' as const,
    label: `Section sec-${i}`,
    startEvent: i * 10,
    endEvent: i * 10 + 9,
    startLine: i * 10,
    endLine: i * 10 + 9,
    lineCount: 10,
    preview: null,
  }));
  return {
    id: 'sess-large',
    filename: 'large.cast',
    content: {
      header: { version: 2, width: 80, height: 24, timestamp: 0, title: '' },
      markers: [],
    },
    sections,
    detection_status: 'completed',
    totalLines: 60,
    sectionCount: 6,
  };
}

function makeContentPage(sectionId: string): SectionContentPage {
  return {
    sectionId,
    lines: [{ spans: [] }],
    totalLines: 1,
    offset: 0,
    limit: 500,
    hasMore: false,
    contentHash: `hash-${sectionId}`,
  };
}

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeTestCache(): SectionCache {
  const store = new Map<string, SectionContentPage>();
  return {
    get: (k) => store.get(k),
    set: (k, v) => {
      store.set(k, v);
    },
    has: (k) => store.has(k),
    delete: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSession — large session lazy fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockSseStatus = ref(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does NOT auto-fetch bulk content for sessions exceeding SMALL_SESSION_THRESHOLD', async () => {
    vi.mocked(fetch).mockResolvedValue(makeOkResponse(makeLargeMetaResponse()));

    const { loading } = useSession(ref('sess-large'), makeTestCache());
    await flush();

    expect(loading.value).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetchSectionContent fetches a page for the given sectionId and offset', async () => {
    const page = makeContentPage('sec-0');

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeLargeMetaResponse()))
      .mockResolvedValueOnce(makeOkResponse(page));

    const { fetchSectionContent } = useSession(ref('sess-large'), makeTestCache());
    await flush();

    const result = await fetchSectionContent('sec-0', 0);

    expect(result).toEqual(page);
    const url = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(url).toContain('sec-0');
    expect(url).toContain('offset=0');
  });

  it('fetchSectionContent stores the fetched page in the cache', async () => {
    const page = makeContentPage('sec-0');

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeLargeMetaResponse()))
      .mockResolvedValueOnce(makeOkResponse(page));

    const cache = makeTestCache();
    const { fetchSectionContent } = useSession(ref('sess-large'), cache);
    await flush();

    await fetchSectionContent('sec-0', 0);

    expect(cache.has('sec-0:0:all')).toBe(true);
    expect(cache.get('sec-0:0:all')).toEqual(page);
  });

  it('fetchSectionContent returns cached page without re-fetching', async () => {
    const page = makeContentPage('sec-0');

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeLargeMetaResponse()))
      .mockResolvedValueOnce(makeOkResponse(page));

    const { fetchSectionContent } = useSession(ref('sess-large'), makeTestCache());
    await flush();

    await fetchSectionContent('sec-0', 0);
    const callCountAfterFirst = vi.mocked(fetch).mock.calls.length;

    const result = await fetchSectionContent('sec-0', 0);
    expect(vi.mocked(fetch).mock.calls.length).toBe(callCountAfterFirst);
    expect(result).toEqual(page);
  });

  it('fetchSectionContent passes offset and limit in the request URL', async () => {
    const page = makeContentPage('sec-2');

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(makeLargeMetaResponse()))
      .mockResolvedValueOnce(makeOkResponse(page));

    const { fetchSectionContent } = useSession(ref('sess-large'), makeTestCache());
    await flush();

    await fetchSectionContent('sec-2', 500, 500);

    const url = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(url).toContain('offset=500');
    expect(url).toContain('limit=500');
  });
});

/**
 * Tests for use_session composable — small-session bulk content loading.
 *
 * Covers: bulk fetch triggered for sectionCount <= SMALL_SESSION_THRESHOLD,
 * bulk pages stored in the injected SectionCache, loading flag after bulk completes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { Ref } from 'vue';
import type {
  SessionMetadataResponse,
  SectionContentPage,
  BulkSectionContentResponse,
} from '../../shared/types/api.js';
import type { SectionCache } from './use_section_cache.js';

// ---------------------------------------------------------------------------
// useSSE mock
// ---------------------------------------------------------------------------

let mockSseStatus: Ref<string | undefined> = ref<string | undefined>(undefined);

vi.mock('./useSSE.js', () => ({
  useSSE: () => ({ status: mockSseStatus, isConnected: ref(false) }),
  resetConnectionBudget: vi.fn(),
}));

import { useSessionV2 } from './use_session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flush(count = 10): Promise<void> {
  for (let i = 0; i < count; i++) await nextTick();
}

function makeMetaResponse(
  overrides: Partial<SessionMetadataResponse> = {}
): SessionMetadataResponse {
  return {
    id: 'sess-1',
    filename: 'session.cast',
    content: {
      header: { version: 2, width: 80, height: 24, timestamp: 0, title: '' },
      markers: [],
    },
    sections: [],
    detection_status: 'completed',
    totalLines: 0,
    sectionCount: 1,
    ...overrides,
  };
}

function makeSection(id: string): SessionMetadataResponse['sections'][0] {
  return {
    id, type: 'detected', label: `Section ${id}`,
    startEvent: 0, endEvent: 10, startLine: 0, endLine: 9,
    lineCount: 10, preview: null,
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
    set: (k, v) => { store.set(k, v); },
    has: (k) => store.has(k),
    delete: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionV2 — small session bulk load', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockSseStatus = ref(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('fetches bulk content for sessions with sectionCount <= SMALL_SESSION_THRESHOLD', async () => {
    const sections = [makeSection('sec-1'), makeSection('sec-2')];
    const metaResponse = makeMetaResponse({ sections, sectionCount: 2 });
    const bulkResponse: BulkSectionContentResponse = {
      sections: {
        'sec-1': makeContentPage('sec-1'),
        'sec-2': makeContentPage('sec-2'),
      },
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(metaResponse))
      .mockResolvedValueOnce(makeOkResponse(bulkResponse));

    const cache = makeTestCache();
    const { loading } = useSessionV2(ref('sess-1'), cache);
    await flush();

    expect(loading.value).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondUrl = vi.mocked(fetch).mock.calls[1]?.[0] as string;
    expect(secondUrl).toContain('/sections/content');
  });

  it('stores bulk content pages in the cache', async () => {
    const sections = [makeSection('sec-1')];
    const metaResponse = makeMetaResponse({ sections, sectionCount: 1 });
    const page = makeContentPage('sec-1');
    const bulkResponse: BulkSectionContentResponse = {
      sections: { 'sec-1': page },
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(metaResponse))
      .mockResolvedValueOnce(makeOkResponse(bulkResponse));

    const cache = makeTestCache();
    useSessionV2(ref('sess-1'), cache);
    await flush();

    expect(cache.has('sec-1:0:all')).toBe(true);
    expect(cache.get('sec-1:0:all')).toEqual(page);
  });

  it('loading is false after bulk content completes', async () => {
    const sections = [makeSection('sec-1')];
    const metaResponse = makeMetaResponse({ sections, sectionCount: 1 });
    const bulkResponse: BulkSectionContentResponse = {
      sections: { 'sec-1': makeContentPage('sec-1') },
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeOkResponse(metaResponse))
      .mockResolvedValueOnce(makeOkResponse(bulkResponse));

    const { loading } = useSessionV2(ref('sess-1'), makeTestCache());
    await flush();

    expect(loading.value).toBe(false);
  });
});

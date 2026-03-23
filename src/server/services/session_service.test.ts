// @vitest-environment node
/**
 * Unit tests for SessionService.getSessionMetadata.
 *
 * Verifies that the metadata-only session endpoint returns SectionMetadata shapes
 * (no snapshot content), with correct lineCount, preview, totalLines, and sectionCount.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionService } from './session_service.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SectionAdapter, SectionRow } from '../db/section_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import type { JobQueueAdapter } from '../jobs/job_queue_adapter.js';
import type { EventBusAdapter } from '../events/event_bus_adapter.js';
import type { Session } from '../../shared/types/session.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test.cast',
    filepath: 'sessions/test.cast',
    size_bytes: 1024,
    uploaded_at: '2026-01-01T00:00:00Z',
    detection_status: 'completed',
    event_count: null,
    detected_sections_count: null,
    snapshot: null,
    marker_count: null,
    ...overrides,
  } as unknown as Session;
}

function makeMockSection(overrides: Partial<SectionRow> = {}): SectionRow {
  return {
    id: 'sec-1',
    session_id: 'sess-1',
    type: 'marker',
    start_event: 0,
    end_event: 10,
    label: 'Setup',
    snapshot: null,
    start_line: 0,
    end_line: 5,
    created_at: '2026-01-01T00:00:00Z',
    line_count: 6,
    content_hash: 'abc123',
    preview: 'First line preview',
    ...overrides,
  };
}

const MINIMAL_CAST = `{"version":3,"width":80,"height":24}\n[0.5,"o","hello"]\n`;

function makeDeps(overrides: {
  session?: Session | null;
  sections?: SectionRow[];
  castContent?: string;
} = {}): ConstructorParameters<typeof SessionService>[0] {
  const session = overrides.session !== undefined ? overrides.session : makeMockSession();
  const sections = overrides.sections ?? [];
  const castContent = overrides.castContent ?? MINIMAL_CAST;

  return {
    sessionRepository: {
      findById: vi.fn().mockResolvedValue(session),
      findAll: vi.fn(),
      findByStatuses: vi.fn(),
      create: vi.fn(),
      createWithId: vi.fn(),
      deleteById: vi.fn(),
      updateDetectionStatus: vi.fn(),
      updateSnapshot: vi.fn(),
      completeProcessing: vi.fn(),
    } as unknown as SessionAdapter,
    sectionRepository: {
      findBySessionId: vi.fn().mockResolvedValue(sections),
      create: vi.fn(),
      deleteBySessionId: vi.fn(),
      deleteById: vi.fn(),
    } as unknown as SectionAdapter,
    storageAdapter: {
      read: vi.fn().mockResolvedValue(castContent),
      write: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
    } as unknown as StorageAdapter,
    jobQueue: {
      create: vi.fn(),
      findBySessionId: vi.fn().mockResolvedValue(null),
      retry: vi.fn(),
    } as unknown as JobQueueAdapter,
    eventBus: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as EventBusAdapter,
  };
}

// ---------------------------------------------------------------------------
// getSessionMetadata tests
// ---------------------------------------------------------------------------

describe('SessionService.getSessionMetadata', () => {
  let service: SessionService;

  beforeEach(() => {
    service = new SessionService(makeDeps());
  });

  it('returns 404 when session is not found', async () => {
    service = new SessionService(makeDeps({ session: null }));
    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('returns ok with session id and filename', async () => {
    service = new SessionService(makeDeps({ sections: [] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { id: 'sess-1', filename: 'test.cast' } });
  });

  it('returns content with header and markers (no raw events)', async () => {
    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        content: expect.objectContaining({
          header: expect.anything(),
          markers: expect.any(Array),
        }),
      },
    });
  });

  it('returns SectionMetadata without snapshot field', async () => {
    service = new SessionService(makeDeps({ sections: [makeMockSection()] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: { sections: unknown[] } }).data;
    expect(data.sections).toHaveLength(1);
    expect(data.sections[0]).not.toHaveProperty('snapshot');
  });

  it('maps SectionRow fields to SectionMetadata camelCase shape', async () => {
    service = new SessionService(makeDeps({
      sections: [makeMockSection({
        id: 'sec-42',
        type: 'detected',
        label: 'My Section',
        start_event: 5,
        end_event: 15,
        start_line: 10,
        end_line: 20,
        line_count: 11,
        preview: 'First output line',
      })],
    }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        sections: [{
          id: 'sec-42',
          type: 'detected',
          label: 'My Section',
          startEvent: 5,
          endEvent: 15,
          startLine: 10,
          endLine: 20,
          lineCount: 11,
          preview: 'First output line',
        }],
      },
    });
  });

  it('handles null line_count by returning 0', async () => {
    service = new SessionService(makeDeps({ sections: [makeMockSection({ line_count: null })] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { sections: [expect.objectContaining({ lineCount: 0 })] } });
  });

  it('handles null preview by returning null', async () => {
    service = new SessionService(makeDeps({ sections: [makeMockSection({ preview: null })] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { sections: [expect.objectContaining({ preview: null })] } });
  });

  it('handles null label by returning empty string', async () => {
    service = new SessionService(makeDeps({ sections: [makeMockSection({ label: null })] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { sections: [expect.objectContaining({ label: '' })] } });
  });

  it('handles null end_event by returning 0', async () => {
    service = new SessionService(makeDeps({ sections: [makeMockSection({ end_event: null })] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { sections: [expect.objectContaining({ endEvent: 0 })] } });
  });

  it('computes totalLines as sum of all section lineCounts', async () => {
    service = new SessionService(makeDeps({
      sections: [
        makeMockSection({ id: 'sec-1', start_event: 0, end_event: 5, line_count: 10 }),
        makeMockSection({ id: 'sec-2', start_event: 6, end_event: 10, line_count: 5 }),
        makeMockSection({ id: 'sec-3', start_event: 11, end_event: 20, line_count: 8 }),
      ],
    }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { totalLines: 23 } });
  });

  it('computes sectionCount equal to sections array length', async () => {
    service = new SessionService(makeDeps({
      sections: [
        makeMockSection({ id: 'sec-1', start_event: 0, end_event: 5 }),
        makeMockSection({ id: 'sec-2', start_event: 6, end_event: 10 }),
      ],
    }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { sectionCount: 2 } });
  });

  it('returns totalLines 0 and sectionCount 0 when no sections', async () => {
    service = new SessionService(makeDeps({ sections: [] }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { totalLines: 0, sectionCount: 0 } });
  });

  it('returns detection_status from the session record', async () => {
    service = new SessionService(makeDeps({
      session: makeMockSession({ detection_status: 'pending' }),
    }));

    const result = await service.getSessionMetadata('sess-1');

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { detection_status: 'pending' } });
  });

  it('reads session file from storage to extract header and markers', async () => {
    const deps = makeDeps({ sections: [] });
    service = new SessionService(deps);

    await service.getSessionMetadata('sess-1');

    expect(deps.storageAdapter.read).toHaveBeenCalledWith('sess-1');
  });
});

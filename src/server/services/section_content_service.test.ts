// @vitest-environment node
/**
 * Unit tests for SectionContentService.
 *
 * Tests pagination, ETag generation, and 304 Not Modified behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { SectionContentService } from './section_content_service.js';
import type { SectionAdapter, SectionRow } from '../db/section_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SnapshotLine } from '#vt-wasm/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshotLine(text: string): SnapshotLine {
  return { spans: [{ text }] };
}

function makeLines(count: number): SnapshotLine[] {
  return Array.from({ length: count }, (_, i) => makeSnapshotLine(`line ${i}`));
}

function makeSection(overrides: Partial<SectionRow> = {}): SectionRow {
  const lines = overrides.snapshot
    ? JSON.parse(overrides.snapshot)
    : makeLines(10);
  const snapshot = overrides.snapshot !== undefined ? overrides.snapshot : JSON.stringify(lines);
  return {
    id: 'sect-1',
    session_id: 'sess-1',
    type: 'marker',
    start_event: 0,
    end_event: 10,
    label: 'Section 1',
    snapshot,
    start_line: 0,
    end_line: 9,
    created_at: '2026-01-01T00:00:00Z',
    line_count: lines.length,
    content_hash: 'abc123',
    preview: null,
    ...overrides,
  };
}

function makeMockSession(): SessionAdapter {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'sess-1', filename: 'test.cast' }),
  } as unknown as SessionAdapter;
}

function makeMockSectionRepo(section: SectionRow | null): SectionAdapter {
  return {
    findById: vi.fn().mockResolvedValue(section),
    create: vi.fn(),
    findBySessionId: vi.fn(),
    deleteBySessionId: vi.fn(),
    deleteById: vi.fn(),
  } as unknown as SectionAdapter;
}

function makeService(section: SectionRow | null = makeSection(), sessionExists = true) {
  const sessionRepo = makeMockSession();
  if (!sessionExists) {
    (sessionRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  }
  const sectionRepo = makeMockSectionRepo(section);
  return new SectionContentService({ sessionRepository: sessionRepo, sectionRepository: sectionRepo });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionContentService.getSectionContent', () => {
  it('returns 404 when session does not exist', async () => {
    const service = makeService(null, false);
    const result = await service.getSectionContent('sess-missing', 'sect-1', {});
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('returns 404 when section does not exist', async () => {
    const service = makeService(null);
    const result = await service.getSectionContent('sess-1', 'sect-missing', {});
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('returns 404 when section belongs to a different session', async () => {
    const section = makeSection({ session_id: 'other-session' });
    const service = makeService(section);
    const result = await service.getSectionContent('sess-1', 'sect-1', {});
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('returns section content page with defaults when no params', async () => {
    const lines = makeLines(10);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 10 });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', {});

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        sectionId: 'sect-1',
        totalLines: 10,
        offset: 0,
        hasMore: false,
      },
    });
  });

  it('applies offset and limit for pagination', async () => {
    const lines = makeLines(20);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 20 });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', { offset: 5, limit: 5 });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        offset: 5,
        limit: 5,
        hasMore: true,
      },
    });
    expect((result as { ok: true; data: { lines: unknown[] } }).data.lines).toHaveLength(5);
  });

  it('sets hasMore=false when page reaches end of content', async () => {
    const lines = makeLines(10);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 10 });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', { offset: 8, limit: 5 });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { hasMore: false } });
    expect((result as { ok: true; data: { lines: unknown[] } }).data.lines).toHaveLength(2);
  });

  it('handles limit="all" sentinel to return entire section', async () => {
    const lines = makeLines(15);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 15 });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', { limit: 'all' });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { limit: 'all', hasMore: false } });
    expect((result as { ok: true; data: { lines: unknown[] } }).data.lines).toHaveLength(15);
  });

  it('returns contentHash from section row when available', async () => {
    const section = makeSection({ content_hash: 'deadbeef12345678' });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', {});

    expect(result).toMatchObject({ ok: true, data: { contentHash: 'deadbeef12345678' } });
  });

  it('handles null snapshot as empty section', async () => {
    const section = makeSection({ snapshot: null, line_count: 0 });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', {});

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { totalLines: 0, hasMore: false } });
    expect((result as { ok: true; data: { lines: unknown[] } }).data.lines).toHaveLength(0);
  });

  it('returns 304 data when ETag matches', async () => {
    const section = makeSection({ content_hash: 'abc123' });
    const service = makeService(section);
    const etag = '"abc123"';

    const result = await service.getSectionContent('sess-1', 'sect-1', { ifNoneMatch: etag });

    expect(result).toMatchObject({ ok: false, status: 304 });
  });

  it('returns content when ETag does not match', async () => {
    const section = makeSection({ content_hash: 'abc123' });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', { ifNoneMatch: '"stale"' });

    expect(result.ok).toBe(true);
  });

  it('returns correct totalLines value', async () => {
    const lines = makeLines(42);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 42 });
    const service = makeService(section);

    const result = await service.getSectionContent('sess-1', 'sect-1', { limit: 10 });

    expect(result).toMatchObject({ ok: true, data: { totalLines: 42 } });
  });
});

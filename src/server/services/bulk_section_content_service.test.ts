// @vitest-environment node
/**
 * Unit tests for BulkSectionContentService.
 *
 * Tests bulk content retrieval, BULK_MAX_SECTIONS enforcement,
 * and delegation to per-section content logic.
 */

import { describe, it, expect, vi } from 'vitest';
import { BulkSectionContentService } from './bulk_section_content_service.js';
import type { SectionAdapter, SectionRow } from '../db/section_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SnapshotLine } from '#vt-wasm/types';
import { BULK_MAX_SECTIONS } from '../../shared/constants.js';

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
  const lines = makeLines(5);
  return {
    id: 'sect-1',
    session_id: 'sess-1',
    type: 'marker',
    start_event: 0,
    end_event: 5,
    label: 'Section 1',
    snapshot: JSON.stringify(lines),
    start_line: 0,
    end_line: 4,
    created_at: '2026-01-01T00:00:00Z',
    line_count: 5,
    content_hash: 'abc123',
    preview: null,
    ...overrides,
  };
}

function makeMockSessionRepo(exists = true): SessionAdapter {
  return {
    findById: vi.fn().mockResolvedValue(
      exists ? { id: 'sess-1', filename: 'test.cast' } : null
    ),
  } as unknown as SessionAdapter;
}

function makeMockSectionRepo(sections: SectionRow[]): SectionAdapter {
  return {
    findBySessionId: vi.fn().mockResolvedValue(sections),
    findById: vi.fn(),
    create: vi.fn(),
    deleteBySessionId: vi.fn(),
    deleteById: vi.fn(),
  } as unknown as SectionAdapter;
}

function makeService(sections: SectionRow[], sessionExists = true) {
  const sessionRepo = makeMockSessionRepo(sessionExists);
  const sectionRepo = makeMockSectionRepo(sections);
  return new BulkSectionContentService({ sessionRepository: sessionRepo, sectionRepository: sectionRepo });
}

type OkResult = { ok: true; data: { sections: Record<string, unknown> } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BulkSectionContentService.getBulkSectionContent', () => {
  it('returns 404 when session does not exist', async () => {
    const service = makeService([], false);
    const result = await service.getBulkSectionContent('sess-missing');
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('returns 413 when session has more sections than BULK_MAX_SECTIONS', async () => {
    const sections = Array.from({ length: BULK_MAX_SECTIONS + 1 }, (_, i) =>
      makeSection({ id: `sect-${i}` })
    );
    const service = makeService(sections);
    const result = await service.getBulkSectionContent('sess-1');
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('returns empty sections map when session has no sections', async () => {
    const service = makeService([]);
    const result = await service.getBulkSectionContent('sess-1');
    expect(result).toMatchObject({ ok: true, data: { sections: {} } });
  });

  it('returns content for each section keyed by section id', async () => {
    const sect1 = makeSection({ id: 'sect-1', content_hash: 'hash1' });
    const sect2 = makeSection({ id: 'sect-2', content_hash: 'hash2' });
    const service = makeService([sect1, sect2]);

    const result = await service.getBulkSectionContent('sess-1');

    expect(result.ok).toBe(true);
    const { data } = result as OkResult;
    expect(Object.keys(data.sections)).toEqual(['sect-1', 'sect-2']);
    expect(data.sections['sect-1']).toMatchObject({ sectionId: 'sect-1' });
    expect(data.sections['sect-2']).toMatchObject({ sectionId: 'sect-2' });
  });

  it('includes full content (limit=all) for each section by default', async () => {
    const lines = makeLines(10);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 10 });
    const service = makeService([section]);

    const result = await service.getBulkSectionContent('sess-1');

    expect(result).toMatchObject({
      ok: true,
      data: { sections: { 'sect-1': { limit: 'all', hasMore: false, totalLines: 10 } } },
    });
    const { data } = result as OkResult;
    expect((data.sections['sect-1'] as { lines: unknown[] }).lines).toHaveLength(10);
  });

  it('returns correct totalLines per section', async () => {
    const lines = makeLines(7);
    const section = makeSection({ snapshot: JSON.stringify(lines), line_count: 7 });
    const service = makeService([section]);

    const result = await service.getBulkSectionContent('sess-1');

    expect(result).toMatchObject({
      ok: true,
      data: { sections: { 'sect-1': { totalLines: 7 } } },
    });
  });

  it('handles null snapshot as empty section content', async () => {
    const section = makeSection({ snapshot: null, line_count: 0 });
    const service = makeService([section]);

    const result = await service.getBulkSectionContent('sess-1');

    expect(result).toMatchObject({
      ok: true,
      data: { sections: { 'sect-1': { totalLines: 0, hasMore: false } } },
    });
    const { data } = result as OkResult;
    expect((data.sections['sect-1'] as { lines: unknown[] }).lines).toHaveLength(0);
  });

  it('accepts exactly BULK_MAX_SECTIONS sections without error', async () => {
    const sections = Array.from({ length: BULK_MAX_SECTIONS }, (_, i) =>
      makeSection({ id: `sect-${i}` })
    );
    const service = makeService(sections);

    const result = await service.getBulkSectionContent('sess-1');

    expect(result.ok).toBe(true);
  });

  it('sets contentHash from section row in each page', async () => {
    const section = makeSection({ content_hash: 'deadbeef' });
    const service = makeService([section]);

    const result = await service.getBulkSectionContent('sess-1');

    expect(result).toMatchObject({
      ok: true,
      data: { sections: { 'sect-1': { contentHash: 'deadbeef' } } },
    });
  });
});

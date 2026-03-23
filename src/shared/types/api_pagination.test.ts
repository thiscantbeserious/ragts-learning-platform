/**
 * Tests for virtual scrolling pagination types and constants.
 *
 * Covers structural validation of SessionMetadataResponse, SectionMetadata,
 * SectionContentPage, BulkSectionContentResponse, and shared constants.
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  SMALL_SESSION_THRESHOLD,
  DEFAULT_SECTION_PAGE_LIMIT,
  BULK_MAX_SECTIONS,
} from '../constants.js';
import type {
  SectionMetadata,
  SectionContentPage,
  BulkSectionContentResponse,
  SessionMetadataResponse,
} from './api.js';

describe('shared constants', () => {
  describe('SMALL_SESSION_THRESHOLD', () => {
    it('equals 5', () => {
      expect(SMALL_SESSION_THRESHOLD).toBe(5);
    });

    it('is a positive integer', () => {
      expect(Number.isInteger(SMALL_SESSION_THRESHOLD)).toBe(true);
      expect(SMALL_SESSION_THRESHOLD).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_SECTION_PAGE_LIMIT', () => {
    it('equals 500', () => {
      expect(DEFAULT_SECTION_PAGE_LIMIT).toBe(500);
    });

    it('is a positive integer', () => {
      expect(Number.isInteger(DEFAULT_SECTION_PAGE_LIMIT)).toBe(true);
      expect(DEFAULT_SECTION_PAGE_LIMIT).toBeGreaterThan(0);
    });
  });

  describe('BULK_MAX_SECTIONS', () => {
    it('equals 200', () => {
      expect(BULK_MAX_SECTIONS).toBe(200);
    });

    it('is a positive integer', () => {
      expect(Number.isInteger(BULK_MAX_SECTIONS)).toBe(true);
      expect(BULK_MAX_SECTIONS).toBeGreaterThan(0);
    });

    it('is greater than SMALL_SESSION_THRESHOLD', () => {
      expect(BULK_MAX_SECTIONS).toBeGreaterThan(SMALL_SESSION_THRESHOLD);
    });
  });
});

describe('SectionMetadata shape', () => {
  it('accepts a valid CLI section metadata object', () => {
    const meta: SectionMetadata = {
      id: 'sec_abc123',
      type: 'marker',
      label: 'Initial setup',
      startEvent: 0,
      endEvent: 42,
      startLine: 0,
      endLine: 19,
      lineCount: 20,
      preview: null,
    };
    expect(meta.id).toBe('sec_abc123');
    expect(meta.type).toBe('marker');
    expect(meta.lineCount).toBe(20);
    expect(meta.preview).toBeNull();
  });

  it('accepts a TUI section metadata with null line range and non-null preview', () => {
    const meta: SectionMetadata = {
      id: 'sec_tui01',
      type: 'detected',
      label: 'TUI editor session',
      startEvent: 100,
      endEvent: 200,
      startLine: null,
      endLine: null,
      lineCount: 80,
      preview: 'First line of output',
    };
    expect(meta.startLine).toBeNull();
    expect(meta.endLine).toBeNull();
    expect(meta.preview).toBe('First line of output');
  });

  it('does not include a snapshot field', () => {
    const meta: SectionMetadata = {
      id: 'sec_x',
      type: 'detected',
      label: 'Some section',
      startEvent: 0,
      endEvent: 10,
      startLine: 0,
      endLine: 5,
      lineCount: 6,
      preview: null,
    };
    // snapshot must not be present — use type assertion to confirm key absence
    expect('snapshot' in meta).toBe(false);
  });
});

describe('SectionContentPage shape', () => {
  it('accepts a valid paginated page', () => {
    const page: SectionContentPage = {
      sectionId: 'sec_abc123',
      lines: [{ spans: [{ text: 'hello world' }] }],
      totalLines: 100,
      offset: 0,
      limit: 500,
      hasMore: true,
      contentHash: 'a1b2c3d4e5f67890',
    };
    expect(page.sectionId).toBe('sec_abc123');
    expect(page.lines).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });

  it('accepts limit as a number', () => {
    const page: SectionContentPage = {
      sectionId: 'sec_x',
      lines: [],
      totalLines: 0,
      offset: 0,
      limit: 500,
      hasMore: false,
      contentHash: 'deadbeef00000000',
    };
    expect(typeof page.limit).toBe('number');
  });

  it('accepts limit as the string sentinel "all"', () => {
    const page: SectionContentPage = {
      sectionId: 'sec_x',
      lines: [],
      totalLines: 0,
      offset: 0,
      limit: 'all',
      hasMore: false,
      contentHash: 'deadbeef00000000',
    };
    expect(page.limit).toBe('all');
  });

  it('represents an empty out-of-range page correctly', () => {
    const page: SectionContentPage = {
      sectionId: 'sec_x',
      lines: [],
      totalLines: 50,
      offset: 9999,
      limit: 500,
      hasMore: false,
      contentHash: 'deadbeef00000000',
    };
    expect(page.lines).toHaveLength(0);
    expect(page.hasMore).toBe(false);
    expect(page.offset).toBe(9999);
  });
});

describe('BulkSectionContentResponse shape', () => {
  it('accepts a valid bulk response with multiple section entries', () => {
    const bulk: BulkSectionContentResponse = {
      sections: {
        sec_a: {
          sectionId: 'sec_a',
          lines: [],
          totalLines: 10,
          offset: 0,
          limit: 500,
          hasMore: false,
          contentHash: 'aabbccdd00000000',
        },
        sec_b: {
          sectionId: 'sec_b',
          lines: [{ spans: [{ text: 'output line' }] }],
          totalLines: 1,
          offset: 0,
          limit: 500,
          hasMore: false,
          contentHash: '1122334455667788',
        },
      },
    };
    expect(Object.keys(bulk.sections)).toHaveLength(2);
    expect(bulk.sections['sec_a']?.hasMore).toBe(false);
    expect(bulk.sections['sec_b']?.lines).toHaveLength(1);
  });

  it('accepts an empty sections map', () => {
    const bulk: BulkSectionContentResponse = { sections: {} };
    expect(Object.keys(bulk.sections)).toHaveLength(0);
  });
});

describe('SessionMetadataResponse shape', () => {
  it('accepts a valid metadata-only session response', () => {
    const resp: SessionMetadataResponse = {
      id: 'sess_xyz',
      filename: 'my-session.cast',
      content: {
        header: {
          version: 2,
          width: 220,
          height: 50,
        },
        markers: [],
      },
      sections: [],
      detection_status: 'completed',
      totalLines: 0,
      sectionCount: 0,
    };
    expect(resp.id).toBe('sess_xyz');
    expect(resp.sectionCount).toBe(0);
    expect(resp.totalLines).toBe(0);
  });

  it('includes sections as SectionMetadata array (no snapshot field)', () => {
    const resp: SessionMetadataResponse = {
      id: 'sess_abc',
      filename: 'large.cast',
      content: {
        header: { version: 2, width: 220, height: 50 },
        markers: [],
      },
      sections: [
        {
          id: 'sec_1',
          type: 'marker',
          label: 'Setup',
          startEvent: 0,
          endEvent: 10,
          startLine: 0,
          endLine: 4,
          lineCount: 5,
          preview: null,
        },
      ],
      detection_status: 'completed',
      totalLines: 5,
      sectionCount: 1,
    };
    expect(resp.sections).toHaveLength(1);
    expect(resp.totalLines).toBe(5);
    expect(resp.sectionCount).toBe(1);
    // Confirm the section metadata does NOT have a snapshot
    const sec = resp.sections[0]!;
    expect('snapshot' in sec).toBe(false);
  });

  it('does not include a top-level snapshot field', () => {
    const resp: SessionMetadataResponse = {
      id: 'sess_x',
      filename: 'test.cast',
      content: { header: { version: 2, width: 80, height: 24 }, markers: [] },
      sections: [],
      detection_status: 'pending',
      totalLines: 0,
      sectionCount: 0,
    };
    expect('snapshot' in resp).toBe(false);
  });
});

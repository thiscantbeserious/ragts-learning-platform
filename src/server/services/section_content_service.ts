/**
 * SectionContentService: paginated per-section terminal content.
 *
 * Fetches a page of terminal snapshot lines for a single section, with
 * ETag-based 304 Not Modified support for efficient client caching.
 *
 * Connections: SectionAdapter (db/), SessionAdapter (db/).
 */

import type { SectionAdapter } from '../db/section_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SectionContentPage } from '../../shared/types/api.js';
import type { SnapshotLine } from '#vt-wasm/types';
import { DEFAULT_SECTION_PAGE_LIMIT } from '../../shared/constants.js';
import { parseSnapshotLines } from '../utils/snapshot_lines.js';

export interface SectionContentServiceDeps {
  sessionRepository: SessionAdapter;
  sectionRepository: SectionAdapter;
}

/** Query parameters for a section content request. */
export interface SectionContentQuery {
  offset?: number;
  limit?: number | 'all';
  ifNoneMatch?: string;
}

export type SectionContentResult =
  | { ok: true; data: SectionContentPage; etag: string }
  | { ok: false; status: 304 | 404 | 500; error: string };

/**
 * Service for fetching paginated terminal snapshot lines for a single section.
 * Validates session and section ownership before returning content.
 */
export class SectionContentService {
  private readonly sessionRepository: SessionAdapter;
  private readonly sectionRepository: SectionAdapter;

  constructor(deps: SectionContentServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.sectionRepository = deps.sectionRepository;
  }

  /**
   * Fetch a page of terminal lines for the given section.
   * Returns 304 when the client's ETag matches the section's content hash.
   * Returns 404 when the session or section is not found, or ownership mismatch.
   */
  async getSectionContent(
    sessionId: string,
    sectionId: string,
    query: SectionContentQuery
  ): Promise<SectionContentResult> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    const section = await this.sectionRepository.findById(sectionId);
    if (section?.session_id !== sessionId) {
      return { ok: false, status: 404, error: 'Section not found' };
    }

    const contentHash = section.content_hash ?? 'unknown';
    const etag = `"${contentHash}"`;

    if (query.ifNoneMatch && query.ifNoneMatch === etag) {
      return { ok: false, status: 304, error: 'Not Modified' };
    }

    const lines = parseSnapshotLines(section.snapshot);
    const totalLines = lines.length;
    const page = buildPage(sectionId, lines, totalLines, contentHash, query);

    return { ok: true, data: page, etag };
  }
}


/** Build a SectionContentPage from parsed lines and query params. */
function buildPage(
  sectionId: string,
  lines: SnapshotLine[],
  totalLines: number,
  contentHash: string,
  query: SectionContentQuery
): SectionContentPage {
  const offset = query.offset ?? 0;
  const limit = query.limit ?? DEFAULT_SECTION_PAGE_LIMIT;

  if (limit === 'all') {
    return {
      sectionId,
      lines: lines.slice(offset),
      totalLines,
      offset,
      limit: 'all',
      hasMore: false,
      contentHash,
    };
  }

  const sliced = lines.slice(offset, offset + limit);
  const hasMore = offset + limit < totalLines;

  return {
    sectionId,
    lines: sliced,
    totalLines,
    offset,
    limit,
    hasMore,
    contentHash,
  };
}

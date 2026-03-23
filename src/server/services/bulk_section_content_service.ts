/**
 * BulkSectionContentService: all-sections content in a single response.
 *
 * Fetches full terminal snapshot lines for every section in a session,
 * returning a Record keyed by section ID. Enforces BULK_MAX_SECTIONS to
 * prevent oversized responses for large sessions.
 *
 * Connections: SectionAdapter (db/), SessionAdapter (db/).
 */

import type { SectionAdapter } from '../db/section_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { BulkSectionContentResponse, SectionContentPage } from '../../shared/types/api.js';
import { BULK_MAX_SECTIONS } from '../../shared/constants.js';
import { parseSnapshotLines } from '../utils/snapshot_lines.js';

export interface BulkSectionContentServiceDeps {
  sessionRepository: SessionAdapter;
  sectionRepository: SectionAdapter;
}

export type BulkSectionContentResult =
  | { ok: true; data: BulkSectionContentResponse }
  | { ok: false; status: 404 | 413 | 500; error: string };

/**
 * Service for fetching all section content for a session in one response.
 * Rejects sessions exceeding BULK_MAX_SECTIONS with a 413 status.
 */
export class BulkSectionContentService {
  private readonly sessionRepository: SessionAdapter;
  private readonly sectionRepository: SectionAdapter;

  constructor(deps: BulkSectionContentServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.sectionRepository = deps.sectionRepository;
  }

  /**
   * Fetch all section content pages for the given session.
   * Returns 404 when the session is not found.
   * Returns 413 when section count exceeds BULK_MAX_SECTIONS.
   */
  async getBulkSectionContent(sessionId: string): Promise<BulkSectionContentResult> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    const sections = await this.sectionRepository.findBySessionId(sessionId);

    if (sections.length > BULK_MAX_SECTIONS) {
      return {
        ok: false,
        status: 413,
        error: `Session has ${sections.length} sections; bulk endpoint supports at most ${BULK_MAX_SECTIONS}`,
      };
    }

    const result: Record<string, SectionContentPage> = {};
    for (const section of sections) {
      result[section.id] = buildFullPage(section.id, section.snapshot, section.content_hash);
    }

    return { ok: true, data: { sections: result } };
  }
}


/** Build a full-content SectionContentPage (limit="all") for a single section. */
function buildFullPage(
  sectionId: string,
  snapshot: string | null,
  contentHash: string | null
): SectionContentPage {
  const lines = parseSnapshotLines(snapshot);
  return {
    sectionId,
    lines,
    totalLines: lines.length,
    offset: 0,
    limit: 'all',
    hasMore: false,
    contentHash: contentHash ?? 'unknown',
  };
}

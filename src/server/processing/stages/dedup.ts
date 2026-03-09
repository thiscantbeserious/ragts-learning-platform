/**
 * Dedup stage: scrollback deduplication and ProcessedSession construction.
 *
 * Extracted from processSessionPipeline step 4 (buildProcessedSession).
 * Pure synchronous function — no I/O, no DB calls, no WASM.
 * The orchestrator emits `session.deduped` after this stage succeeds.
 */

import type { TerminalSnapshot } from '#vt-wasm';
import type { SectionBoundary } from '../section_detector.js';
import type { EpochBoundary } from '../scrollback_dedup.js';
import type { ProcessedSession } from '../types.js';
import type { CreateSectionInput } from '../../db/section_adapter.js';
import { buildCleanDocument } from '../scrollback_dedup.js';

/**
 * Build a ProcessedSession from raw replay data.
 * Runs scrollback deduplication and constructs section inputs with line range remapping.
 * Pure function — no I/O, no DB calls, no WASM.
 */
export function dedup(
  sessionId: string,
  rawSnapshot: TerminalSnapshot,
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>,
  epochBoundaries: EpochBoundary[],
  boundaries: SectionBoundary[],
  eventCount: number
): ProcessedSession {
  const { cleanSnapshot, rawLineCountToClean } = buildCleanDocument(rawSnapshot, epochBoundaries);
  const sections = buildSections(sessionId, sectionData, boundaries, eventCount, rawSnapshot, rawLineCountToClean);

  const detectedSectionsCount = boundaries.filter(
    b => !b.signals.includes('marker')
  ).length;

  return {
    sessionId,
    snapshot: JSON.stringify(cleanSnapshot),
    sections,
    eventCount,
    detectedSectionsCount,
  };
}

/** Constructs section inputs by iterating over boundaries and remapping line counts. */
function buildSections(
  sessionId: string,
  sectionData: Array<{ lineCount: number | null; snapshot: TerminalSnapshot | null }>,
  boundaries: SectionBoundary[],
  eventCount: number,
  rawSnapshot: TerminalSnapshot,
  rawLineCountToClean: (rawLineCount: number) => number
): CreateSectionInput[] {
  const sections: CreateSectionInput[] = [];
  let previousCleanLineCount = 0;

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    const sd = sectionData[i];
    if (boundary === undefined) {
      throw new Error(`Missing boundary at index ${i} in session ${sessionId}`);
    }
    if (sd === undefined) {
      throw new Error(`Missing sectionData for boundary index ${i} in session ${sessionId}`);
    }

    const endEvent = i < boundaries.length - 1 && nextBoundary !== undefined
      ? nextBoundary.eventIndex
      : eventCount;
    const isMarker = boundary.signals.includes('marker');

    const section = buildSection(sessionId, boundary, endEvent, isMarker, {
      sd,
      rawSnapshot,
      rawLineCountToClean,
      previousCleanLineCount,
    });
    sections.push(section.input);
    previousCleanLineCount = section.nextLineCount;
  }

  return sections;
}

interface BuildSectionOptions {
  sd: { lineCount: number | null; snapshot: TerminalSnapshot | null };
  rawSnapshot: TerminalSnapshot;
  rawLineCountToClean: (rawLineCount: number) => number;
  previousCleanLineCount: number;
}

/** Builds a single section input, returning updated line count. */
function buildSection(
  sessionId: string,
  boundary: SectionBoundary,
  endEvent: number,
  isMarker: boolean,
  options: BuildSectionOptions
): { input: CreateSectionInput; nextLineCount: number } {
  const { sd, rawSnapshot, rawLineCountToClean, previousCleanLineCount } = options;
  if (sd.snapshot) {
    return {
      input: {
        sessionId,
        type: isMarker ? 'marker' : 'detected',
        startEvent: boundary.eventIndex,
        endEvent,
        label: boundary.label,
        snapshot: JSON.stringify(sd.snapshot),
        startLine: null,
        endLine: null,
      },
      nextLineCount: previousCleanLineCount,
    };
  }

  const rawEndLine = sd.lineCount ?? rawSnapshot.lines.length;
  const endLine = rawLineCountToClean(rawEndLine);
  const startLine = Math.min(previousCleanLineCount, endLine);

  return {
    input: {
      sessionId,
      type: isMarker ? 'marker' : 'detected',
      startEvent: boundary.eventIndex,
      endEvent,
      label: boundary.label,
      snapshot: null,
      startLine,
      endLine,
    },
    nextLineCount: endLine,
  };
}

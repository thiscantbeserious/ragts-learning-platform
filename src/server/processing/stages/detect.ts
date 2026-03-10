/**
 * Detect stage: runs section boundary detection on parsed events.
 *
 * Extracted from processSessionPipeline step 2 (detectBoundaries).
 * Pure synchronous function — no I/O, no DB calls, no WASM.
 * The orchestrator emits `session.detected` after this stage succeeds.
 */

import type { AsciicastEvent, Marker } from '../../../shared/types/asciicast.js';
import { SectionDetector, type SectionBoundary } from '../section_detector.js';

/** Output of the detect stage. */
export interface DetectResult {
  boundaries: SectionBoundary[];
  sectionCount: number;
}

/**
 * Detect section boundaries from events and markers.
 * Synthesizes a preamble boundary when marker-based sessions have pre-marker output.
 * Only adds preamble for marker-based sessions — auto-detected sessions skip this.
 */
export function detect(events: AsciicastEvent[], markers: Marker[]): DetectResult {
  const boundaries = detectBoundaries(events, markers);
  return { boundaries, sectionCount: boundaries.length };
}

/** Detect boundaries and optionally prepend a preamble for marker sessions. */
function detectBoundaries(events: AsciicastEvent[], markers: Marker[]): SectionBoundary[] {
  const detector = new SectionDetector(events);
  const boundaries = detector.detectWithMarkers(markers);

  const hasMarkerBoundary = boundaries.some(b => b.signals.includes('marker'));
  const firstBoundary = boundaries[0];
  if (hasMarkerBoundary && firstBoundary !== undefined && firstBoundary.eventIndex > 0) {
    if (hasPreMarkerContent(events, firstBoundary.eventIndex)) {
      boundaries.unshift({
        eventIndex: 0,
        score: Infinity,
        signals: ['preamble'],
        label: 'Preamble',
      });
    }
  }

  return boundaries;
}

/** Returns true if any output events exist before the first boundary. */
function hasPreMarkerContent(events: AsciicastEvent[], firstBoundaryIndex: number): boolean {
  return events.slice(0, firstBoundaryIndex).some(e => e[1] === 'o');
}

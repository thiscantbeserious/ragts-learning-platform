/**
 * SectionDetector - Detects section boundaries in asciicast sessions.
 *
 * Uses multiple signals to identify natural breaking points:
 * - Signal 1: Timing gaps (co-primary)
 * - Signal 2: Screen clear sequences (co-primary)
 * - Signal 3: Alternate screen transitions
 * - Signal 4: Output volume bursts (tiebreaker, requires reliable timing)
 *
 * Processing steps:
 * 1. Collect candidates from all signals
 * 2. Check timing reliability (disable timing-based signals if median gap < 0.1s)
 * 3. Merge nearby candidates (within 50 events)
 * 4. Filter by minimum section size (>= 100 events)
 * 5. Cap at maximum sections (top 50 by score)
 * 6. Generate labels
 */

import type { AsciicastEvent, Marker } from '../../shared/asciicast-types.js';

export interface SectionBoundary {
  eventIndex: number; // 0-based event index where boundary occurs
  score: number; // Confidence score (higher = stronger boundary)
  signals: string[]; // Which signals contributed
  label: string; // Auto-generated or marker label
}

interface BoundaryCandidate {
  eventIndex: number;
  score: number;
  signals: string[];
}

export class SectionDetector {
  private readonly MIN_SESSION_SIZE = 100;
  private readonly MIN_SECTION_SIZE = 100;
  private readonly MAX_SECTIONS = 50;
  private readonly MERGE_WINDOW = 50;
  private readonly TIMING_GAP_THRESHOLD = 5.0; // seconds
  private readonly TIMING_RELIABILITY_THRESHOLD = 0.1; // median gap threshold

  constructor(private events: AsciicastEvent[]) {}

  /**
   * Detect section boundaries using all available signals.
   * @param skipMinimumSize - Skip minimum section size filtering (used within marker segments)
   */
  detect(skipMinimumSize = false): SectionBoundary[] {
    // Don't process sessions that are too small
    if (this.events.length < this.MIN_SESSION_SIZE) {
      return [];
    }

    // Check timing reliability
    const timingReliable = this.isTimingReliable();

    // Collect candidates from all signals
    const candidates: BoundaryCandidate[] = [];

    if (timingReliable) {
      candidates.push(...this.detectTimingGaps());
    }

    candidates.push(...this.detectScreenClears());
    candidates.push(...this.detectAltScreenExits());

    if (timingReliable) {
      candidates.push(...this.detectVolumeBursts());
    }

    // Process candidates
    return this.processCandidates(candidates, skipMinimumSize);
  }

  /**
   * Detect boundaries with markers taking precedence.
   * Runs detection for gaps between markers and merges results.
   */
  detectWithMarkers(markers: Marker[]): SectionBoundary[] {
    // Convert markers to boundaries (they always take precedence)
    const markerBoundaries: SectionBoundary[] = markers.map((marker) => ({
      eventIndex: marker.index,
      score: Infinity, // Highest possible score
      signals: ['marker'],
      label: marker.label,
    }));

    // If no markers, just run normal detection
    if (markers.length === 0) {
      return this.detect();
    }

    // Sort markers by index
    const sortedMarkers = [...markers].sort((a, b) => a.index - b.index);

    // Detect boundaries in gaps between markers
    const detectedBoundaries: SectionBoundary[] = [];

    // Before first marker
    if (sortedMarkers[0].index > this.MIN_SECTION_SIZE) {
      const segmentEvents = this.events.slice(0, sortedMarkers[0].index);
      const segmentBoundaries = new SectionDetector(segmentEvents).detect(false);
      detectedBoundaries.push(...segmentBoundaries);
    }

    // Between markers - skip minimum size filtering within marker segments
    for (let i = 0; i < sortedMarkers.length - 1; i++) {
      const start = sortedMarkers[i].index + 1;
      const end = sortedMarkers[i + 1].index;

      // Allow smaller segments between markers (markers define the structure)
      if (end - start >= this.MIN_SESSION_SIZE) {
        const segmentEvents = this.events.slice(start, end);
        const segmentBoundaries = new SectionDetector(segmentEvents).detect(true); // Skip min size check
        // Adjust indices back to original event array
        const adjustedBoundaries = segmentBoundaries.map((b) => ({
          ...b,
          eventIndex: b.eventIndex + start,
        }));
        detectedBoundaries.push(...adjustedBoundaries);
      }
    }

    // After last marker
    const lastMarkerIndex = sortedMarkers[sortedMarkers.length - 1].index;
    if (this.events.length - lastMarkerIndex - 1 >= this.MIN_SECTION_SIZE) {
      const segmentEvents = this.events.slice(lastMarkerIndex + 1);
      const segmentBoundaries = new SectionDetector(segmentEvents).detect(false);
      const adjustedBoundaries = segmentBoundaries.map((b) => ({
        ...b,
        eventIndex: b.eventIndex + lastMarkerIndex + 1,
      }));
      detectedBoundaries.push(...adjustedBoundaries);
    }

    // Merge markers and detected boundaries
    const allBoundaries = [...markerBoundaries, ...detectedBoundaries];

    // Remove duplicates (prefer markers in conflicts)
    const uniqueBoundaries = new Map<number, SectionBoundary>();
    for (const boundary of allBoundaries) {
      const existing = uniqueBoundaries.get(boundary.eventIndex);
      if (!existing || boundary.score > existing.score) {
        uniqueBoundaries.set(boundary.eventIndex, boundary);
      }
    }

    // Sort by event index and generate labels for non-marker boundaries
    const result = Array.from(uniqueBoundaries.values()).sort(
      (a, b) => a.eventIndex - b.eventIndex
    );

    // Generate labels for detected boundaries (markers keep their labels)
    let sectionNumber = 1;
    for (const boundary of result) {
      if (!boundary.signals.includes('marker')) {
        boundary.label = `Section ${sectionNumber}`;
        sectionNumber++;
      }
    }

    return result;
  }

  /**
   * Check if timing data is reliable.
   * Returns false if median gap < 0.1s (compressed timestamps).
   */
  private isTimingReliable(): boolean {
    if (this.events.length < 2) return false;

    // Collect all timing gaps
    const gaps = this.events.map((event) => event[0]).filter((gap) => gap > 0);

    if (gaps.length === 0) return false;

    // Calculate median
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const median =
      sortedGaps.length % 2 === 0
        ? (sortedGaps[sortedGaps.length / 2 - 1] + sortedGaps[sortedGaps.length / 2]) / 2
        : sortedGaps[Math.floor(sortedGaps.length / 2)];

    return median >= this.TIMING_RELIABILITY_THRESHOLD;
  }

  /**
   * Signal 1: Detect timing gaps > threshold.
   */
  private detectTimingGaps(): BoundaryCandidate[] {
    const candidates: BoundaryCandidate[] = [];

    for (let i = 0; i < this.events.length; i++) {
      const gap = this.events[i][0];

      if (gap > this.TIMING_GAP_THRESHOLD) {
        // Score is proportional to gap size
        const score = gap / this.TIMING_GAP_THRESHOLD;
        candidates.push({
          eventIndex: i,
          score,
          signals: ['timing_gap'],
        });
      }
    }

    return candidates;
  }

  /**
   * Signal 2: Detect screen clear sequences.
   * Looks for \x1b[2J or \x1b[H\x1b[2J in output events.
   */
  private detectScreenClears(): BoundaryCandidate[] {
    const candidates: BoundaryCandidate[] = [];

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      const eventType = event[1];
      const data = event[2];

      // Only scan output events
      if (eventType === 'o' && typeof data === 'string') {
        if (data.includes('\x1b[2J')) {
          candidates.push({
            eventIndex: i,
            score: 1.0,
            signals: ['screen_clear'],
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Signal 3: Detect alternate screen exits.
   * Looks for \x1b[?1049l in output events.
   */
  private detectAltScreenExits(): BoundaryCandidate[] {
    const candidates: BoundaryCandidate[] = [];

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      const eventType = event[1];
      const data = event[2];

      // Only scan output events
      if (eventType === 'o' && typeof data === 'string') {
        if (data.includes('\x1b[?1049l')) {
          candidates.push({
            eventIndex: i,
            score: 0.8,
            signals: ['alt_screen_exit'],
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Signal 4: Detect output volume bursts after quiet periods.
   * Only active when timing is reliable.
   */
  private detectVolumeBursts(): BoundaryCandidate[] {
    const candidates: BoundaryCandidate[] = [];
    const WINDOW_SIZE = 10;
    const BURST_THRESHOLD = 5; // 5x average

    // Calculate output volume for each event
    const volumes: number[] = this.events.map((event) => {
      const data = event[2];
      return typeof data === 'string' ? data.length : 0;
    });

    // Detect bursts
    for (let i = WINDOW_SIZE; i < this.events.length; i++) {
      // Calculate average volume in preceding window
      const precedingAvg =
        volumes.slice(i - WINDOW_SIZE, i).reduce((sum, v) => sum + v, 0) / WINDOW_SIZE;

      // Check if current event is a burst
      const currentVolume = volumes[i];
      if (precedingAvg > 0 && currentVolume > precedingAvg * BURST_THRESHOLD) {
        // Check if there's also a timing gap (even if small)
        const gap = this.events[i][0];
        if (gap > 1.0) {
          // Small bonus for volume burst
          candidates.push({
            eventIndex: i,
            score: 0.3,
            signals: ['volume_burst'],
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Process candidates: merge, filter, cap, and label.
   * @param skipMinimumSize - Skip minimum section size filtering
   */
  private processCandidates(
    candidates: BoundaryCandidate[],
    skipMinimumSize = false
  ): SectionBoundary[] {
    if (candidates.length === 0) return [];

    // Sort by event index
    candidates.sort((a, b) => a.eventIndex - b.eventIndex);

    // Merge nearby candidates (within MERGE_WINDOW events)
    const merged = this.mergeCandidates(candidates);

    // Filter by minimum section size (unless skipped)
    const filtered = skipMinimumSize ? merged : this.filterByMinimumSectionSize(merged);

    // Cap at maximum sections
    const capped = this.capMaximumSections(filtered);

    // Generate labels
    return this.generateLabels(capped);
  }

  /**
   * Merge candidates within MERGE_WINDOW events, keeping higher score.
   */
  private mergeCandidates(candidates: BoundaryCandidate[]): BoundaryCandidate[] {
    if (candidates.length <= 1) return candidates;

    const merged: BoundaryCandidate[] = [];
    let current = candidates[0];

    for (let i = 1; i < candidates.length; i++) {
      const next = candidates[i];

      if (next.eventIndex - current.eventIndex <= this.MERGE_WINDOW) {
        // Merge: keep higher score
        if (next.score > current.score) {
          current = {
            eventIndex: next.eventIndex,
            score: next.score,
            signals: [...new Set([...current.signals, ...next.signals])],
          };
        } else {
          current = {
            ...current,
            signals: [...new Set([...current.signals, ...next.signals])],
          };
        }
      } else {
        // Keep current and move to next
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * Filter boundaries that would create sections < MIN_SECTION_SIZE.
   * Only filters boundaries at the start or end that would create too-small sections.
   * Middle boundaries are kept even if they create small sections (strong signals override size).
   */
  private filterByMinimumSectionSize(candidates: BoundaryCandidate[]): BoundaryCandidate[] {
    if (candidates.length === 0) return [];

    const filtered: BoundaryCandidate[] = [];

    // Check each boundary
    for (let i = 0; i < candidates.length; i++) {
      const boundary = candidates[i];

      // For first boundary: check if section from start to boundary is large enough
      if (i === 0 && boundary.eventIndex < this.MIN_SECTION_SIZE) {
        continue; // Skip first boundary if it creates too-small first section
      }

      // For last boundary: check if section from boundary to end is large enough
      if (
        i === candidates.length - 1 &&
        this.events.length - boundary.eventIndex < this.MIN_SECTION_SIZE
      ) {
        continue; // Skip last boundary if it creates too-small final section
      }

      // Middle boundaries are always kept (they have strong signals)
      filtered.push(boundary);
    }

    return filtered;
  }

  /**
   * Cap at MAX_SECTIONS, keeping top scores.
   */
  private capMaximumSections(candidates: BoundaryCandidate[]): BoundaryCandidate[] {
    if (candidates.length <= this.MAX_SECTIONS) return candidates;

    // Sort by score (descending) then by event index
    const sorted = [...candidates].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.eventIndex - b.eventIndex;
    });

    // Take top MAX_SECTIONS and re-sort by event index
    const capped = sorted.slice(0, this.MAX_SECTIONS);
    return capped.sort((a, b) => a.eventIndex - b.eventIndex);
  }

  /**
   * Generate sequential labels for boundaries.
   */
  private generateLabels(candidates: BoundaryCandidate[]): SectionBoundary[] {
    return candidates.map((candidate, index) => ({
      ...candidate,
      label: `Section ${index + 1}`,
    }));
  }
}

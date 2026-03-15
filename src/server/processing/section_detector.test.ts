// @vitest-environment node
/**
 * Tests for SectionDetector - Section boundary detection for asciicast sessions.
 *
 * Uses synthetic test data to validate detection signals:
 * - Timing gaps
 * - Screen clear sequences
 * - Alternate screen transitions
 * - Output volume bursts
 * - Marker precedence
 * - Fixture-based integration tests for Codex, Gemini, Claude sessions
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SectionDetector } from './section_detector.js';
import type { AsciicastEvent } from '../../shared/types/asciicast.js';

/**
 * Load events from a fixture .cast file.
 * First line is the header; remaining lines are events [timestamp, type, data].
 * Timestamps are deltas (asciicast v3 format).
 */
function loadFixtureEvents(fixtureName: string): AsciicastEvent[] {
  const content = readFileSync(join(process.cwd(), 'fixtures', fixtureName), 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  return lines.slice(1).map(line => JSON.parse(line) as AsciicastEvent);
}

describe('SectionDetector', () => {
  describe('basic scenarios', () => {
    it('returns empty array for sessions with < 100 events', () => {
      // Create a small session with only 50 events
      const events: AsciicastEvent[] = Array.from({ length: 50 }, (_, i) => [
        0.1,
        'o',
        `line ${i}\n`,
      ]);

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries).toEqual([]);
    });

    it('returns empty array for sessions with no detectable signals', () => {
      // Session with 200 events, no gaps, no screen clears, uniform timing
      const events: AsciicastEvent[] = Array.from({ length: 200 }, (_, i) => [
        0.1, // consistent 0.1s gaps
        'o',
        `line ${i}\n`,
      ]);

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries).toEqual([]);
    });
  });

  describe('Signal 1: Timing gaps', () => {
    it('detects boundaries at timing gaps > 5 seconds', () => {
      // Create session with clear timing gap at event 100
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'after gap\n'] as AsciicastEvent, // 10s gap at index 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('timing_gap');
      expect(boundaries[0]!.score).toBeGreaterThan(0);
    });

    it('falls back to other signals when timing is compressed (median < 0.1s)', () => {
      // All timestamps are 0.01s - timing data is unreliable
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.01, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.01, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 100
        ...Array.from({ length: 100 }, (_, i) => [0.01, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should detect the screen clear, not timing
      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('screen_clear');
      expect(boundaries[0]!.signals).not.toContain('timing_gap');
    });
  });

  describe('Signal 2: Screen clear sequences', () => {
    it('detects \\x1b[2J (clear screen)', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // clear screen at 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('screen_clear');
    });

    it('detects \\x1b[H\\x1b[2J (home + clear screen)', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[H\x1b[2J'] as AsciicastEvent, // home + clear at 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('screen_clear');
    });
  });

  describe('Signal 3: Alternate screen transitions', () => {
    it('detects \\x1b[?1049l (exit alternate screen)', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[?1049l'] as AsciicastEvent, // exit alt screen at 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('alt_screen_exit');
    });
  });

  describe('Signal 4: Output volume burst', () => {
    it('promotes timing gaps when they coincide with volume bursts', () => {
      // Small gap (below threshold) + volume burst
      const events: AsciicastEvent[] = [
        // Quiet period: small outputs
        ...Array.from({ length: 100 }, () => [0.1, 'o', 'x'] as AsciicastEvent),
        // Small timing gap + volume burst
        [3.0, 'o', 'x'.repeat(1000)] as AsciicastEvent, // event 100: 3s gap + large output
        ...Array.from({ length: 100 }, () => [0.1, 'o', 'x'.repeat(500)] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // The 3s gap alone might not be enough, but with volume burst it should be detected
      expect(boundaries.length).toBeGreaterThan(0);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('volume_burst');
    });

    it('does not activate when timing is unreliable', () => {
      // Compressed timestamps (median < 0.1s) - volume burst should be ignored
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, () => [0.01, 'o', 'x'] as AsciicastEvent),
        [0.01, 'o', 'x'.repeat(1000)] as AsciicastEvent, // volume burst but compressed timing
        ...Array.from({ length: 100 }, () => [0.01, 'o', 'x'] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should not detect volume burst when timing is unreliable
      const hasVolumeBurst = boundaries.some((b) => b.signals.includes('volume_burst'));
      expect(hasVolumeBurst).toBe(false);
    });
  });

  describe('boundary merging', () => {
    it('merges candidates within 50 events, keeping higher score', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'after gap\n'] as AsciicastEvent, // timing gap at 100
        ...Array.from({ length: 20 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 121 (within 50 events of 100)
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should merge into one boundary (keeping the higher-scoring one)
      expect(boundaries.length).toBe(1);
    });

    it('merges candidates within 50 events, keeping later boundary when it has higher score', () => {
      // screen_clear at 100 (lower score), then large timing gap at 110 (higher score)
      // Both within 50 events → merge; next.score > current.score → next wins
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 100 (lower score)
        ...Array.from({ length: 9 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [15.0, 'o', 'large gap\n'] as AsciicastEvent, // timing gap at 110 (higher score)
        ...Array.from({ length: 150 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Merged into one boundary; higher-scoring (timing gap) wins position
      expect(boundaries.length).toBe(1);
      // The merged boundary should have the timing_gap signal (higher scorer kept)
      expect(boundaries[0]!.signals).toContain('timing_gap');
    });

    it('merges candidates within 50 events, keeping first when scores are equal', () => {
      // Two screen clears close together (same signal type = same score)
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 100
        ...Array.from({ length: 10 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 111 (within 50 events of 100)
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should merge into one boundary (scores are equal, first wins, signals merged)
      expect(boundaries.length).toBe(1);
      // Both screen_clear signals should be merged
      expect(boundaries[0]!.signals.filter(s => s === 'screen_clear').length).toBe(1);
    });

    it('keeps separate boundaries when > 50 events apart', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'after gap\n'] as AsciicastEvent, // timing gap at 100
        ...Array.from({ length: 60 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 161 (> 50 events from 100)
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should keep both boundaries
      expect(boundaries.length).toBe(2);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[1]!.eventIndex).toBe(161);
    });
  });

  describe('minimum section size', () => {
    it('drops boundaries that would create sections < 100 events', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 50 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'gap\n'] as AsciicastEvent, // boundary at 50 - would create 50-event section (too small)
        ...Array.from({ length: 150 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should drop the boundary at 50 because it creates a section < 100 events
      expect(boundaries).toEqual([]);
    });

    it('keeps boundaries that create sections >= 100 events', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 120 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'gap\n'] as AsciicastEvent, // boundary at 120 - creates 120-event section (OK)
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(120);
    });

    it('drops last boundary when it creates too-small trailing section', () => {
      // Boundary at 120, total 160 events: trailing section is 40 events (< 100 MIN_SECTION_SIZE)
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 120 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'gap\n'] as AsciicastEvent, // boundary at 120
        ...Array.from({ length: 39 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should drop the boundary because trailing section (39 events) is < 100
      expect(boundaries).toEqual([]);
    });
  });

  describe('maximum sections', () => {
    it('caps at 50 boundaries, keeping top scores', () => {
      // Create 60 boundaries with varying scores
      // Use large gaps: events 0, 200, 400, ..., 11800 (60 boundaries)
      const events: AsciicastEvent[] = [];
      for (let i = 0; i < 60; i++) {
        // Add 150 events per section (enough for minimum size)
        events.push(...Array.from({ length: 150 }, (_, j) => [0.1, 'o', `line ${i}-${j}\n`] as AsciicastEvent));
        // Add a strong boundary (10s gap)
        if (i < 59) {
          events.push([10.0 + i * 0.1, 'o', 'gap\n'] as AsciicastEvent); // Vary scores slightly
        }
      }

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should cap at 50 boundaries
      expect(boundaries.length).toBe(50);
      // Should keep top 50 scores (2.18 to 3.18)
      expect(boundaries[0]!.score).toBeGreaterThanOrEqual(2.18);
      expect(boundaries[boundaries.length - 1]!.score).toBeGreaterThanOrEqual(2.18);
      // Should be sorted by eventIndex (for rendering)
      for (let i = 1; i < boundaries.length; i++) {
        expect(boundaries[i]!.eventIndex).toBeGreaterThan(boundaries[i - 1]!.eventIndex);
      }
    });
  });

  describe('label generation', () => {
    it('generates sequential labels for detected boundaries', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 120 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'gap\n'] as AsciicastEvent,
        ...Array.from({ length: 120 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'gap\n'] as AsciicastEvent,
        ...Array.from({ length: 120 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(2);
      expect(boundaries[0]!.label).toBe('Section 1');
      expect(boundaries[1]!.label).toBe('Section 2');
    });
  });

  describe('isTimingReliable() — relaxed presence check', () => {
    it('returns true when events have at least one significant gap (>= 0.5s)', () => {
      // Gaps: [0.0, 0.0, 0.0, 2.0, 0.0, 0.0] — one significant gap among fast ticks
      // Must use >= 100 events to avoid MIN_SESSION_SIZE early return; we test via detect()
      // Use a simpler approach: create 100 events where only one gap > 0.5s
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 50 }, () => [0.0, 'o', 'x'] as AsciicastEvent),
        [2.0, 'o', 'significant gap'] as AsciicastEvent,
        ...Array.from({ length: 149 }, () => [0.0, 'o', 'x'] as AsciicastEvent),
        // Place a timing gap > 5s so timing detection fires if timing is deemed reliable
        [10.0, 'o', 'big gap'] as AsciicastEvent,
        ...Array.from({ length: 100 }, () => [0.0, 'o', 'x'] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // If isTimingReliable returns true, timing gap at index 300 should be detected
      expect(boundaries.some(b => b.signals.includes('timing_gap'))).toBe(true);
    });

    it('returns false (no timing boundaries) when all gaps are < 0.01s', () => {
      // All gaps are truly compressed — no significant pauses at all
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, () => [0.005, 'o', 'x'] as AsciicastEvent),
        [0.005, 'o', 'still compressed'] as AsciicastEvent,
        ...Array.from({ length: 100 }, () => [0.005, 'o', 'x'] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // No timing_gap boundaries when timing is unreliable
      expect(boundaries.every(b => !b.signals.includes('timing_gap'))).toBe(true);
    });
  });

  describe('Signal 5: Erase to end of display (ESC[J / ESC[0J)', () => {
    it('detects \\x1b[J as boundary with score 0.8 and signal erase_to_end', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[J'] as AsciicastEvent, // erase to end at 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('erase_to_end');
      expect(boundaries[0]!.score).toBeCloseTo(0.8);
    });

    it('detects \\x1b[0J as boundary with signal erase_to_end', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[0J'] as AsciicastEvent, // erase to end (explicit 0) at 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.signals).toContain('erase_to_end');
    });

    it('does NOT fire on events containing \\x1b[2J (handled by screen_clear)', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // full screen clear — not erase_to_end
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Should detect via screen_clear signal, NOT erase_to_end
      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.signals).toContain('screen_clear');
      expect(boundaries[0]!.signals).not.toContain('erase_to_end');
    });

    it('does NOT fire on events containing \\x1b[3J', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[3J'] as AsciicastEvent, // erase scrollback — not erase_to_end
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // ESC[3J is not detected by any current signal (no screen_clear, no erase_to_end)
      expect(boundaries.every(b => !b.signals.includes('erase_to_end'))).toBe(true);
    });

    it('does NOT fire on non-output events', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'i', '\x1b[J'] as AsciicastEvent, // input event — should be ignored
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i + 100}\n`] as AsciicastEvent),
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // No erase_to_end detected from input event
      expect(boundaries.every(b => !b.signals.includes('erase_to_end'))).toBe(true);
    });
  });

  describe('markers take precedence', () => {
    it('uses marker positions as fixed boundaries', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 150 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        ...Array.from({ length: 150 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      // Define markers at positions 100 and 200
      const markers = [
        { time: 10.0, label: 'Marker 1', index: 100 },
        { time: 20.0, label: 'Marker 2', index: 200 },
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detectWithMarkers(markers);

      expect(boundaries.length).toBe(2);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.label).toBe('Marker 1');
      expect(boundaries[1]!.eventIndex).toBe(200);
      expect(boundaries[1]!.label).toBe('Marker 2');
    });

    it('runs detection between markers', () => {
      const events: AsciicastEvent[] = [
        // Section 1: 0-99
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        // Marker at 100
        [0.1, 'm', 'Marker A'] as AsciicastEvent,
        // Section 2: 101-199 (with screen clear at 150)
        ...Array.from({ length: 50 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [0.1, 'o', '\x1b[2J'] as AsciicastEvent, // screen clear at 151
        ...Array.from({ length: 50 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        // Marker at 202
        [0.1, 'm', 'Marker B'] as AsciicastEvent,
        // Section 3: 203+
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      const markers = [
        { time: 10.0, label: 'Marker A', index: 100 },
        { time: 20.2, label: 'Marker B', index: 202 },
      ];

      const detector = new SectionDetector(events);
      const boundaries = detector.detectWithMarkers(markers);

      // Should have markers + detected screen clear
      expect(boundaries.length).toBeGreaterThan(2);
      // Markers should be present
      expect(boundaries.some((b) => b.label === 'Marker A')).toBe(true);
      expect(boundaries.some((b) => b.label === 'Marker B')).toBe(true);
      // Screen clear should be detected between markers
      expect(boundaries.some((b) => b.eventIndex === 151)).toBe(true);
    });

    it('markers override detected boundaries in conflicts', () => {
      const events: AsciicastEvent[] = [
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
        [10.0, 'o', 'gap\n'] as AsciicastEvent, // timing gap at 100
        ...Array.from({ length: 100 }, (_, i) => [0.1, 'o', `line ${i}\n`] as AsciicastEvent),
      ];

      // Marker at same position as detected boundary
      const markers = [{ time: 10.0, label: 'Manual Marker', index: 100 }];

      const detector = new SectionDetector(events);
      const boundaries = detector.detectWithMarkers(markers);

      // Should only have the marker boundary (marker wins)
      expect(boundaries.length).toBe(1);
      expect(boundaries[0]!.eventIndex).toBe(100);
      expect(boundaries[0]!.label).toBe('Manual Marker');
    });
  });

  describe('Fixture integration tests', () => {
    it('codex-medium: detects boundaries via erase_to_end signal (3-20 boundaries)', () => {
      const events = loadFixtureEvents('codex-medium.cast');
      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Codex uses ESC[J (erase to end) for redraw — should detect 3-20 sections
      expect(boundaries.length).toBeGreaterThanOrEqual(3);
      expect(boundaries.length).toBeLessThanOrEqual(20);

      // At least one boundary must have the erase_to_end signal
      const hasEraseToEnd = boundaries.some(b => b.signals.includes('erase_to_end'));
      expect(hasEraseToEnd).toBe(true);
    });

    it('gemini-medium: detects at least one boundary via timing_gap signal', () => {
      const events = loadFixtureEvents('gemini-medium.cast');
      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Gemini has large timing gaps (up to 13640s) between user interactions.
      // Most gaps cluster at event indices 2-42 and 642-670, which are near session
      // start/end and get filtered by MIN_SECTION_SIZE=100. At least one boundary
      // at index ~232 (42.7s gap) survives the filter in the middle section.
      expect(boundaries.length).toBeGreaterThanOrEqual(1);
      expect(boundaries.length).toBeLessThanOrEqual(20);

      // At least one boundary must have the timing_gap signal
      const hasTimingGap = boundaries.some(b => b.signals.includes('timing_gap'));
      expect(hasTimingGap).toBe(true);
    });

    it('claude-medium: preserves screen_clear detection (regression guard)', () => {
      const events = loadFixtureEvents('claude-medium.cast');
      const detector = new SectionDetector(events);
      const boundaries = detector.detect();

      // Claude uses ESC[2J for screen clears — existing behavior must be preserved
      expect(boundaries.length).toBeGreaterThanOrEqual(1);
      const hasScreenClear = boundaries.some(b => b.signals.includes('screen_clear'));
      expect(hasScreenClear).toBe(true);
    });
  });
});

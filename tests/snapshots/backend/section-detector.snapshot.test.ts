/**
 * Snapshot tests for section detector.
 * Locks down boundary detection output for all signal types.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SectionDetector, type SectionBoundary } from '../../../src/server/processing/section-detector.js';
import type { AsciicastEvent, Marker } from '../../../src/shared/asciicast-types.js';

/** Generate N output events with the given timing gap. */
function makeEvents(count: number, gap = 0.1): AsciicastEvent[] {
  return Array.from({ length: count }, (_, i) => [gap, 'o', `output ${i}\r\n`] as AsciicastEvent);
}

/** Serialize boundaries for deterministic snapshots (exclude non-deterministic fields). */
function serializeBoundaries(boundaries: SectionBoundary[]) {
  return boundaries.map(b => ({
    eventIndex: b.eventIndex,
    signals: [...b.signals].sort((a, b) => a.localeCompare(b)),
    label: b.label,
    score: typeof b.score === 'number' && Number.isFinite(b.score) ? Math.round(b.score * 100) / 100 : 'Infinity',
  }));
}

describe('section-detector snapshots', () => {
  it('timing gap signal — boundaries from long pauses', () => {
    const events: AsciicastEvent[] = [
      ...makeEvents(150, 0.2),       // 150 normal events
      [10, 'o', 'after gap\r\n'],  // 10s timing gap
      ...makeEvents(150, 0.2),       // 150 more normal events
    ];

    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    expect(boundaries.some(b => b.signals.includes('timing_gap'))).toBe(true);
  });

  it('screen clear signal — boundaries from clear sequences', () => {
    const events: AsciicastEvent[] = [
      ...makeEvents(150, 0.2),
      [0.1, 'o', '\x1b[2J\x1b[H'],  // Screen clear
      ...makeEvents(150, 0.2),
    ];

    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
    expect(boundaries.some(b => b.signals.includes('screen_clear'))).toBe(true);
  });

  it('alt-screen exit signal', () => {
    const events: AsciicastEvent[] = [
      ...makeEvents(150, 0.2),
      [0.1, 'o', '\x1b[?1049l'],  // Alt screen exit
      ...makeEvents(150, 0.2),
    ];

    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
    expect(boundaries.some(b => b.signals.includes('alt_screen_exit'))).toBe(true);
  });

  it('volume burst signal — after quiet period', () => {
    const events: AsciicastEvent[] = [
      ...makeEvents(150, 0.2),
      [2, 'o', 'A'.repeat(5000)],  // Volume burst after 2s gap
      ...makeEvents(150, 0.2),
    ];

    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
  });

  it('multiple signals merged within window', () => {
    const events: AsciicastEvent[] = [
      ...makeEvents(150, 0.2),
      [8, 'o', '\x1b[2J'],  // Both timing gap (8s) and screen clear
      ...makeEvents(150, 0.2),
    ];

    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
    // The merged boundary should have both signals
    const merged = boundaries.find(b =>
      b.signals.includes('timing_gap') && b.signals.includes('screen_clear')
    );
    expect(merged).toBeDefined();
  });

  it('detectWithMarkers — marker precedence', () => {
    const events: AsciicastEvent[] = [
      ...makeEvents(200, 0.2),
      [0.1, 'm', 'Test Marker'],
      ...makeEvents(200, 0.2),
    ];

    const markers: Marker[] = [
      { time: 40, label: 'Test Marker', index: 200 },
    ];

    const detector = new SectionDetector(events);
    const boundaries = detector.detectWithMarkers(markers);

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
    expect(boundaries.some(b => b.signals.includes('marker'))).toBe(true);
  });

  it('real fixture boundaries — valid-with-markers.cast', () => {
    const content = readFileSync(
      join(__dirname, '../../fixtures/valid-with-markers.cast'),
      'utf-8'
    );
    const lines = content.split('\n').filter((l: string) => l.trim());
    const events: AsciicastEvent[] = lines.slice(1)
      .map((l: string) => JSON.parse(l))
      .filter((e: any) => Array.isArray(e));

    const markers: Marker[] = events
      .map((e: AsciicastEvent, i: number) => ({ event: e, index: i }))
      .filter((x: any) => x.event[1] === 'm')
      .map((x: any) => ({
        time: x.event[0],
        label: String(x.event[2]),
        index: x.index,
      }));

    const detector = new SectionDetector(events);
    const boundaries = detector.detectWithMarkers(markers);

    expect(serializeBoundaries(boundaries)).toMatchSnapshot();
  });

  it('maximum sections cap — 50 limit', () => {
    // Create a session with many screen clears to trigger > 50 candidates
    const events: AsciicastEvent[] = [];
    for (let i = 0; i < 60; i++) {
      events.push(...makeEvents(110, 0.2), [0.1, 'o', '\x1b[2J']);
    }
    events.push(...makeEvents(200, 0.2));

    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(boundaries.length).toBeLessThanOrEqual(50);
    expect(boundaries.length).toMatchSnapshot();
  });

  it('session below MIN_SESSION_SIZE — no boundaries', () => {
    const events = makeEvents(50, 0.2); // Below 100 minimum
    const detector = new SectionDetector(events);
    const boundaries = detector.detect();

    expect(boundaries).toEqual([]);
    expect(boundaries).toMatchSnapshot();
  });
});

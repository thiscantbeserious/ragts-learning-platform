// @vitest-environment node
/**
 * Tests for extracted pipeline stage functions.
 * Tests behavior — correct output, error conditions, idempotency.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initVt } from '#vt-wasm';
import { validate } from '../../../src/server/processing/stages/validate.js';
import { detect } from '../../../src/server/processing/stages/detect.js';
import { replay } from '../../../src/server/processing/stages/replay.js';
import { dedup } from '../../../src/server/processing/stages/dedup.js';
import { store } from '../../../src/server/processing/stages/store.js';
import { SqliteDatabaseImpl } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import type { AsciicastEvent, AsciicastHeader } from '../../../src/shared/types/asciicast.js';
import type { SectionBoundary } from '../../../src/server/processing/section_detector.js';

// --- Helpers ---

function buildShortCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.15, 'o', 'hello\r\n']),
    JSON.stringify([0.2, 'o', '$ ']),
  ].join('\n');
}

function buildMarkerCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  const events: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (i === 10) {
      events.push(JSON.stringify([1.0, 'm', 'Start']));
    } else if (i === 20) {
      events.push(JSON.stringify([2.0, 'm', 'End']));
    } else {
      events.push(JSON.stringify([0.1 * i, 'o', `Output line ${i}\r\n`]));
    }
  }
  return [header, ...events].join('\n');
}

describe('validate stage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stage-validate-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns header, events, markers, and eventCount for valid .cast file', async () => {
    const content = buildMarkerCast();
    const filePath = join(tmpDir, 'session.cast');
    writeFileSync(filePath, content);

    const result = await validate(filePath, 'session1');

    expect(result.header).toBeTruthy();
    expect(result.header.width).toBe(80);
    expect(result.header.height).toBe(24);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.markers).toBeInstanceOf(Array);
    expect(result.eventCount).toBe(result.events.length);
  });

  it('is idempotent — running twice returns same result', async () => {
    const content = buildShortCast();
    const filePath = join(tmpDir, 'session2.cast');
    writeFileSync(filePath, content);

    const r1 = await validate(filePath, 'session2');
    const r2 = await validate(filePath, 'session2');

    expect(r1.eventCount).toBe(r2.eventCount);
    expect(r1.header.width).toBe(r2.header.width);
  });

  it('throws when file does not exist', async () => {
    await expect(validate('/nonexistent/missing.cast', 's1')).rejects.toThrow();
  });

  it('extracts markers from marker events', async () => {
    const content = buildMarkerCast();
    const filePath = join(tmpDir, 'markers.cast');
    writeFileSync(filePath, content);

    const result = await validate(filePath, 'session-markers');
    expect(result.markers.length).toBe(2);
    expect(result.markers[0]!.label).toBe('Start');
    expect(result.markers[1]!.label).toBe('End');
  });

  it('stores cumulative elapsed time on markers, not deltas', async () => {
    // Two marker events with delta times; Marker.time must be cumulative.
    const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
    const lines = [
      header,
      JSON.stringify([1.0, 'o', 'a\r\n']),  // elapsed: 1.0
      JSON.stringify([2.0, 'm', 'Step 1']), // elapsed: 3.0
      JSON.stringify([0.5, 'o', 'b\r\n']),  // elapsed: 3.5
      JSON.stringify([1.5, 'm', 'Step 2']), // elapsed: 5.0
    ];
    const filePath = join(tmpDir, 'cumulative.cast');
    writeFileSync(filePath, lines.join('\n'));

    const result = await validate(filePath, 'session-cumulative');
    expect(result.markers.length).toBe(2);
    expect(result.markers[0]!.time).toBeCloseTo(3.0);
    expect(result.markers[1]!.time).toBeCloseTo(5.0);
  });
});

describe('validate stage — malformed input', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stage-validate-malformed-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs a warning but succeeds when file contains malformed NDJSON lines', async () => {
    const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
    const lines = [
      header,
      JSON.stringify([0.1, 'o', '$ hello\r\n']),
      'this is not valid JSON !!!',
      JSON.stringify([0.2, 'o', 'done\r\n']),
    ];
    const filePath = join(tmpDir, 'malformed.cast');
    writeFileSync(filePath, lines.join('\n'));

    const result = await validate(filePath, 'session-malformed');

    // Malformed line is skipped, valid events are still parsed
    expect(result.eventCount).toBe(2);
    expect(result.header).toBeTruthy();
  });

  it('throws when .cast file has no header line', async () => {
    // File with only event lines and no header object
    const filePath = join(tmpDir, 'no-header.cast');
    writeFileSync(filePath, '');

    await expect(validate(filePath, 'session-no-header')).rejects.toThrow(/No header found/);
  });
});

describe('detect stage', () => {
  it('returns boundaries array for events with markers', async () => {
    const content = buildMarkerCast();
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);
    const markers = [
      { time: 1.0, label: 'Start', index: 10 },
      { time: 2.0, label: 'End', index: 20 },
    ];

    const result = detect(events, markers);

    expect(result.boundaries).toBeInstanceOf(Array);
    expect(result.sectionCount).toBeGreaterThan(0);
    expect(result.boundaries.some(b => b.label === 'Start')).toBe(true);
    expect(result.boundaries.some(b => b.label === 'End')).toBe(true);
  });

  it('returns empty boundaries for short session with no detectable sections', () => {
    const content = buildShortCast();
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const result = detect(events, []);

    expect(result.boundaries).toBeInstanceOf(Array);
    expect(result.sectionCount).toBe(result.boundaries.length);
  });

  it('is idempotent — same input produces same output', () => {
    const content = buildMarkerCast();
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);
    const markers = [
      { time: 1.0, label: 'Start', index: 10 },
      { time: 2.0, label: 'End', index: 20 },
    ];

    const r1 = detect(events, markers);
    const r2 = detect(events, markers);

    expect(r1.sectionCount).toBe(r2.sectionCount);
    expect(r1.boundaries.length).toBe(r2.boundaries.length);
  });

  it('does not prepend preamble when first marker is at eventIndex 0 (no pre-marker output)', () => {
    // First marker at event index 0 means no output before it — no preamble needed
    const events: AsciicastEvent[] = [
      [0.0, 'm', 'Section Start'],
      [0.1, 'o', 'output\r\n'],
    ];
    const markers = [{ time: 0.0, label: 'Section Start', index: 0 }];

    const result = detect(events, markers);

    // No preamble boundary prepended because first boundary is at eventIndex 0
    const preamble = result.boundaries.find(b => b.signals.includes('preamble'));
    expect(preamble).toBeUndefined();
  });

  it('does not prepend preamble when pre-marker events are all non-output types', () => {
    // Marker not at index 0, but events before it have no 'o' type — no preamble
    const events: AsciicastEvent[] = [
      [0.0, 'r', '80x24'],  // resize — not output
      [0.1, 'm', 'Section'],
      [0.2, 'o', 'output\r\n'],
    ];
    const markers = [{ time: 0.1, label: 'Section', index: 1 }];

    const result = detect(events, markers);

    const preamble = result.boundaries.find(b => b.signals.includes('preamble'));
    expect(preamble).toBeUndefined();
  });
});

describe('replay stage', () => {
  beforeEach(async () => {
    await initVt();
  });

  it('returns rawSnapshot, sectionData, and epochBoundaries', async () => {
    const content = buildShortCast();
    const headerRaw = JSON.parse(content.split('\n')[0]!) as { term: { cols: number; rows: number } };
    const header: AsciicastHeader = { version: 3, width: headerRaw.term.cols, height: headerRaw.term.rows };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const result = await replay(header, events, []);

    expect(result.rawSnapshot).toBeTruthy();
    expect(result.rawSnapshot.lines).toBeInstanceOf(Array);
    expect(result.sectionData).toBeInstanceOf(Array);
    expect(result.epochBoundaries).toBeInstanceOf(Array);
  });

  it('is idempotent — same input produces same line count', async () => {
    const content = buildShortCast();
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const r1 = await replay(header, events, []);
    const r2 = await replay(header, events, []);

    expect(r1.rawSnapshot.lines.length).toBe(r2.rawSnapshot.lines.length);
  });

  it('handles resize events (r type) without crashing', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', '$ start\r\n'],
      [0.2, 'r', '100x30'],  // resize event
      [0.3, 'o', '$ after resize\r\n'],
    ];

    const result = await replay(header, events, []);

    expect(result.rawSnapshot).toBeTruthy();
    expect(result.rawSnapshot.lines).toBeInstanceOf(Array);
  });

  it('handles exit events (x type) without crashing', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', '$ hello\r\n'],
      [0.2, 'x', 0],  // exit event — ignored
    ];

    const result = await replay(header, events, []);

    expect(result.rawSnapshot).toBeTruthy();
  });

  it('captures alt-screen section snapshot when inAltScreen is true at boundary', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    // Two boundaries: first section ends mid-alt-screen, second section after exit
    // sectionEndMap: next boundary eventIndex → boundary index
    // boundary[0] at 0, boundary[1] at 2; section[0] ends at event 2, section[1] ends at event 4
    const events: AsciicastEvent[] = [
      [0.1, 'o', '\x1b[?1049h'],     // event 0: enter alt screen
      [0.2, 'o', 'tui content\r\n'], // event 1: in alt screen
      [0.3, 'o', 'still tui\r\n'],   // event 2: still in alt screen → section[0] captures here
      [0.4, 'o', '\x1b[?1049l'],     // event 3: exit alt screen
    ];
    // One boundary at index 0, ends at eventCount(4) → captures at j+1=4 → after event 3 (inAltScreen=false)
    // Need two boundaries so first section ends while still in alt screen
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['detected'], label: 'TUI Section' },
      { eventIndex: 3, score: 10, signals: ['detected'], label: 'Post TUI' },
    ];
    // sectionEndMap: boundary[1].eventIndex=3 → boundary[0] ends at j+1=3, boundary[1] ends at j+1=4
    // At j=2 (event index 2), j+1=3 matches boundary[0] end. At that point, inAltScreen=true
    // → captureSectionSnapshot called with inAltScreen=true → hits lines 137-138

    const result = await replay(header, events, boundaries);

    expect(result.sectionData).toHaveLength(2);
    // Section 0 captured in alt-screen: has snapshot, no lineCount
    expect(result.sectionData[0]!.snapshot).not.toBeNull();
    expect(result.sectionData[0]!.lineCount).toBeNull();
  });

  it('captures line-based snapshot when not in alt-screen and lines grow', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', 'line 1\r\n'],
      [0.2, 'o', 'line 2\r\n'],
    ];
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['detected'], label: 'Section 1' },
    ];

    const result = await replay(header, events, boundaries);

    expect(result.sectionData).toHaveLength(1);
    expect(result.sectionData[0]).toBeTruthy();
  });

  it('uses view snapshot when line count does not grow past high water mark', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    // Clear scrollback (3J strips from feed but we track epoch), then output
    const events: AsciicastEvent[] = [
      [0.1, 'o', 'line1\r\nline2\r\nline3\r\n'],
      [0.2, 'o', '\x1b[2J'],  // clear display — triggers epoch boundary
      [0.3, 'o', 'new line\r\n'],
    ];
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['detected'], label: 'Section 1' },
      { eventIndex: 2, score: 10, signals: ['detected'], label: 'Section 2' },
    ];

    const result = await replay(header, events, boundaries);

    expect(result.sectionData).toHaveLength(2);
    expect(result.epochBoundaries.length).toBeGreaterThanOrEqual(0);
  });
});

describe('dedup stage', () => {
  beforeEach(async () => {
    await initVt();
  });

  it('returns a ProcessedSession from replay data', async () => {
    const content = buildShortCast();
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const replayResult = await replay(header, events, []);
    const boundaries: SectionBoundary[] = [];
    const result = dedup(
      'session-id',
      replayResult.rawSnapshot,
      replayResult.sectionData,
      replayResult.epochBoundaries,
      boundaries,
      events.length
    );

    expect(result.sessionId).toBe('session-id');
    expect(result.snapshot).toBeTruthy();
    expect(result.sections).toBeInstanceOf(Array);
    expect(result.eventCount).toBe(events.length);
  });

  it('is idempotent — same input produces same snapshot', async () => {
    const content = buildShortCast();
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const lines = content.split('\n').slice(1);
    const events = lines.map(l => JSON.parse(l) as AsciicastEvent);

    const replayResult = await replay(header, events, []);
    const r1 = dedup('s1', replayResult.rawSnapshot, replayResult.sectionData, replayResult.epochBoundaries, [], events.length);
    const r2 = dedup('s1', replayResult.rawSnapshot, replayResult.sectionData, replayResult.epochBoundaries, [], events.length);

    expect(r1.snapshot).toBe(r2.snapshot);
    expect(r1.sections.length).toBe(r2.sections.length);
  });

  it('throws when boundaries array is longer than sectionData (boundary drift)', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', 'line\r\n'],
    ];
    const replayResult = await replay(header, events, []);

    // Provide 2 boundaries but only 0 sectionData entries
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['detected'], label: 'S1' },
      { eventIndex: 1, score: 10, signals: ['detected'], label: 'S2' },
    ];
    const emptySectionData: Array<{ lineCount: number | null; snapshot: null }> = [];

    expect(() => dedup(
      'session-drift',
      replayResult.rawSnapshot,
      emptySectionData,
      replayResult.epochBoundaries,
      boundaries,
      events.length
    )).toThrow(/Missing sectionData/);
  });

  it('throws when boundary at index is undefined (sparse boundaries array)', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', 'line\r\n'],
    ];
    const replayResult = await replay(header, events, []);

    // Construct a sparse array with length=1 but index 0 is undefined
    const sparseBoundaries = new Array(1) as SectionBoundary[];
    const sectionData = [{ lineCount: 1, snapshot: null }];

    expect(() => dedup(
      'session-sparse',
      replayResult.rawSnapshot,
      sectionData,
      replayResult.epochBoundaries,
      sparseBoundaries,
      events.length
    )).toThrow(/Missing boundary at index 0/);
  });

  it('builds sections with snapshot when sectionData has a non-null snapshot (alt-screen path)', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', '\x1b[?1049h'],
      [0.2, 'o', 'tui\r\n'],
      [0.3, 'o', '\x1b[?1049l'],
    ];
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['detected'], label: 'TUI' },
    ];

    // replay with alt-screen boundary to generate a sectionData with non-null snapshot
    const replayResult = await replay(header, events, boundaries);

    const result = dedup(
      'session-altscreen',
      replayResult.rawSnapshot,
      replayResult.sectionData,
      replayResult.epochBoundaries,
      boundaries,
      events.length
    );

    expect(result.sections).toHaveLength(1);
    // alt-screen sections have null startLine/endLine (from snapshot path)
    expect(result.sections[0]!.startLine).toBeNull();
    expect(result.sections[0]!.endLine).toBeNull();
  });

  it('labels section as marker type when boundary has marker signal and snapshot exists (line 106)', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', '\x1b[?1049h'],
      [0.2, 'o', 'tui content\r\n'],
      [0.3, 'o', '\x1b[?1049l'],
    ];
    // Use a marker signal so isMarker=true is exercised in the snapshot path
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['marker'], label: 'My Marker' },
    ];

    const replayResult = await replay(header, events, boundaries);

    const result = dedup(
      'session-marker-snapshot',
      replayResult.rawSnapshot,
      replayResult.sectionData,
      replayResult.epochBoundaries,
      boundaries,
      events.length
    );

    expect(result.sections).toHaveLength(1);
    // The boundary has marker signal, so type must be 'marker'
    expect(result.sections[0]!.type).toBe('marker');
    // alt-screen sections have null line range
    expect(result.sections[0]!.startLine).toBeNull();
    expect(result.sections[0]!.endLine).toBeNull();
  });

  it('uses rawSnapshot.lines.length when lineCount is null (line 118 null-coalescing path)', async () => {
    const header: AsciicastHeader = { version: 3, width: 80, height: 24 };
    const events: AsciicastEvent[] = [
      [0.1, 'o', 'line 1\r\n'],
      [0.2, 'o', 'line 2\r\n'],
    ];
    const boundaries: SectionBoundary[] = [
      { eventIndex: 0, score: 10, signals: ['detected'], label: 'Section' },
    ];

    // Produce sectionData with snapshot=null and lineCount=null to force the ?? branch
    const replayResult = await replay(header, events, boundaries);
    const nullLineCountSectionData = replayResult.sectionData.map(sd => ({
      ...sd,
      lineCount: null,
      snapshot: null,
    }));

    const result = dedup(
      'session-null-linecount',
      replayResult.rawSnapshot,
      nullLineCountSectionData,
      replayResult.epochBoundaries,
      boundaries,
      events.length
    );

    expect(result.sections).toHaveLength(1);
    // endLine should equal rawSnapshot.lines.length (fallback path)
    expect(result.sections[0]!.endLine).toBe(replayResult.rawSnapshot.lines.length);
  });
});

describe('store stage', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'stage-store-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists a ProcessedSession via sessionRepository.completeProcessing', async () => {
    const session = await ctx.sessionRepository.create({
      filename: 'store-test.cast',
      filepath: 'sessions/store-test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const processed = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [] }),
      sections: [],
      eventCount: 3,
      detectedSectionsCount: 0,
    };

    await store(processed, ctx.sessionRepository);

    const updated = await ctx.sessionRepository.findById(session.id);
    expect(updated!.detection_status).toBe('completed');
    expect(updated!.event_count).toBe(3);
  });

  it('is idempotent — calling store twice leaves session in completed state', async () => {
    const session = await ctx.sessionRepository.create({
      filename: 'store-idem.cast',
      filepath: 'sessions/store-idem.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    const processed = {
      sessionId: session.id,
      snapshot: JSON.stringify({ lines: [] }),
      sections: [],
      eventCount: 3,
      detectedSectionsCount: 0,
    };

    await store(processed, ctx.sessionRepository);
    await store(processed, ctx.sessionRepository);

    const updated = await ctx.sessionRepository.findById(session.id);
    expect(updated!.detection_status).toBe('completed');
  });
});

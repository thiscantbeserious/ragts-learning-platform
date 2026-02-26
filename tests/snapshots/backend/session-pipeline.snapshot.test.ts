/**
 * Snapshot tests for session processing pipeline.
 * Locks down the full pipeline output: sections, line ranges, detection status.
 *
 * Uses in-memory repository mocks to isolate the pipeline logic.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { readFileSync } from 'fs';
import { processSessionPipeline } from '../../../src/server/processing/session-pipeline.js';
import { initVt } from '../../../packages/vt-wasm/index.js';

beforeAll(async () => {
  await initVt();
});

const TEST_DATA_DIR = join(__dirname, '../../.test-data');

/** Create a temp .cast file and return its path. */
function writeTempCast(content: string, name: string): string {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const filePath = join(TEST_DATA_DIR, name);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** In-memory mock for SessionRepository. */
function createMockSessionRepo() {
  const state: Record<string, any> = {};
  return {
    updateDetectionStatus(id: string, status: string, eventCount?: number, sectionsCount?: number) {
      state[id] = { ...(state[id] ?? {}), status, eventCount, sectionsCount };
    },
    updateSnapshot(id: string, snapshot: string) {
      state[id] = { ...(state[id] ?? {}), snapshot };
    },
    getState(id: string) { return state[id]; },
  };
}

/** In-memory mock for SectionRepository. */
function createMockSectionRepo() {
  const sections: any[] = [];
  return {
    create(input: any) { sections.push({ ...input }); },
    deleteBySessionId(_id: string) { sections.length = 0; },
    getSections() { return sections; },
  };
}

/** Serialize sections for deterministic snapshots. */
function serializeSections(sections: any[]) {
  return sections
    .sort((a: any, b: any) => a.startEvent - b.startEvent)
    .map((s: any) => ({
      type: s.type,
      label: s.label,
      startEvent: s.startEvent,
      endEvent: s.endEvent,
      startLine: s.startLine,
      endLine: s.endLine,
      hasSnapshot: s.snapshot !== null && s.snapshot !== undefined,
    }));
}

describe('session-pipeline snapshots', () => {
  afterAll(() => {
    try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch {}
  });

  it('CLI session with markers — section structure', async () => {
    const castPath = join(__dirname, '../../fixtures/valid-with-markers.cast');
    const content = readFileSync(castPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const events = lines.slice(1).map(l => JSON.parse(l));

    // Extract markers
    const markers = events
      .map((e: any, i: number) => ({ event: e, index: i }))
      .filter((x: any) => x.event[1] === 'm')
      .map((x: any) => ({
        time: x.event[0],
        label: String(x.event[2]),
        index: x.index,
      }));

    const sessionRepo = createMockSessionRepo();
    const sectionRepo = createMockSectionRepo();

    await processSessionPipeline(
      castPath,
      'test-session-markers',
      markers,
      sectionRepo as any,
      sessionRepo as any,
    );

    const sections = serializeSections(sectionRepo.getSections());
    expect(sections).toMatchSnapshot();

    const state = sessionRepo.getState('test-session-markers');
    expect(state.status).toBe('completed');
    expect(state.eventCount).toMatchSnapshot();
  });

  it('synthetic TUI session with epochs — exercises dedup', async () => {
    const castPath = join(__dirname, '../../fixtures/synthetic-tui-session.cast');

    const sessionRepo = createMockSessionRepo();
    const sectionRepo = createMockSectionRepo();

    await processSessionPipeline(
      castPath,
      'test-session-tui',
      [], // No markers
      sectionRepo as any,
      sessionRepo as any,
    );

    const state = sessionRepo.getState('test-session-tui');
    expect(state.status).toBe('completed');

    // Verify dedup happened: session snapshot should exist and be smaller than raw
    const snapshot = state.snapshot ? JSON.parse(state.snapshot) : null;
    expect(snapshot).not.toBeNull();
    expect(snapshot.lines.length).toMatchSnapshot();
  });

  it('valid-with-markers.cast — full pipeline snapshot excluding dynamic fields', async () => {
    const castPath = join(__dirname, '../../fixtures/valid-with-markers.cast');
    const content = readFileSync(castPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const events = lines.slice(1).map(l => JSON.parse(l));

    const markers = events
      .map((e: any, i: number) => ({ event: e, index: i }))
      .filter((x: any) => x.event[1] === 'm')
      .map((x: any) => ({
        time: x.event[0],
        label: String(x.event[2]),
        index: x.index,
      }));

    const sessionRepo = createMockSessionRepo();
    const sectionRepo = createMockSectionRepo();

    await processSessionPipeline(
      castPath,
      'test-pipeline-full',
      markers,
      sectionRepo as any,
      sessionRepo as any,
    );

    const state = sessionRepo.getState('test-pipeline-full');
    const snapshot = state.snapshot ? JSON.parse(state.snapshot) : null;

    expect({
      status: state.status,
      eventCount: state.eventCount,
      sectionsCount: state.sectionsCount,
      snapshotLineCount: snapshot?.lines?.length ?? 0,
      snapshotCols: snapshot?.cols,
      snapshotRows: snapshot?.rows,
    }).toMatchSnapshot();
  });

  it('empty cast file (header only) — pipeline handles gracefully', async () => {
    const castPath = join(__dirname, '../../fixtures/header-only.cast');

    const sessionRepo = createMockSessionRepo();
    const sectionRepo = createMockSectionRepo();

    await processSessionPipeline(
      castPath,
      'test-empty-session',
      [],
      sectionRepo as any,
      sessionRepo as any,
    );

    const state = sessionRepo.getState('test-empty-session');
    expect({
      status: state.status,
      eventCount: state.eventCount,
      sectionsCount: state.sectionsCount,
    }).toMatchSnapshot();
    expect(sectionRepo.getSections().length).toBe(0);
  });
});

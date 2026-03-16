// @vitest-environment node
/**
 * Unit tests for PipelineStatusService.
 *
 * Covers: initial snapshot from DB, event bus subscriptions, in-memory state
 * tracking (processing/queued), 5-minute rolling window for recently completed,
 * snapshot generation, and onUpdate callback notifications.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineStatusService } from './pipeline_status_service.js';
import { EmitterEventBusImpl } from '../events/emitter_event_bus_impl.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { Session } from '../../shared/types/session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test.cast',
    filepath: '/data/sessions/test.cast',
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    detection_status: 'processing',
    ...overrides,
  };
}

function makeSessionAdapter(sessions: Session[] = []): SessionAdapter {
  return {
    create: vi.fn(),
    createWithId: vi.fn(),
    findAll: vi.fn().mockResolvedValue(sessions),
    findById: vi.fn(),
    deleteById: vi.fn(),
    updateDetectionStatus: vi.fn(),
    updateSnapshot: vi.fn(),
    completeProcessing: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// PipelineStatusService.getSnapshot() — initial state from DB
// ---------------------------------------------------------------------------

describe('PipelineStatusService — initial snapshot from DB', () => {
  it('populates processing list from DB sessions with active detection_status', async () => {
    const sessions = [
      makeSession({ id: 'sess-1', filename: 'a.cast', detection_status: 'processing' }),
      makeSession({ id: 'sess-2', filename: 'b.cast', detection_status: 'detecting' }),
    ];
    const sessionAdapter = makeSessionAdapter(sessions);
    const eventBus = new EmitterEventBusImpl();
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const snapshot = service.getSnapshot();
    expect(snapshot.processing).toHaveLength(2);
    expect(snapshot.processing[0]!.id).toBe('sess-1');
    expect(snapshot.processing[1]!.id).toBe('sess-2');
  });

  it('populates queued list from DB sessions with queued detection_status', async () => {
    const sessions = [
      makeSession({ id: 'sess-1', filename: 'a.cast', detection_status: 'queued' }),
    ];
    const sessionAdapter = makeSessionAdapter(sessions);
    const eventBus = new EmitterEventBusImpl();
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const snapshot = service.getSnapshot();
    expect(snapshot.queued).toHaveLength(1);
    expect(snapshot.queued[0]!.id).toBe('sess-1');
  });

  it('starts with empty recentlyCompleted on init', async () => {
    const sessions = [makeSession({ detection_status: 'completed' })];
    const sessionAdapter = makeSessionAdapter(sessions);
    const eventBus = new EmitterEventBusImpl();
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const snapshot = service.getSnapshot();
    expect(snapshot.recentlyCompleted).toHaveLength(0);
  });

  it('excludes completed/failed sessions from processing and queued lists', async () => {
    const sessions = [
      makeSession({ id: 'sess-1', detection_status: 'completed' }),
      makeSession({ id: 'sess-2', detection_status: 'failed' }),
      makeSession({ id: 'sess-3', detection_status: 'interrupted' }),
    ];
    const sessionAdapter = makeSessionAdapter(sessions);
    const eventBus = new EmitterEventBusImpl();
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const snapshot = service.getSnapshot();
    expect(snapshot.processing).toHaveLength(0);
    expect(snapshot.queued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PipelineStatusService — event bus subscriptions
// ---------------------------------------------------------------------------

describe('PipelineStatusService — event bus subscriptions', () => {
  let eventBus: EmitterEventBusImpl;
  let sessionAdapter: SessionAdapter;
  let service: PipelineStatusService;

  beforeEach(async () => {
    eventBus = new EmitterEventBusImpl();
    sessionAdapter = makeSessionAdapter([]);
    service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();
  });

  it('adds session to processing when session.uploaded event fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });

    const snapshot = service.getSnapshot();
    expect(snapshot.processing.find(s => s.id === 'sess-1')).toBeTruthy();
  });

  it('keeps session in processing when session.validated event fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.validated', sessionId: 'sess-1', eventCount: 100 });

    const snapshot = service.getSnapshot();
    const session = snapshot.processing.find(s => s.id === 'sess-1');
    expect(session).toBeTruthy();
    expect(session!.status).toBe('validating');
  });

  it('keeps session in processing when session.detected event fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.detected', sessionId: 'sess-1', sectionCount: 5 });

    const snapshot = service.getSnapshot();
    const session = snapshot.processing.find(s => s.id === 'sess-1');
    expect(session).toBeTruthy();
    expect(session!.status).toBe('detecting');
  });

  it('keeps session in processing when session.replayed event fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.replayed', sessionId: 'sess-1', lineCount: 200 });

    const snapshot = service.getSnapshot();
    const session = snapshot.processing.find(s => s.id === 'sess-1');
    expect(session).toBeTruthy();
    expect(session!.status).toBe('replaying');
  });

  it('keeps session in processing when session.deduped event fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.deduped', sessionId: 'sess-1', rawLines: 100, cleanLines: 80 });

    const snapshot = service.getSnapshot();
    const session = snapshot.processing.find(s => s.id === 'sess-1');
    expect(session).toBeTruthy();
    expect(session!.status).toBe('deduplicating');
  });

  it('moves session from processing to recentlyCompleted when session.ready fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.ready', sessionId: 'sess-1' });

    const snapshot = service.getSnapshot();
    expect(snapshot.processing.find(s => s.id === 'sess-1')).toBeUndefined();
    const completed = snapshot.recentlyCompleted.find(s => s.id === 'sess-1');
    expect(completed).toBeTruthy();
    expect(completed!.status).toBe('completed');
  });

  it('moves session from processing to recentlyCompleted when session.failed fires', () => {
    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({
      type: 'session.failed',
      sessionId: 'sess-1',
      stage: 'validate' as import('../../shared/types/pipeline.js').PipelineStage,
      error: 'bad data',
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.processing.find(s => s.id === 'sess-1')).toBeUndefined();
    const completed = snapshot.recentlyCompleted.find(s => s.id === 'sess-1');
    expect(completed).toBeTruthy();
    expect(completed!.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// PipelineStatusService — 5-minute rolling window
// ---------------------------------------------------------------------------

describe('PipelineStatusService — 5-minute rolling window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes a recently completed session within the 5-minute window', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.ready', sessionId: 'sess-1' });

    const snapshot = service.getSnapshot();
    expect(snapshot.recentlyCompleted).toHaveLength(1);
  });

  it('excludes a completed session after the 5-minute window expires', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.ready', sessionId: 'sess-1' });

    // Advance time past the 5-minute window
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const snapshot = service.getSnapshot();
    expect(snapshot.recentlyCompleted).toHaveLength(0);
  });

  it('keeps session within window if time has not exceeded 5 minutes', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });
    eventBus.emit({ type: 'session.ready', sessionId: 'sess-1' });

    // Advance time to just under 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000 - 1000);

    const snapshot = service.getSnapshot();
    expect(snapshot.recentlyCompleted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PipelineStatusService — onUpdate callback
// ---------------------------------------------------------------------------

describe('PipelineStatusService — onUpdate callback', () => {
  it('calls the update callback when a pipeline event is received', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const callback = vi.fn();
    service.onUpdate(callback);

    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      processing: expect.any(Array),
      queued: expect.any(Array),
      recentlyCompleted: expect.any(Array),
    }));
  });

  it('calls multiple update callbacks when registered', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    service.onUpdate(cb1);
    service.onUpdate(cb2);

    eventBus.emit({ type: 'session.ready', sessionId: 'sess-1' });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('removes a specific callback when offUpdate is called', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const callback = vi.fn();
    service.onUpdate(callback);
    service.offUpdate(callback);

    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'test.cast' });

    expect(callback).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PipelineStatusService — session name handling
// ---------------------------------------------------------------------------

describe('PipelineStatusService — session name from filename', () => {
  it('uses filename as the session name in the snapshot', async () => {
    const eventBus = new EmitterEventBusImpl();
    const sessionAdapter = makeSessionAdapter([]);
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    eventBus.emit({ type: 'session.uploaded', sessionId: 'sess-1', filename: 'my-recording.cast' });

    const snapshot = service.getSnapshot();
    const session = snapshot.processing.find(s => s.id === 'sess-1');
    expect(session!.name).toBe('my-recording.cast');
  });

  it('uses filename from DB session for initial state', async () => {
    const sessions = [
      makeSession({ id: 'sess-1', filename: 'db-session.cast', detection_status: 'processing' }),
    ];
    const sessionAdapter = makeSessionAdapter(sessions);
    const eventBus = new EmitterEventBusImpl();
    const service = new PipelineStatusService({ eventBus, sessionAdapter });
    await service.init();

    const snapshot = service.getSnapshot();
    expect(snapshot.processing[0]!.name).toBe('db-session.cast');
  });
});

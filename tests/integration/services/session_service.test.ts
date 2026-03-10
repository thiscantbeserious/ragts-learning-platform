// @vitest-environment node
/**
 * Unit tests for SessionService error paths not covered by route-level tests.
 * Focuses on redetectSession branches for pending/running/completed job states.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabaseImpl } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import { EmitterEventBusImpl } from '../../../src/server/events/emitter_event_bus_impl.js';
import { SessionService } from '../../../src/server/services/session_service.js';

/** Minimal valid asciicast content for storage. */
function buildShortCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.15, 'o', 'hello\r\n']),
  ].join('\n');
}

describe('SessionService.getSession — null section field coalescing', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let eventBus: EmitterEventBusImpl;
  let service: SessionService;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-sessionsvc-get-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    eventBus = new EmitterEventBusImpl();

    service = new SessionService({
      sessionRepository: ctx.sessionRepository,
      sectionRepository: ctx.sectionRepository,
      storageAdapter: ctx.storageAdapter,
      jobQueue: ctx.jobQueue,
      eventBus,
    });

    const content = buildShortCast();
    const filepath = await ctx.storageAdapter.save('test-session-get', content);

    const session = await ctx.sessionRepository.createWithId('test-session-get', {
      filename: 'get-test.cast',
      filepath,
      size_bytes: content.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('coalesces null label to empty string and null endEvent to 0 in transformSection', async () => {
    // Create a section with null label and null endEvent to exercise ?? branches (lines 169, 171)
    await ctx.sectionRepository.create({
      sessionId,
      type: 'detected',
      startEvent: 0,
      endEvent: null,
      label: null,
      snapshot: null,
      startLine: 0,
      endLine: 1,
    });

    const result = await service.getSession(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    const sections = result.data.sections as Array<{ label: string; endEvent: number }>;
    expect(sections).toHaveLength(1);
    expect(sections[0]!.label).toBe('');
    expect(sections[0]!.endEvent).toBe(0);
  });
});

describe('SessionService.getSession — storage read throws non-Error', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let service: SessionService;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-sessionsvc-storeerr-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });

    // Create session record but give it a bogus filepath so storage.read throws
    const filepath = await ctx.storageAdapter.save('bogus-session', 'dummy');
    await ctx.sessionRepository.createWithId('bogus-session', {
      filename: 'bogus.cast',
      filepath,
      size_bytes: 5,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    // Provide a storageAdapter that throws a non-Error value on read
    const brokenStorage = {
      ...ctx.storageAdapter,
      read: (_id: string) => { throw 'disk-failure'; },
    };

    service = new SessionService({
      sessionRepository: ctx.sessionRepository,
      sectionRepository: ctx.sectionRepository,
      storageAdapter: brokenStorage as typeof ctx.storageAdapter,
      jobQueue: ctx.jobQueue,
      eventBus: new EmitterEventBusImpl(),
    });
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('re-throws when storage.read throws a non-Error value', async () => {
    await expect(service.getSession('bogus-session')).rejects.toThrow();
  });
});

describe('SessionService.redetectSession — UNIQUE constraint concurrent branch', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let eventBus: EmitterEventBusImpl;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-sessionsvc-unique-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    eventBus = new EmitterEventBusImpl();

    const content = buildShortCast();
    const filepath = await ctx.storageAdapter.save('unique-session', content);
    const session = await ctx.sessionRepository.createWithId('unique-session', {
      filename: 'unique.cast',
      filepath,
      size_bytes: content.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('handles concurrent redetect UNIQUE constraint by retrying the existing job', async () => {
    // Pre-create a job via the real queue so findBySessionId can find it after the UNIQUE error
    const realJob = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(realJob.id);
    await ctx.jobQueue.fail(realJob.id, 'previous failure');

    // Wrap real jobQueue: first findBySessionId returns null (simulating no existing job),
    // then create throws UNIQUE, then second findBySessionId returns the real job.
    let findCallCount = 0;
    const wrappedQueue = {
      create: (_id: string) => { throw new Error('UNIQUE constraint failed'); },
      findBySessionId: async (id: string) => {
        findCallCount++;
        if (findCallCount === 1) return null; // first call: no existing job
        return ctx.jobQueue.findBySessionId(id); // second call: find the real job
      },
      findPending: ctx.jobQueue.findPending.bind(ctx.jobQueue),
      start: ctx.jobQueue.start.bind(ctx.jobQueue),
      advance: ctx.jobQueue.advance.bind(ctx.jobQueue),
      complete: ctx.jobQueue.complete.bind(ctx.jobQueue),
      fail: ctx.jobQueue.fail.bind(ctx.jobQueue),
      retry: ctx.jobQueue.retry.bind(ctx.jobQueue),
      recoverInterrupted: ctx.jobQueue.recoverInterrupted.bind(ctx.jobQueue),
    };

    const wrappedService = new SessionService({
      sessionRepository: ctx.sessionRepository,
      sectionRepository: ctx.sectionRepository,
      storageAdapter: ctx.storageAdapter,
      jobQueue: wrappedQueue as typeof ctx.jobQueue,
      eventBus,
    });

    const result = await wrappedService.redetectSession(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.sessionId).toBe(sessionId);
  });

  it('re-throws when create fails with a non-UNIQUE error', async () => {
    const badJobQueue = {
      create: (_id: string) => { throw new Error('Disk full'); },
      findBySessionId: async () => null,
      findPending: ctx.jobQueue.findPending.bind(ctx.jobQueue),
      start: ctx.jobQueue.start.bind(ctx.jobQueue),
      advance: ctx.jobQueue.advance.bind(ctx.jobQueue),
      complete: ctx.jobQueue.complete.bind(ctx.jobQueue),
      fail: ctx.jobQueue.fail.bind(ctx.jobQueue),
      retry: ctx.jobQueue.retry.bind(ctx.jobQueue),
      recoverInterrupted: ctx.jobQueue.recoverInterrupted.bind(ctx.jobQueue),
    };

    const failService = new SessionService({
      sessionRepository: ctx.sessionRepository,
      sectionRepository: ctx.sectionRepository,
      storageAdapter: ctx.storageAdapter,
      jobQueue: badJobQueue as typeof ctx.jobQueue,
      eventBus,
    });

    await expect(failService.redetectSession(sessionId)).rejects.toThrow('Disk full');
  });
});

describe('SessionService.redetectSession', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let eventBus: EmitterEventBusImpl;
  let service: SessionService;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-sessionsvc-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    eventBus = new EmitterEventBusImpl();

    service = new SessionService({
      sessionRepository: ctx.sessionRepository,
      sectionRepository: ctx.sectionRepository,
      storageAdapter: ctx.storageAdapter,
      jobQueue: ctx.jobQueue,
      eventBus,
    });

    // Save cast file via storageAdapter so read(id) resolves correctly
    const content = buildShortCast();
    const filepath = await ctx.storageAdapter.save('test-session-id', content);

    const session = await ctx.sessionRepository.createWithId('test-session-id', {
      filename: 'test.cast',
      filepath,
      size_bytes: content.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 404 for a non-existent session', async () => {
    const result = await service.redetectSession('nonexistent');
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(404);
    expect(result.error).toContain('not found');
  });

  it('returns early with in-progress message when a pending job already exists', async () => {
    // Create a job in pending state
    await ctx.jobQueue.create(sessionId);

    const emittedTypes: string[] = [];
    eventBus.on('session.uploaded', (e) => emittedTypes.push(e.type));

    const result = await service.redetectSession(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.message).toContain('already in progress');
    expect(result.data.sessionId).toBe(sessionId);
    // No event should be emitted since it returns early
    expect(emittedTypes).toHaveLength(0);
  });

  it('returns early with in-progress message when a running job exists', async () => {
    // Create and start a job (running state)
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);

    const emittedTypes: string[] = [];
    eventBus.on('session.uploaded', (e) => emittedTypes.push(e.type));

    const result = await service.redetectSession(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.message).toContain('already in progress');
    expect(emittedTypes).toHaveLength(0);
  });

  it('retries an existing failed job via jobQueue.retry', async () => {
    // Create, start, and fail a job so it has status=failed
    const job = await ctx.jobQueue.create(sessionId);
    await ctx.jobQueue.start(job.id);
    await ctx.jobQueue.fail(job.id, 'Test failure');

    const emittedTypes: string[] = [];
    eventBus.on('session.uploaded', (e) => emittedTypes.push(e.type));

    const result = await service.redetectSession(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.message).toContain('Re-detection started');
    expect(result.data.sessionId).toBe(sessionId);
    expect(emittedTypes).toContain('session.uploaded');

    // The job should be reset to pending/validate via retry()
    const updated = await ctx.jobQueue.findBySessionId(sessionId);
    expect(updated?.status).toBe('pending');
  });

  it('creates a new job when no existing job is found', async () => {
    // No job exists for this session
    const existing = await ctx.jobQueue.findBySessionId(sessionId);
    expect(existing).toBeNull();

    const emittedTypes: string[] = [];
    eventBus.on('session.uploaded', (e) => emittedTypes.push(e.type));

    const result = await service.redetectSession(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data.message).toContain('Re-detection started');
    expect(emittedTypes).toContain('session.uploaded');

    const created = await ctx.jobQueue.findBySessionId(sessionId);
    expect(created).not.toBeNull();
    expect(created?.status).toBe('pending');
  });
});

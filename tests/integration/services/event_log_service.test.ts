// @vitest-environment node
/**
 * Unit tests for EventLogService.
 * Tests validation, session existence check, and event retrieval.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabaseImpl } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import type { PipelineEvent } from '../../../src/shared/types/pipeline.js';
import { PipelineStage } from '../../../src/shared/types/pipeline.js';
import { EventLogService } from '../../../src/server/services/event_log_service.js';

describe('EventLogService.getEvents', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let service: EventLogService;
  let sessionId: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-eventlogsvc-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });

    service = new EventLogService({
      sessionRepository: ctx.sessionRepository,
      eventLog: ctx.eventLog,
    });

    const session = await ctx.sessionRepository.createWithId('test-session', {
      filename: 'test.cast',
      filepath: '/tmp/test.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 400 when sessionId is undefined', async () => {
    const result = await service.getEvents(undefined);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
    expect(result.error).toContain('sessionId');
  });

  it('returns 400 when sessionId is empty string', async () => {
    const result = await service.getEvents('');
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
  });

  it('returns 404 for non-existent session', async () => {
    const result = await service.getEvents('nonexistent-id');
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(404);
    expect(result.error).toContain('not found');
  });

  it('returns empty array for session with no events', async () => {
    const result = await service.getEvents(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it('returns events ordered by id ascending', async () => {
    const events: PipelineEvent[] = [
      { type: 'session.validated', sessionId, eventCount: 10 },
      { type: 'session.detected', sessionId, sectionCount: 3 },
      { type: 'session.ready', sessionId },
    ];
    for (const event of events) {
      await ctx.eventLog.log(event);
    }

    const result = await service.getEvents(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data).toHaveLength(3);
    const types = result.data.map(e => e.eventType);
    expect(types).toEqual(['session.validated', 'session.detected', 'session.ready']);
  });

  it('each entry has id, eventType, stage, payload, createdAt fields', async () => {
    await ctx.eventLog.log({ type: 'session.validated', sessionId, eventCount: 5 });
    const result = await service.getEvents(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    const entry = result.data[0]!;
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('eventType');
    expect(entry).toHaveProperty('stage');
    expect(entry).toHaveProperty('payload');
    expect(entry).toHaveProperty('createdAt');
  });

  it('preserves stage field for session.failed events', async () => {
    await ctx.eventLog.log({
      type: 'session.failed',
      sessionId,
      stage: PipelineStage.Detect,
      error: 'Something went wrong',
    });
    const result = await service.getEvents(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data[0]!.stage).toBe(PipelineStage.Detect);
  });

  it('does not include events from other sessions', async () => {
    await ctx.sessionRepository.createWithId('other-session', {
      filename: 'other.cast',
      filepath: '/tmp/other.cast',
      size_bytes: 50,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });
    await ctx.eventLog.log({ type: 'session.ready', sessionId: 'other-session' });
    await ctx.eventLog.log({ type: 'session.ready', sessionId });

    const result = await service.getEvents(sessionId);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.eventType).toBe('session.ready');
  });
});

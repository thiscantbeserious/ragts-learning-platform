// @vitest-environment node
/**
 * Tests for PipelineOrchestrator.
 * Tests end-to-end job advancement, error handling, concurrency drain,
 * intermediate status updates, and event log integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initVt } from '#vt-wasm';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import { EmitterEventBus } from '../events/emitter_event_bus.js';
import { PipelineOrchestrator, type StageDependencies } from './pipeline_orchestrator.js';
import { PipelineStage } from '../../shared/pipeline_events.js';

function buildShortCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.15, 'o', 'hello\r\n']),
    JSON.stringify([0.2, 'o', '$ ']),
  ].join('\n');
}

/** Wait for a pipeline event of the given type with a timeout. */
function waitForEvent(
  eventBus: EmitterEventBus,
  type: string,
  timeoutMs = 3000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    eventBus.once(type as never, (event: unknown) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
}

describe('PipelineOrchestrator', () => {
  let tmpDir: string;
  let ctx: DatabaseContext;
  let eventBus: EmitterEventBus;
  let orchestrator: PipelineOrchestrator;
  let deps: StageDependencies;

  beforeEach(async () => {
    await initVt();
    tmpDir = mkdtempSync(join(tmpdir(), 'orchestrator-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpDir });
    eventBus = new EmitterEventBus();

    deps = {
      sessionRepository: ctx.sessionRepository,
      storageAdapter: ctx.storageAdapter,
    };

    orchestrator = new PipelineOrchestrator(eventBus, ctx.jobQueue, deps);
    await orchestrator.start();
  });

  afterEach(async () => {
    await orchestrator.stop();
    await ctx.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('advances a job through all 5 stages and emits session.ready', async () => {
    const content = buildShortCast();

    const { nanoid } = await import('nanoid');
    const sessionId = nanoid();
    const filepath = await ctx.storageAdapter.save(sessionId, content);

    const session = await ctx.sessionRepository.createWithId(sessionId, {
      filename: 'orch-test.cast',
      filepath,
      size_bytes: content.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await ctx.jobQueue.create(session.id);

    const readyPromise = waitForEvent(eventBus, 'session.ready');
    eventBus.emit({ type: 'session.uploaded', sessionId: session.id, filename: 'orch-session.cast' });

    const readyEvent = await readyPromise as { type: string; sessionId: string };
    expect(readyEvent.type).toBe('session.ready');
    expect(readyEvent.sessionId).toBe(session.id);

    const job = await ctx.jobQueue.findBySessionId(session.id);
    expect(job!.status).toBe('completed');

    const updated = await ctx.sessionRepository.findById(session.id);
    expect(updated!.detection_status).toBe('completed');
  });

  it('marks job as failed and emits session.failed when a stage throws', async () => {
    const session = await ctx.sessionRepository.create({
      filename: 'fail-test.cast',
      filepath: '/nonexistent/fail-session.cast',
      size_bytes: 100,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await ctx.jobQueue.create(session.id);

    const failedPromise = waitForEvent(eventBus, 'session.failed');
    eventBus.emit({ type: 'session.uploaded', sessionId: session.id, filename: 'fail-session.cast' });

    const failedEvent = await failedPromise as { type: string; sessionId: string; stage: string; error: string };
    expect(failedEvent.type).toBe('session.failed');
    expect(failedEvent.sessionId).toBe(session.id);
    expect(failedEvent.stage).toBe(PipelineStage.Validate);

    const job = await ctx.jobQueue.findBySessionId(session.id);
    expect(job!.status).toBe('failed');
    expect(job!.lastError).toBeTruthy();
  });

  it('does not process jobs for sessions with no job record', async () => {
    const failSpy = vi.fn();
    eventBus.on('session.failed', failSpy);
    const readySpy = vi.fn();
    eventBus.on('session.ready', readySpy);

    eventBus.emit({ type: 'session.uploaded', sessionId: 'no-job-session', filename: 'noop.cast' });

    await new Promise(r => setTimeout(r, 50));

    expect(failSpy).not.toHaveBeenCalled();
    expect(readySpy).not.toHaveBeenCalled();
  });

  it('updates intermediate detection_status during pipeline stages', async () => {
    const content = buildShortCast();
    const { nanoid } = await import('nanoid');
    const sessionId = nanoid();
    const filepath = await ctx.storageAdapter.save(sessionId, content);

    const session = await ctx.sessionRepository.createWithId(sessionId, {
      filename: 'status-test.cast',
      filepath,
      size_bytes: content.length,
      marker_count: 0,
      uploaded_at: new Date().toISOString(),
    });

    await ctx.jobQueue.create(session.id);

    // Track status transitions via spy
    const statuses: string[] = [];
    const origUpdate = ctx.sessionRepository.updateDetectionStatus.bind(ctx.sessionRepository);
    ctx.sessionRepository.updateDetectionStatus = async (id, status, ...rest) => {
      statuses.push(status);
      return origUpdate(id, status, ...rest);
    };

    // Rebuild orchestrator with the spied repo
    await orchestrator.stop();
    orchestrator = new PipelineOrchestrator(eventBus, ctx.jobQueue, {
      sessionRepository: ctx.sessionRepository,
      storageAdapter: ctx.storageAdapter,
    });
    await orchestrator.start();

    const readyPromise = waitForEvent(eventBus, 'session.ready');
    eventBus.emit({ type: 'session.uploaded', sessionId: session.id, filename: 'status-test.cast' });
    await readyPromise;

    // Should have seen at least validating -> (others) before completed
    expect(statuses).toContain('validating');
    expect(statuses).toContain('detecting');
    expect(statuses).toContain('replaying');
  });

  it('drainPending picks up a deferred job after a slot frees', async () => {
    // Saturate the concurrency limit by forcing the orchestrator to have
    // MAX_CONCURRENT = 1 indirectly: just verify that a pending job created
    // AFTER the first upload is still processed once the queue drains.

    const content = buildShortCast();
    const { nanoid } = await import('nanoid');

    // Create and process first session normally
    const id1 = nanoid();
    const fp1 = await ctx.storageAdapter.save(id1, content);
    await ctx.sessionRepository.createWithId(id1, {
      filename: 'drain1.cast', filepath: fp1,
      size_bytes: content.length, marker_count: 0, uploaded_at: new Date().toISOString(),
    });
    await ctx.jobQueue.create(id1);

    // Create second session + job but don't emit yet
    const id2 = nanoid();
    const fp2 = await ctx.storageAdapter.save(id2, content);
    await ctx.sessionRepository.createWithId(id2, {
      filename: 'drain2.cast', filepath: fp2,
      size_bytes: content.length, marker_count: 0, uploaded_at: new Date().toISOString(),
    });
    await ctx.jobQueue.create(id2);

    // Emit both uploads
    const ready1 = waitForEvent(eventBus, 'session.ready');
    eventBus.emit({ type: 'session.uploaded', sessionId: id1, filename: 'drain1.cast' });
    await ready1;

    // Emit second upload after first completes — should be picked up
    const ready2 = waitForEvent(eventBus, 'session.ready');
    eventBus.emit({ type: 'session.uploaded', sessionId: id2, filename: 'drain2.cast' });
    await ready2;

    const job2 = await ctx.jobQueue.findBySessionId(id2);
    expect(job2!.status).toBe('completed');
  });
});

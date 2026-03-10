// @vitest-environment node
/**
 * Unit tests for UploadService.
 * Tests file size validation, format validation, session creation, and pipeline triggering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SqliteDatabaseImpl } from '../../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../../src/server/db/database_adapter.js';
import type { SessionAdapter } from '../../../src/server/db/session_adapter.js';
import type { StorageAdapter } from '../../../src/server/storage/storage_adapter.js';
import type { JobQueueAdapter } from '../../../src/server/jobs/job_queue_adapter.js';
import { EmitterEventBusImpl } from '../../../src/server/events/emitter_event_bus_impl.js';
import { UploadService } from '../../../src/server/services/upload_service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../fixtures');

/** Build a minimal valid asciicast file string. */
function buildValidCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'o', '$ echo hello\r\n']),
    JSON.stringify([0.2, 'o', 'hello\r\n']),
  ].join('\n');
}

/** Build a cast with marker events. */
function buildMarkerCast(): string {
  const header = JSON.stringify({ version: 3, term: { cols: 80, rows: 24 } });
  return [
    header,
    JSON.stringify([0.1, 'm', 'Section 1']),
    JSON.stringify([0.2, 'o', 'output\r\n']),
    JSON.stringify([0.3, 'm', 'Section 2']),
  ].join('\n');
}

describe('UploadService.upload', () => {
  let testDir: string;
  let ctx: DatabaseContext;
  let eventBus: EmitterEventBusImpl;
  let service: UploadService;
  let sessionRepository: SessionAdapter;
  let storageAdapter: StorageAdapter;
  let jobQueue: JobQueueAdapter;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-uploadsvc-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    sessionRepository = ctx.sessionRepository;
    storageAdapter = ctx.storageAdapter;
    jobQueue = ctx.jobQueue;
    eventBus = new EmitterEventBusImpl();

    service = new UploadService({
      sessionRepository,
      storageAdapter,
      jobQueue,
      eventBus,
      maxFileSizeMB: 2,
    });
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns 413 when file exceeds size limit', async () => {
    const largeContent = 'x'.repeat(3 * 1024 * 1024);
    const file = new File([largeContent], 'large.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(413);
    expect(result.error).toContain('too large');
  });

  it('returns 400 for invalid asciicast format', async () => {
    const invalidContent = readFileSync(join(FIXTURES_DIR, 'invalid-version.cast'), 'utf-8');
    const file = new File([invalidContent], 'invalid.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
    expect(result.error).toContain('Invalid asciicast');
  });

  it('returns 400 with line number for invalid asciicast', async () => {
    const invalidContent = readFileSync(join(FIXTURES_DIR, 'invalid-version.cast'), 'utf-8');
    const file = new File([invalidContent], 'invalid.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(400);
    expect(result.line).toBeDefined();
  });

  it('creates session record on successful upload', async () => {
    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.session).toHaveProperty('id');
    expect(result.session.filename).toBe('test.cast');
  });

  it('counts markers correctly in returned session', async () => {
    const content = buildMarkerCast();
    const file = new File([content], 'markers.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.session.marker_count).toBe(2);
  });

  it('does not include filepath in returned session data', async () => {
    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(true);
    assert(result.ok);
    expect(result.session).not.toHaveProperty('filepath');
  });

  it('emits session.uploaded event after successful upload', async () => {
    const emitted: string[] = [];
    eventBus.on('session.uploaded', (e) => emitted.push(e.type));

    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    await service.upload(file);

    expect(emitted).toContain('session.uploaded');
  });

  it('creates a job in the queue after upload', async () => {
    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    const result = await service.upload(file);
    expect(result.ok).toBe(true);
    assert(result.ok);
    const id = result.session.id as string;
    const job = await jobQueue.findBySessionId(id);
    expect(job).not.toBeNull();
    expect(job?.status).toBe('pending');
  });

  it('returns 500 when storage save fails', async () => {
    const failStorage = {
      save: () => { throw new Error('Disk full'); },
      read: storageAdapter.read.bind(storageAdapter),
      delete: storageAdapter.delete.bind(storageAdapter),
      exists: storageAdapter.exists.bind(storageAdapter),
    } as unknown as StorageAdapter;
    const failService = new UploadService({
      sessionRepository,
      storageAdapter: failStorage,
      jobQueue,
      eventBus,
      maxFileSizeMB: 2,
    });

    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    const result = await failService.upload(file);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.status).toBe(500);
    expect(result.error).toBe('Failed to save file');
  });

  it('returns safe details when storage save fails — does not expose raw error', async () => {
    const failStorage = {
      save: () => { throw 'quota-exceeded'; },
      read: storageAdapter.read.bind(storageAdapter),
      delete: storageAdapter.delete.bind(storageAdapter),
      exists: storageAdapter.exists.bind(storageAdapter),
    } as unknown as StorageAdapter;
    const failService = new UploadService({
      sessionRepository,
      storageAdapter: failStorage,
      jobQueue,
      eventBus,
      maxFileSizeMB: 2,
    });

    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    const result = await failService.upload(file);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.details).toBe('Storage write failed');
  });

  it('throws when DB insert fails (triggers cleanup path)', async () => {
    const failRepo = {
      createWithId: () => { throw new Error('UNIQUE constraint failed'); },
    } as unknown as SessionAdapter;
    const failService = new UploadService({
      sessionRepository: failRepo,
      storageAdapter,
      jobQueue,
      eventBus,
      maxFileSizeMB: 2,
    });

    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    await expect(failService.upload(file)).rejects.toThrow('UNIQUE constraint failed');
  });

  it('throws when job queue fails after DB insert', async () => {
    const failJobQueue = {
      create: () => { throw new Error('Queue unavailable'); },
      findPending: jobQueue.findPending.bind(jobQueue),
      findBySessionId: jobQueue.findBySessionId.bind(jobQueue),
      start: jobQueue.start.bind(jobQueue),
      advance: jobQueue.advance.bind(jobQueue),
      complete: jobQueue.complete.bind(jobQueue),
      fail: jobQueue.fail.bind(jobQueue),
      recoverInterrupted: jobQueue.recoverInterrupted.bind(jobQueue),
    } as unknown as JobQueueAdapter;
    const failService = new UploadService({
      sessionRepository,
      storageAdapter,
      jobQueue: failJobQueue,
      eventBus,
      maxFileSizeMB: 2,
    });

    const content = buildValidCast();
    const file = new File([content], 'test.cast');
    await expect(failService.upload(file)).rejects.toThrow('Queue unavailable');
  });

  it('accepts files right at the size limit', async () => {
    // 2 MB exactly = 2 * 1024 * 1024 bytes — should be accepted
    const maxBytes = 2 * 1024 * 1024;
    const validPart = buildValidCast();
    // Pad with a trailing newline to fill to exactly maxBytes
    const padding = ' '.repeat(maxBytes - validPart.length);
    const content = validPart + '\n' + padding;
    const file = new File([content.slice(0, maxBytes)], 'exact.cast');
    // File is exactly maxBytes — not over, so should not get 413
    // (it will fail validation if content is malformed, but not size)
    const result = await service.upload(file);
    // We just care it's not a size error
    expect(result.ok || result.status !== 413).toBe(true);
  });
});

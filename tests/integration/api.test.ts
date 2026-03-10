// @vitest-environment node
/**
 * Integration tests for API routes.
 * Tests the full request/response cycle including file storage and DB operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Hono } from 'hono';
import { SqliteDatabaseImpl } from '../../src/server/db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../../src/server/db/database_adapter.js';
import type { SessionAdapter } from '../../src/server/db/session_adapter.js';
import type { SectionAdapter } from '../../src/server/db/section_adapter.js';
import type { StorageAdapter } from '../../src/server/storage/storage_adapter.js';
import type { JobQueueAdapter } from '../../src/server/jobs/job_queue_adapter.js';
import { EmitterEventBusImpl } from '../../src/server/events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from '../../src/server/processing/pipeline_orchestrator.js';
import {
  UploadService,
  SessionService,
  StatusService,
  RetryService,
  EventLogService,
} from '../../src/server/services/index.js';
import { handleUpload } from '../../src/server/routes/upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
  handleRedetect,
} from '../../src/server/routes/sessions.js';
import { handleGetStatus } from '../../src/server/routes/status.js';
import { handleRetry } from '../../src/server/routes/retry.js';
import { handleGetEventLog } from '../../src/server/routes/events.js';
import { handleSseEvents } from '../../src/server/routes/sse.js';
import { PipelineStage } from '../../src/shared/types/pipeline.js';
import { initVt } from '#vt-wasm';

const FIXTURES_DIR = join(new URL('.', import.meta.url).pathname, '..', 'fixtures');

describe('API Routes', () => {
  let testDir: string;
  let app: Hono;
  let ctx: DatabaseContext;
  let sessionRepository: SessionAdapter;
  let sectionRepository: SectionAdapter;
  let storageAdapter: StorageAdapter;
  let jobQueue: JobQueueAdapter;
  let eventBus: EmitterEventBusImpl;
  let orchestrator: PipelineOrchestrator;

  const validFixture = readFileSync(
    join(FIXTURES_DIR, 'valid-with-markers.cast'),
    'utf-8'
  );

  const invalidFixture = readFileSync(
    join(FIXTURES_DIR, 'invalid-version.cast'),
    'utf-8'
  );

  beforeEach(async () => {
    await initVt();

    testDir = mkdtempSync(join(tmpdir(), 'ragts-api-test-'));

    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    sessionRepository = ctx.sessionRepository;
    sectionRepository = ctx.sectionRepository;
    storageAdapter = ctx.storageAdapter;
    jobQueue = ctx.jobQueue;

    eventBus = new EmitterEventBusImpl();
    orchestrator = new PipelineOrchestrator(eventBus, jobQueue, {
      sessionRepository,
      storageAdapter,
    });
    await orchestrator.start();

    const uploadService = new UploadService({
      sessionRepository,
      storageAdapter,
      jobQueue,
      eventBus,
      maxFileSizeMB: 2,
    });

    const sessionService = new SessionService({
      sessionRepository,
      sectionRepository,
      storageAdapter,
      jobQueue,
      eventBus,
    });

    const statusService = new StatusService({ sessionRepository, jobQueue });

    const retryService = new RetryService({ sessionRepository, jobQueue, eventBus });

    const eventLogService = new EventLogService({
      sessionRepository,
      eventLog: ctx.eventLog,
    });

    app = new Hono();
    app.post('/api/upload', (c) => handleUpload(c, uploadService));
    app.get('/api/sessions', (c) => handleListSessions(c, sessionService));
    app.get('/api/sessions/:id', (c) => handleGetSession(c, sessionService));
    app.delete('/api/sessions/:id', (c) => handleDeleteSession(c, sessionService));
    app.post('/api/sessions/:id/redetect', (c) => handleRedetect(c, sessionService));
    app.get('/api/sessions/:id/status', (c) => handleGetStatus(c, statusService));
    app.post('/api/sessions/:id/retry', (c) => handleRetry(c, retryService));
    app.get('/api/events', (c) => handleGetEventLog(c, eventLogService));
    app.get('/api/sessions/:id/events', (c) =>
      handleSseEvents(c, sessionRepository, eventBus, ctx.eventLog)
    );
  });

  afterEach(async () => {
    await orchestrator.stop();
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('POST /api/upload', () => {
    it('should upload valid asciicast file', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const req = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data).toHaveProperty('id');
      expect(data.filename).toBe('test.cast');
      expect(data.marker_count).toBe(3);
      expect(data).toHaveProperty('created_at');
    });

    it('should reject file without upload', async () => {
      const formData = new FormData();

      const req = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('No file');
    });

    it('should reject invalid asciicast file', async () => {
      const formData = new FormData();
      const file = new File([invalidFixture], 'invalid.cast', { type: 'text/plain' });
      formData.append('file', file);

      const req = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Invalid asciicast');
      expect(data).toHaveProperty('line');
    });

    it('should reject file exceeding size limit', async () => {
      const largeContent = 'x'.repeat(2.1 * 1024 * 1024);
      const formData = new FormData();
      const file = new File([largeContent], 'large.cast', { type: 'text/plain' });
      formData.append('file', file);

      const req = new Request('http://localhost/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(413);
      expect(data.error).toContain('too large');
    });
  });

  describe('GET /api/sessions', () => {
    it('should return empty list initially', async () => {
      const req = new Request('http://localhost/api/sessions');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should list uploaded sessions', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );

      const req = new Request('http://localhost/api/sessions');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].filename).toBe('test.cast');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return session with parsed content', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );
      const uploadData = await uploadRes.json();

      const req = new Request(
        `http://localhost/api/sessions/${uploadData.id}`
      );
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe(uploadData.id);
      expect(data.filename).toBe('test.cast');
      expect(data.content).toHaveProperty('header');
      expect(data.content).not.toHaveProperty('events');
      expect(data.content).toHaveProperty('markers');
      expect(data.content.markers).toHaveLength(3);
      expect(data).toHaveProperty('snapshot');
    });

    it('should return 404 for non-existent session', async () => {
      const req = new Request('http://localhost/api/sessions/nonexistent');
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete session from DB and filesystem', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );
      const uploadData = await uploadRes.json();

      await orchestrator.waitForPending();

      const deleteReq = new Request(
        `http://localhost/api/sessions/${uploadData.id}`,
        { method: 'DELETE' }
      );
      const deleteRes = await app.fetch(deleteReq);
      const deleteData = await deleteRes.json();

      expect(deleteRes.status).toBe(200);
      expect(deleteData.success).toBe(true);

      const getReq = new Request(
        `http://localhost/api/sessions/${uploadData.id}`
      );
      const getRes = await app.fetch(getReq);

      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent session', async () => {
      const req = new Request('http://localhost/api/sessions/nonexistent', {
        method: 'DELETE',
      });
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('Full workflow', () => {
    it('should handle upload -> list -> get -> delete flow', async () => {
      // 1. Upload
      const formData = new FormData();
      const file = new File([validFixture], 'workflow-test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );
      const session = await uploadRes.json();

      expect(uploadRes.status).toBe(201);

      // 2. List
      const listRes = await app.fetch(
        new Request('http://localhost/api/sessions')
      );
      const sessions = await listRes.json();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(session.id);

      // 3. Get
      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}`)
      );
      const retrieved = await getRes.json();

      expect(retrieved.id).toBe(session.id);
      expect(retrieved.content).toBeDefined();

      await orchestrator.waitForPending();

      // 4. Delete
      const deleteRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}`, {
          method: 'DELETE',
        })
      );
      const deleteData = await deleteRes.json();

      expect(deleteData.success).toBe(true);

      // 5. Verify deletion
      const listAfterDelete = await app.fetch(
        new Request('http://localhost/api/sessions')
      );
      const sessionsAfterDelete = await listAfterDelete.json();

      expect(sessionsAfterDelete).toHaveLength(0);
    });
  });

  describe('POST /api/sessions/:id/redetect', () => {
    it('should return 202 and trigger async re-detection', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );
      const uploadData = await uploadRes.json();

      await orchestrator.waitForPending();

      const req = new Request(
        `http://localhost/api/sessions/${uploadData.id}/redetect`,
        { method: 'POST' }
      );
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(202);
      expect(data.message).toContain('Re-detection');
      expect(data.sessionId).toBe(uploadData.id);
    });

    it('should return 404 for non-existent session', async () => {
      const req = new Request(
        'http://localhost/api/sessions/nonexistent/redetect',
        { method: 'POST' }
      );
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('Upload with async processing', () => {
    it('should include sections in session response after processing', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );
      const uploadData = await uploadRes.json();

      await orchestrator.waitForPending();

      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      const sessionData = await getRes.json();

      expect(sessionData.sections).toBeDefined();
      expect(Array.isArray(sessionData.sections)).toBe(true);

      const markerSections = sessionData.sections.filter((s: { type: string }) => s.type === 'marker');
      expect(markerSections.length).toBeGreaterThan(0);
    });

    it('should update detection_status after processing', async () => {
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );
      const uploadData = await uploadRes.json();

      await orchestrator.waitForPending();

      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      const sessionData = await getRes.json();

      expect(sessionData.detection_status).toBe('completed');
      expect(sessionData.event_count).toBeGreaterThan(0);
    });
  });

  describe('Error paths', () => {
    it('should return 404 when session file is missing from filesystem', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      await storageAdapter.delete(uploadData.id);

      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      expect(getRes.status).toBe(404);
      const body = await getRes.json();
      expect(body.error).toContain('not found');
    });

    it('should return 404 when deleting non-existent session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/sessions/does-not-exist', { method: 'DELETE' })
      );
      expect(res.status).toBe(404);
    });

    it('should return 404 when redetecting non-existent session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/sessions/nonexistent/redetect', { method: 'POST' })
      );
      expect(res.status).toBe(404);
    });

    it('should handle redetect on session with missing file', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      await storageAdapter.delete(uploadData.id);

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}/redetect`, { method: 'POST' })
      );
      // Redetect treats storage read failures as an internal error
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain('Failed to start re-detection');
    });

    it('should handle session with corrupt snapshot JSON', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      await sessionRepository.updateSnapshot(uploadData.id, '{invalid json');

      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.snapshot).toBeNull();
    });

    it('should handle session with corrupt section snapshot', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      await sectionRepository.create({
        sessionId: uploadData.id,
        type: 'detected',
        startEvent: 0,
        endEvent: 1,
        label: 'corrupt',
        snapshot: '{bad json!',
        startLine: null,
        endLine: null,
      });

      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      const corruptSection = body.sections.find((s: { label: string }) => s.label === 'corrupt');
      expect(corruptSection.snapshot).toBeNull();
    });

    it('should return 500 when list sessions fails', async () => {
      const failApp = new Hono();
      const failingRepo = {
        findAll: () => { throw new Error('DB connection lost'); },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failingRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.get('/api/sessions', (c) => handleListSessions(c, failService));

      const res = await failApp.fetch(new Request('http://localhost/api/sessions'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to list sessions');
    });

    it('should return 500 when get session fails with non-filesystem error', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      const failApp = new Hono();
      const failRepo = {
        findById: () => { throw new Error('DB connection failed'); },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.get('/api/sessions/:id', (c) => handleGetSession(c, failService));

      const res = await failApp.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to retrieve session');
    });

    it('should return 500 when deleteById returns false', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      const failApp = new Hono();
      const failRepo = {
        findById: sessionRepository.findById.bind(sessionRepository),
        deleteById: async () => false,
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.delete('/api/sessions/:id', (c) => handleDeleteSession(c, failService));

      const res = await failApp.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`, { method: 'DELETE' })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to delete session from database');
    });

    it('should return 500 when delete session throws from findById', async () => {
      const failApp = new Hono();
      const failRepo = {
        findById: () => { throw new Error('DB crashed'); },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.delete('/api/sessions/:id', (c) => handleDeleteSession(c, failService));

      const res = await failApp.fetch(
        new Request('http://localhost/api/sessions/any-id', { method: 'DELETE' })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to delete session');
    });

    it('should return 500 without internal details when non-Error is thrown from list sessions', async () => {
      const failApp = new Hono();
      const failRepo = {
        findAll: () => { throw 'string error code'; },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.get('/api/sessions', (c) => handleListSessions(c, failService));

      const res = await failApp.fetch(new Request('http://localhost/api/sessions'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to list sessions');
      expect(body.details).toBeUndefined();
    });

    it('should return 500 without internal details when non-Error is thrown from get session', async () => {
      const failApp = new Hono();
      const failRepo = {
        findById: () => { throw 'non-error-value'; },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.get('/api/sessions/:id', (c) => handleGetSession(c, failService));

      const res = await failApp.fetch(
        new Request('http://localhost/api/sessions/some-id')
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to retrieve session');
      expect(body.details).toBeUndefined();
    });

    it('should return 500 without internal details when non-Error is thrown from delete session', async () => {
      const failApp = new Hono();
      const failRepo = {
        findById: () => { throw 42; },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.delete('/api/sessions/:id', (c) => handleDeleteSession(c, failService));

      const res = await failApp.fetch(
        new Request('http://localhost/api/sessions/any-id', { method: 'DELETE' })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to delete session');
      expect(body.details).toBeUndefined();
    });

    it('should return 500 without internal details when non-Error is thrown from redetect', async () => {
      const failApp = new Hono();
      const failRepo = {
        findById: () => { throw 'redetect-error'; },
      } as unknown as SessionAdapter;
      const failService = new SessionService({
        sessionRepository: failRepo,
        sectionRepository,
        storageAdapter,
        jobQueue,
        eventBus,
      });
      failApp.post('/api/sessions/:id/redetect', (c) => handleRedetect(c, failService));

      const res = await failApp.fetch(
        new Request('http://localhost/api/sessions/any-id/redetect', { method: 'POST' })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to start re-detection');
      expect(body.details).toBeUndefined();
    });

    it('should return safe details when storage save fails during upload', async () => {
      const failApp = new Hono();
      const failStorage = {
        save: () => { throw 'disk-quota-exceeded'; },
        read: storageAdapter.read.bind(storageAdapter),
        delete: storageAdapter.delete.bind(storageAdapter),
        exists: storageAdapter.exists.bind(storageAdapter),
      } as unknown as StorageAdapter;
      const failUploadService = new UploadService({
        sessionRepository,
        storageAdapter: failStorage,
        jobQueue,
        eventBus,
        maxFileSizeMB: 250,
      });
      failApp.post('/api/upload', (c) => handleUpload(c, failUploadService));

      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const res = await failApp.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to save file');
      expect(body.details).toBe('Storage write failed');
    });

    it('should handle delete when file is already removed', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      await storageAdapter.delete(uploadData.id);

      const deleteRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`, { method: 'DELETE' })
      );
      expect(deleteRes.status).toBe(200);
    });

    it('should handle delete when storage throws', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const uploadData = await uploadRes.json();
      await orchestrator.waitForPending();

      const failApp = new Hono();
      const failStorage = {
        delete: () => { throw new Error('Permission denied'); },
      } as unknown as StorageAdapter;
      const failService = new SessionService({
        sessionRepository,
        sectionRepository,
        storageAdapter: failStorage,
        jobQueue,
        eventBus,
      });
      failApp.delete('/api/sessions/:id', (c) => handleDeleteSession(c, failService));

      const res = await failApp.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`, { method: 'DELETE' })
      );
      expect(res.status).toBe(200);
    });

    it('should return 500 when upload storage fails', async () => {
      const failApp = new Hono();
      const failStorage = {
        save: () => { throw new Error('Disk full'); },
        read: storageAdapter.read.bind(storageAdapter),
        delete: storageAdapter.delete.bind(storageAdapter),
        exists: storageAdapter.exists.bind(storageAdapter),
      } as unknown as StorageAdapter;
      const failUploadService = new UploadService({
        sessionRepository,
        storageAdapter: failStorage,
        jobQueue,
        eventBus,
        maxFileSizeMB: 250,
      });
      failApp.post('/api/upload', (c) => handleUpload(c, failUploadService));

      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const res = await failApp.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Failed to save file');
    });

    it('should return 500 when job queue fails after DB insert — updateDetectionStatus succeeds', async () => {
      const failApp = new Hono();
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
      const failUploadService = new UploadService({
        sessionRepository,
        storageAdapter,
        jobQueue: failJobQueue,
        eventBus,
        maxFileSizeMB: 250,
      });
      failApp.post('/api/upload', (c) => handleUpload(c, failUploadService));

      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const res = await failApp.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 when job queue fails and updateDetectionStatus also fails (best-effort catch)', async () => {
      const failApp = new Hono();
      const failJobQueue = {
        create: () => { throw new Error('Queue unavailable'); },
      } as unknown as JobQueueAdapter;
      const failRepo = {
        createWithId: sessionRepository.createWithId.bind(sessionRepository),
        updateDetectionStatus: () => { throw new Error('DB gone during status update'); },
      } as unknown as SessionAdapter;
      const failUploadService = new UploadService({
        sessionRepository: failRepo,
        storageAdapter,
        jobQueue: failJobQueue,
        eventBus,
        maxFileSizeMB: 250,
      });
      failApp.post('/api/upload', (c) => handleUpload(c, failUploadService));

      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const res = await failApp.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 when DB insert fails during upload', async () => {
      const failApp = new Hono();
      const failRepo = {
        createWithId: () => { throw new Error('UNIQUE constraint failed'); },
      } as unknown as SessionAdapter;
      const failUploadService = new UploadService({
        sessionRepository: failRepo,
        storageAdapter,
        jobQueue,
        eventBus,
        maxFileSizeMB: 250,
      });
      failApp.post('/api/upload', (c) => handleUpload(c, failUploadService));

      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const res = await failApp.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 when DB insert fails and cleanup delete also fails', async () => {
      const failApp = new Hono();
      const failRepo = {
        createWithId: () => { throw new Error('UNIQUE constraint failed'); },
      } as unknown as SessionAdapter;
      const failStorage = {
        save: storageAdapter.save.bind(storageAdapter),
        read: storageAdapter.read.bind(storageAdapter),
        delete: () => { throw new Error('Permission denied on cleanup'); },
        exists: storageAdapter.exists.bind(storageAdapter),
      } as unknown as StorageAdapter;
      const failUploadService = new UploadService({
        sessionRepository: failRepo,
        storageAdapter: failStorage,
        jobQueue,
        eventBus,
        maxFileSizeMB: 250,
      });
      failApp.post('/api/upload', (c) => handleUpload(c, failUploadService));

      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const res = await failApp.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });
  });

  // ------------------------------------------------------------------ //
  // New Stage 4+5 routes
  // ------------------------------------------------------------------ //

  describe('GET /api/sessions/:id/status', () => {
    it('returns 200 with completed status when no job exists', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const { id } = await uploadRes.json();
      await orchestrator.waitForPending();

      const res = await app.fetch(new Request(`http://localhost/api/sessions/${id}/status`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(id);
      expect(['completed', 'pending', 'running']).toContain(body.status);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/sessions/nonexistent/status')
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('POST /api/sessions/:id/retry', () => {
    it('returns 200 and restarts a failed job', async () => {
      // Create a session directly (not via upload) so we can control the job state
      const session = await sessionRepository.createWithId('retry-test-session', {
        filename: 'retry-test.cast',
        filepath: '/tmp/retry-test.cast',
        size_bytes: 100,
        marker_count: 0,
        uploaded_at: new Date().toISOString(),
      });
      const job = await jobQueue.create(session.id);
      await jobQueue.start(job.id);
      await jobQueue.fail(job.id, 'Simulated pipeline failure');

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}/retry`, { method: 'POST' })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe(session.id);
      expect(body.message).toContain('Retry started');
    });

    it('returns 400 when no job exists', async () => {
      // Create a raw session without a job
      const session = await sessionRepository.createWithId('no-job-session', {
        filename: 'test.cast',
        filepath: '/tmp/test.cast',
        size_bytes: 100,
        marker_count: 0,
        uploaded_at: new Date().toISOString(),
      });

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}/retry`, { method: 'POST' })
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('returns 409 when job is already running', async () => {
      const session = await sessionRepository.createWithId('running-job-session', {
        filename: 'test.cast',
        filepath: '/tmp/test.cast',
        size_bytes: 100,
        marker_count: 0,
        uploaded_at: new Date().toISOString(),
      });
      const job = await jobQueue.create(session.id);
      await jobQueue.start(job.id);

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}/retry`, { method: 'POST' })
      );
      expect(res.status).toBe(409);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/sessions/nonexistent/retry', { method: 'POST' })
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /api/events', () => {
    it('returns 200 with empty array for session with no events', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const { id } = await uploadRes.json();
      await orchestrator.waitForPending();

      const res = await app.fetch(
        new Request(`http://localhost/api/events?sessionId=${id}`)
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('returns 400 when sessionId query param is missing', async () => {
      const res = await app.fetch(new Request('http://localhost/api/events'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('returns 404 for non-existent session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/events?sessionId=nonexistent')
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /api/sessions/:id/events (SSE)', () => {
    it('returns 200 with text/event-stream content type', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const { id } = await uploadRes.json();

      // Emit terminal event so stream closes immediately
      setImmediate(() => {
        eventBus.emit({ type: 'session.ready', sessionId: id });
      });

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${id}/events`)
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      await res.text();
    });

    it('returns 404 for non-existent session', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/sessions/nonexistent/events')
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });

    it('streams pipeline events for the session and closes on terminal event', async () => {
      const formData = new FormData();
      formData.append('file', new File([validFixture], 'test.cast'));
      const uploadRes = await app.fetch(
        new Request('http://localhost/api/upload', { method: 'POST', body: formData })
      );
      const { id } = await uploadRes.json();

      setImmediate(() => {
        eventBus.emit({ type: 'session.validated', sessionId: id, eventCount: 5 });
        eventBus.emit({ type: 'session.ready', sessionId: id });
      });

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${id}/events`)
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('session.ready');
    });

    it('closes stream on session.failed terminal event', async () => {
      const session = await sessionRepository.createWithId('fail-sse-test', {
        filename: 'test.cast',
        filepath: '/tmp/test.cast',
        size_bytes: 100,
        marker_count: 0,
        uploaded_at: new Date().toISOString(),
      });

      setImmediate(() => {
        eventBus.emit({
          type: 'session.failed',
          sessionId: session.id,
          stage: PipelineStage.Validate,
          error: 'Test failure',
        });
      });

      const res = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}/events`)
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('session.failed');
    });
  });
});

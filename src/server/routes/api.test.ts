/**
 * Integration tests for API routes.
 * Tests the full request/response cycle including file storage and DB operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Hono } from 'hono';
import { SqliteDatabaseImpl } from '../db/sqlite/sqlite_database_impl.js';
import type { DatabaseContext } from '../db/database_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type { SectionAdapter } from '../db/section_adapter.js';
import type { StorageAdapter } from '../storage/storage_adapter.js';
import { handleUpload } from './upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
  handleRedetect,
} from './sessions.js';
import { waitForPipelines } from '../processing/index.js';
import { initVt } from '../../../packages/vt-wasm/index.js';

describe('API Routes', () => {
  let testDir: string;
  let app: Hono;
  let ctx: DatabaseContext;
  let sessionRepository: SessionAdapter;
  let sectionRepository: SectionAdapter;
  let storageAdapter: StorageAdapter;

  const validFixture = readFileSync(
    join(__dirname, '../../..', 'tests', 'fixtures', 'valid-with-markers.cast'),
    'utf-8'
  );

  const invalidFixture = readFileSync(
    join(__dirname, '../../..', 'tests', 'fixtures', 'invalid-version.cast'),
    'utf-8'
  );

  beforeEach(async () => {
    // Initialize WASM module once before tests
    await initVt();

    // Create temporary directory for each test
    testDir = mkdtempSync(join(tmpdir(), 'ragts-api-test-'));

    // Initialize database and repositories
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
    sessionRepository = ctx.sessionRepository;
    sectionRepository = ctx.sectionRepository;
    storageAdapter = ctx.storageAdapter;

    // Setup Hono app with routes
    app = new Hono();
    app.post('/api/upload', (c) =>
      handleUpload(c, sessionRepository, sectionRepository, storageAdapter, 2)
    );
    app.get('/api/sessions', (c) => handleListSessions(c, sessionRepository));
    app.get('/api/sessions/:id', (c) =>
      handleGetSession(c, sessionRepository, sectionRepository, storageAdapter)
    );
    app.delete('/api/sessions/:id', (c) =>
      handleDeleteSession(c, sessionRepository, storageAdapter)
    );
    app.post('/api/sessions/:id/redetect', (c) =>
      handleRedetect(c, sessionRepository, sectionRepository, storageAdapter)
    );
  });

  afterEach(async () => {
    // Wait for all in-flight pipelines to complete before teardown
    await waitForPipelines();
    // Close database before removing files
    ctx.close();
    // Clean up temporary directory
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
      // Create file just over the 2MB limit configured below
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
      // Upload a session first
      const formData = new FormData();
      const file = new File([validFixture], 'test.cast', { type: 'text/plain' });
      formData.append('file', file);

      await app.fetch(
        new Request('http://localhost/api/upload', {
          method: 'POST',
          body: formData,
        })
      );

      // List sessions
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
      // Upload a session first
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

      // Get session
      const req = new Request(
        `http://localhost/api/sessions/${uploadData.id}`
      );
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe(uploadData.id);
      expect(data.filename).toBe('test.cast');
      expect(data.content).toHaveProperty('header');
      expect(data.content).not.toHaveProperty('events'); // events are excluded per Stage 3
      expect(data.content).toHaveProperty('markers');
      expect(data.content.markers).toHaveLength(3);
      // Snapshot field should exist (may be null if not yet processed)
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
      // Upload a session first
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

      // Wait for upload pipeline to finish before deleting the file
      await waitForPipelines();

      // Delete session
      const deleteReq = new Request(
        `http://localhost/api/sessions/${uploadData.id}`,
        { method: 'DELETE' }
      );
      const deleteRes = await app.fetch(deleteReq);
      const deleteData = await deleteRes.json();

      expect(deleteRes.status).toBe(200);
      expect(deleteData.success).toBe(true);

      // Verify session no longer exists
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

      // Wait for upload pipeline to finish before deleting the file
      await waitForPipelines();

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
      // Upload a session first
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

      // Wait for initial processing to complete
      await waitForPipelines();

      // Trigger re-detection
      const req = new Request(
        `http://localhost/api/sessions/${uploadData.id}/redetect`,
        { method: 'POST' }
      );
      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(202);
      expect(data.message).toContain('Re-detection started');
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
      // Upload a session
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

      // Wait for async processing to complete
      await waitForPipelines();

      // Get session - should include sections
      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      const sessionData = await getRes.json();

      expect(sessionData.sections).toBeDefined();
      expect(Array.isArray(sessionData.sections)).toBe(true);

      // Should have marker sections (validFixture has 3 markers)
      const markerSections = sessionData.sections.filter((s: any) => s.type === 'marker');
      expect(markerSections.length).toBeGreaterThan(0);
    });

    it('should update detection_status after processing', async () => {
      // Upload a session
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

      // Wait for async processing to complete
      await waitForPipelines();

      // Get session - check status
      const getRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${uploadData.id}`)
      );
      const sessionData = await getRes.json();

      expect(sessionData.detection_status).toBe('completed');
      expect(sessionData.event_count).toBeGreaterThan(0);
    });
  });
});

/**
 * Integration tests for API routes.
 * Tests the full request/response cycle including file storage and DB operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Hono } from 'hono';
import { initDatabase } from '../db/database.js';
import { SqliteSessionRepository } from '../db/sqlite-session-repository.js';
import { handleUpload } from './upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
} from './sessions.js';

describe('API Routes', () => {
  let testDir: string;
  let app: Hono;
  let repository: SqliteSessionRepository;

  const validFixture = readFileSync(
    join(__dirname, '../../..', 'tests', 'fixtures', 'valid-with-markers.cast'),
    'utf-8'
  );

  const invalidFixture = readFileSync(
    join(__dirname, '../../..', 'tests', 'fixtures', 'invalid-version.cast'),
    'utf-8'
  );

  beforeEach(() => {
    // Create temporary directory for each test
    testDir = mkdtempSync(join(tmpdir(), 'ragts-api-test-'));

    // Initialize database and repository
    const dbPath = join(testDir, 'test.db');
    const db = initDatabase(dbPath);
    repository = new SqliteSessionRepository(db);

    // Setup Hono app with routes
    app = new Hono();
    app.post('/api/upload', (c) =>
      handleUpload(c, repository, testDir, 50)
    );
    app.get('/api/sessions', (c) => handleListSessions(c, repository));
    app.get('/api/sessions/:id', (c) => handleGetSession(c, repository));
    app.delete('/api/sessions/:id', (c) => handleDeleteSession(c, repository));
  });

  afterEach(() => {
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
      // Create file larger than 50MB limit
      const largeContent = 'x'.repeat(51 * 1024 * 1024);
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
      expect(data.content).toHaveProperty('events');
      expect(data.content).toHaveProperty('markers');
      expect(data.content.markers).toHaveLength(3);
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
});

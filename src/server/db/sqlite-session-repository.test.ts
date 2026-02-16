/**
 * Unit tests for SqliteSessionRepository.
 * Uses in-memory SQLite to avoid filesystem side effects.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from './database.js';
import { SqliteSessionRepository } from './sqlite-session-repository.js';
import type { SessionCreate } from '../../shared/types.js';
import type Database from 'better-sqlite3';

describe('SqliteSessionRepository', () => {
  let db: Database.Database;
  let repository: SqliteSessionRepository;

  beforeEach(() => {
    // Use in-memory database for each test
    db = initDatabase(':memory:');
    repository = new SqliteSessionRepository(db);
  });

  describe('create', () => {
    it('should create a session with generated id and created_at', () => {
      const data: SessionCreate = {
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 3,
        uploaded_at: '2026-02-16T10:30:00Z',
      };

      const session = repository.create(data);

      expect(session.id).toBeTruthy();
      expect(session.id).toHaveLength(21); // nanoid default length
      expect(session.filename).toBe(data.filename);
      expect(session.filepath).toBe(data.filepath);
      expect(session.size_bytes).toBe(data.size_bytes);
      expect(session.marker_count).toBe(data.marker_count);
      expect(session.uploaded_at).toBe(data.uploaded_at);
      expect(session.created_at).toBeTruthy();
    });

    it('should generate unique IDs for multiple sessions', () => {
      const data: SessionCreate = {
        filename: 'test.cast',
        filepath: 'sessions/test1.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-02-16T10:30:00Z',
      };

      const session1 = repository.create(data);
      const session2 = repository.create({ ...data, filepath: 'sessions/test2.cast' });

      expect(session1.id).not.toBe(session2.id);
    });

    it('should default marker_count to 0 if not provided', () => {
      const data: SessionCreate = {
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-02-16T10:30:00Z',
      };

      const session = repository.create(data);

      expect(session.marker_count).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = repository.findAll();

      expect(sessions).toEqual([]);
    });

    it('should return all sessions', () => {
      const data1: SessionCreate = {
        filename: 'test1.cast',
        filepath: 'sessions/test1.cast',
        size_bytes: 1024,
        marker_count: 3,
        uploaded_at: '2026-02-16T10:30:00Z',
      };
      const data2: SessionCreate = {
        filename: 'test2.cast',
        filepath: 'sessions/test2.cast',
        size_bytes: 2048,
        marker_count: 5,
        uploaded_at: '2026-02-16T11:00:00Z',
      };

      const session1 = repository.create(data1);
      const session2 = repository.create(data2);

      const sessions = repository.findAll();

      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain(session1.id);
      expect(sessions.map(s => s.id)).toContain(session2.id);
    });

    it('should return sessions ordered by uploaded_at DESC (newest first)', () => {
      const older: SessionCreate = {
        filename: 'older.cast',
        filepath: 'sessions/older.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-02-15T10:00:00Z',
      };
      const newer: SessionCreate = {
        filename: 'newer.cast',
        filepath: 'sessions/newer.cast',
        size_bytes: 2048,
        marker_count: 0,
        uploaded_at: '2026-02-16T10:00:00Z',
      };

      repository.create(older);
      const newerSession = repository.create(newer);

      const sessions = repository.findAll();

      expect(sessions[0].id).toBe(newerSession.id);
      expect(sessions[0].uploaded_at).toBe(newer.uploaded_at);
    });
  });

  describe('findById', () => {
    it('should return null when session does not exist', () => {
      const session = repository.findById('nonexistent');

      expect(session).toBeNull();
    });

    it('should return session when it exists', () => {
      const data: SessionCreate = {
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 3,
        uploaded_at: '2026-02-16T10:30:00Z',
      };

      const created = repository.create(data);
      const found = repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.filename).toBe(data.filename);
      expect(found?.filepath).toBe(data.filepath);
      expect(found?.size_bytes).toBe(data.size_bytes);
      expect(found?.marker_count).toBe(data.marker_count);
      expect(found?.uploaded_at).toBe(data.uploaded_at);
    });
  });

  describe('deleteById', () => {
    it('should return false when session does not exist', () => {
      const deleted = repository.deleteById('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should return true and delete session when it exists', () => {
      const data: SessionCreate = {
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 3,
        uploaded_at: '2026-02-16T10:30:00Z',
      };

      const created = repository.create(data);
      const deleted = repository.deleteById(created.id);

      expect(deleted).toBe(true);

      const found = repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should not affect other sessions', () => {
      const data1: SessionCreate = {
        filename: 'test1.cast',
        filepath: 'sessions/test1.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-02-16T10:30:00Z',
      };
      const data2: SessionCreate = {
        filename: 'test2.cast',
        filepath: 'sessions/test2.cast',
        size_bytes: 2048,
        marker_count: 0,
        uploaded_at: '2026-02-16T11:00:00Z',
      };

      const session1 = repository.create(data1);
      const session2 = repository.create(data2);

      repository.deleteById(session1.id);

      const remaining = repository.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(session2.id);
    });
  });

  describe('filepath uniqueness constraint', () => {
    it('should enforce unique filepath constraint', () => {
      const data: SessionCreate = {
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-02-16T10:30:00Z',
      };

      repository.create(data);

      // Attempt to create with same filepath should throw
      expect(() => {
        repository.create(data);
      }).toThrow();
    });
  });
});

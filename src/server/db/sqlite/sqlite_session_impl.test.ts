/**
 * Unit tests for SqliteSessionImpl.
 * Uses an in-memory SQLite database to avoid filesystem side effects.
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { SqliteDatabaseImpl } from './sqlite_database_impl.js';
import type { SessionAdapter } from '../session_adapter.js';
import type { SectionAdapter } from '../section_adapter.js';
import type { DatabaseContext } from '../database_adapter.js';
import { createTestSession } from './test_fixtures.js';
import type { ProcessedSession } from '../../processing/types.js';

describe('SqliteSessionImpl', () => {
  let ctx: DatabaseContext;
  let repository: SessionAdapter;
  let sectionRepository: SectionAdapter;

  beforeEach(async () => {
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpdir(), dbPath: ':memory:' });
    repository = ctx.sessionRepository;
    sectionRepository = ctx.sectionRepository;
  });

  afterEach(async () => {
    await ctx.close();
  });

  describe('create', () => {
    it('should create a session with generated id and created_at', async () => {
      const data = createTestSession({ marker_count: 3, uploaded_at: '2026-02-16T10:30:00Z' });

      const session = await repository.create(data);

      expect(session.id).toBeTruthy();
      expect(session.id).toHaveLength(21); // nanoid default length
      expect(session.filename).toBe(data.filename);
      expect(session.filepath).toBe(data.filepath);
      expect(session.size_bytes).toBe(data.size_bytes);
      expect(session.marker_count).toBe(data.marker_count);
      expect(session.uploaded_at).toBe(data.uploaded_at);
      expect(session.created_at).toBeTruthy();
    });

    it('should generate unique IDs for multiple sessions', async () => {
      const data = createTestSession({ filepath: 'sessions/test1.cast' });

      const session1 = await repository.create(data);
      const session2 = await repository.create({ ...data, filepath: 'sessions/test2.cast' });

      expect(session1.id).not.toBe(session2.id);
    });

    it('should default marker_count to 0 if not provided', async () => {
      const data = createTestSession();

      const session = await repository.create(data);

      expect(session.marker_count).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no sessions exist', async () => {
      const sessions = await repository.findAll();

      expect(sessions).toEqual([]);
    });

    it('should return all sessions', async () => {
      const data1 = createTestSession({ filename: 'test1.cast', filepath: 'sessions/test1.cast', marker_count: 3, uploaded_at: '2026-02-16T10:30:00Z' });
      const data2 = createTestSession({ filename: 'test2.cast', filepath: 'sessions/test2.cast', size_bytes: 2048, marker_count: 5, uploaded_at: '2026-02-16T11:00:00Z' });

      const session1 = await repository.create(data1);
      const session2 = await repository.create(data2);

      const sessions = await repository.findAll();

      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain(session1.id);
      expect(sessions.map(s => s.id)).toContain(session2.id);
    });

    it('should return sessions ordered by uploaded_at DESC (newest first)', async () => {
      const older = createTestSession({ filename: 'older.cast', filepath: 'sessions/older.cast', uploaded_at: '2026-02-15T10:00:00Z' });
      const newer = createTestSession({ filename: 'newer.cast', filepath: 'sessions/newer.cast', size_bytes: 2048, uploaded_at: '2026-02-16T10:00:00Z' });

      await repository.create(older);
      const newerSession = await repository.create(newer);

      const sessions = await repository.findAll();

      expect(sessions[0]!.id).toBe(newerSession.id);
      expect(sessions[0]!.uploaded_at).toBe(newer.uploaded_at);
    });
  });

  describe('findById', () => {
    it('should return null when session does not exist', async () => {
      const session = await repository.findById('nonexistent');

      expect(session).toBeNull();
    });

    it('should return session when it exists', async () => {
      const data = createTestSession({ marker_count: 3, uploaded_at: '2026-02-16T10:30:00Z' });

      const created = await repository.create(data);
      const found = await repository.findById(created.id);

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
    it('should return false when session does not exist', async () => {
      const deleted = await repository.deleteById('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should return true and delete session when it exists', async () => {
      const data = createTestSession({ marker_count: 3, uploaded_at: '2026-02-16T10:30:00Z' });

      const created = await repository.create(data);
      const deleted = await repository.deleteById(created.id);

      expect(deleted).toBe(true);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should not affect other sessions', async () => {
      const data1 = createTestSession({ filename: 'test1.cast', filepath: 'sessions/test1.cast', uploaded_at: '2026-02-16T10:30:00Z' });
      const data2 = createTestSession({ filename: 'test2.cast', filepath: 'sessions/test2.cast', size_bytes: 2048, uploaded_at: '2026-02-16T11:00:00Z' });

      const session1 = await repository.create(data1);
      const session2 = await repository.create(data2);

      await repository.deleteById(session1.id);

      const remaining = await repository.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(session2.id);
    });
  });

  describe('filepath uniqueness constraint', () => {
    it('should enforce unique filepath constraint', async () => {
      const data = createTestSession();

      await repository.create(data);

      // Attempt to create with same filepath should throw
      await expect(repository.create(data)).rejects.toThrow();
    });
  });

  describe('completeProcessing — CLI section denormalization', () => {
    /** Builds a minimal ProcessedSession for testing. */
    function buildProcessedSession(
      sessionId: string,
      sessionSnapshot: object,
      sections: ProcessedSession['sections']
    ): ProcessedSession {
      return {
        sessionId,
        snapshot: JSON.stringify(sessionSnapshot),
        sections,
        eventCount: 10,
        detectedSectionsCount: sections.length,
      };
    }

    it('populates snapshot for CLI sections from session snapshot', async () => {
      const session = await repository.create(createTestSession());
      const sessionLines = Array.from({ length: 20 }, (_, i) => ({ text: `line ${i}` }));

      await repository.completeProcessing(
        buildProcessedSession(session.id, { lines: sessionLines }, [
          {
            sessionId: session.id,
            type: 'detected',
            startEvent: 0,
            endEvent: 5,
            label: null,
            snapshot: null,
            startLine: 0,
            endLine: 10,
          },
        ])
      );

      const sections = await sectionRepository.findBySessionId(session.id);
      expect(sections).toHaveLength(1);
      const section = sections[0]!;
      expect(section.snapshot).not.toBeNull();
      const parsed = JSON.parse(section.snapshot!) as { lines: unknown[] };
      expect(parsed.lines).toHaveLength(10);
    });

    it('CLI section snapshot contains the correct sliced lines', async () => {
      const session = await repository.create(createTestSession());
      const sessionLines = Array.from({ length: 30 }, (_, i) => ({ text: `line ${i}` }));

      await repository.completeProcessing(
        buildProcessedSession(session.id, { lines: sessionLines }, [
          {
            sessionId: session.id,
            type: 'detected',
            startEvent: 0,
            endEvent: 5,
            label: null,
            snapshot: null,
            startLine: 5,
            endLine: 15,
          },
        ])
      );

      const sections = await sectionRepository.findBySessionId(session.id);
      const parsed = JSON.parse(sections[0]!.snapshot!) as { lines: Array<{ text: string }> };
      expect(parsed.lines[0]!.text).toBe('line 5');
      expect(parsed.lines[9]!.text).toBe('line 14');
    });

    it('TUI sections retain their existing snapshot unchanged', async () => {
      const session = await repository.create(createTestSession());
      const tuiSnapshot = JSON.stringify({ lines: [{ text: 'tui-output' }] });

      await repository.completeProcessing(
        buildProcessedSession(session.id, { lines: [] }, [
          {
            sessionId: session.id,
            type: 'detected',
            startEvent: 0,
            endEvent: 5,
            label: null,
            snapshot: tuiSnapshot,
            startLine: null,
            endLine: null,
          },
        ])
      );

      const sections = await sectionRepository.findBySessionId(session.id);
      const parsed = JSON.parse(sections[0]!.snapshot!) as { lines: Array<{ text: string }> };
      expect(parsed.lines[0]!.text).toBe('tui-output');
    });

    it('stores line_count for CLI sections', async () => {
      const session = await repository.create(createTestSession());
      const sessionLines = Array.from({ length: 50 }, (_, i) => ({ text: `line ${i}` }));

      await repository.completeProcessing(
        buildProcessedSession(session.id, { lines: sessionLines }, [
          {
            sessionId: session.id,
            type: 'detected',
            startEvent: 0,
            endEvent: 5,
            label: null,
            snapshot: null,
            startLine: 0,
            endLine: 25,
          },
        ])
      );

      const sections = await sectionRepository.findBySessionId(session.id);
      expect(sections[0]!.line_count).toBe(25);
    });

    it('stores line_count for TUI sections from snapshot line count', async () => {
      const session = await repository.create(createTestSession());
      const tuiSnapshot = JSON.stringify({
        lines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });

      await repository.completeProcessing(
        buildProcessedSession(session.id, { lines: [] }, [
          {
            sessionId: session.id,
            type: 'detected',
            startEvent: 0,
            endEvent: 5,
            label: null,
            snapshot: tuiSnapshot,
            startLine: null,
            endLine: null,
          },
        ])
      );

      const sections = await sectionRepository.findBySessionId(session.id);
      expect(sections[0]!.line_count).toBe(3);
    });

    it('stores non-null content_hash for all sections', async () => {
      const session = await repository.create(createTestSession());
      const sessionLines = Array.from({ length: 10 }, (_, i) => ({ text: `line ${i}` }));

      await repository.completeProcessing(
        buildProcessedSession(session.id, { lines: sessionLines }, [
          {
            sessionId: session.id,
            type: 'detected',
            startEvent: 0,
            endEvent: 5,
            label: null,
            snapshot: null,
            startLine: 0,
            endLine: 5,
          },
        ])
      );

      const sections = await sectionRepository.findBySessionId(session.id);
      expect(sections[0]!.content_hash).not.toBeNull();
      expect(typeof sections[0]!.content_hash).toBe('string');
      expect(sections[0]!.content_hash!.length).toBe(16);
    });

    it('replaces existing sections atomically on second call', async () => {
      const session = await repository.create(createTestSession());
      const sessionLines = Array.from({ length: 10 }, (_, i) => ({ text: `line ${i}` }));

      const processed = buildProcessedSession(session.id, { lines: sessionLines }, [
        {
          sessionId: session.id,
          type: 'detected',
          startEvent: 0,
          endEvent: 5,
          label: 'First',
          snapshot: null,
          startLine: 0,
          endLine: 5,
        },
      ]);

      await repository.completeProcessing(processed);
      await repository.completeProcessing({
        ...processed,
        sections: [
          { ...processed.sections[0]!, label: 'Second', startLine: 5, endLine: 10 },
        ],
      });

      const sections = await sectionRepository.findBySessionId(session.id);
      expect(sections).toHaveLength(1);
      expect(sections[0]!.label).toBe('Second');
    });
  });
});

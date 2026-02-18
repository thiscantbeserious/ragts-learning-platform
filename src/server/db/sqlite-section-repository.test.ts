/**
 * Unit tests for SqliteSectionRepository.
 * Uses in-memory SQLite to avoid filesystem side effects.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from './database.js';
import { SqliteSectionRepository } from './sqlite-section-repository.js';
import { SqliteSessionRepository } from './sqlite-session-repository.js';
import type { CreateSectionInput } from './sqlite-section-repository.js';
import type { SessionCreate } from '../../shared/types.js';
import type Database from 'better-sqlite3';

describe('SqliteSectionRepository', () => {
  let db: Database.Database;
  let sectionRepo: SqliteSectionRepository;
  let sessionRepo: SqliteSessionRepository;
  let testSessionId: string;

  beforeEach(() => {
    // Use in-memory database for each test
    db = initDatabase(':memory:');
    sectionRepo = new SqliteSectionRepository(db);
    sessionRepo = new SqliteSessionRepository(db);

    // Create a test session for use in tests
    const sessionData: SessionCreate = {
      filename: 'test.cast',
      filepath: 'sessions/test.cast',
      size_bytes: 1024,
      marker_count: 3,
      uploaded_at: '2026-02-17T10:00:00Z',
    };
    const session = sessionRepo.create(sessionData);
    testSessionId = session.id;
  });

  describe('create', () => {
    it('should create a section with generated id and created_at', () => {
      const input: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Setup',
        snapshot: JSON.stringify({ cursor: { x: 0, y: 0 } }),
      };

      const section = sectionRepo.create(input);

      expect(section.id).toBeTruthy();
      expect(section.id).toHaveLength(21); // nanoid default length
      expect(section.session_id).toBe(input.sessionId);
      expect(section.type).toBe(input.type);
      expect(section.start_event).toBe(input.startEvent);
      expect(section.end_event).toBe(input.endEvent);
      expect(section.label).toBe(input.label);
      expect(section.snapshot).toBe(input.snapshot);
      expect(section.created_at).toBeTruthy();
    });

    it('should accept null values for optional fields', () => {
      const input: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 5,
        endEvent: null, // EOF
        label: null,
        snapshot: null,
      };

      const section = sectionRepo.create(input);

      expect(section.end_event).toBeNull();
      expect(section.label).toBeNull();
      expect(section.snapshot).toBeNull();
    });

    it('should generate unique IDs for multiple sections', () => {
      const input: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Section 1',
        snapshot: null,
      };

      const section1 = sectionRepo.create(input);
      const section2 = sectionRepo.create({ ...input, startEvent: 11, endEvent: 20, label: 'Section 2' });

      expect(section1.id).not.toBe(section2.id);
    });
  });

  describe('findBySessionId', () => {
    it('should return empty array when no sections exist', () => {
      const sections = sectionRepo.findBySessionId(testSessionId);

      expect(sections).toEqual([]);
    });

    it('should return all sections for a session', () => {
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Section 1',
        snapshot: null,
      };
      const input2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 11,
        endEvent: 20,
        label: 'Section 2',
        snapshot: null,
      };

      const section1 = sectionRepo.create(input1);
      const section2 = sectionRepo.create(input2);

      const sections = sectionRepo.findBySessionId(testSessionId);

      expect(sections).toHaveLength(2);
      expect(sections.map(s => s.id)).toContain(section1.id);
      expect(sections.map(s => s.id)).toContain(section2.id);
    });

    it('should return sections ordered by start_event ASC', () => {
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 20,
        endEvent: 30,
        label: 'Later section',
        snapshot: null,
      };
      const input2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Earlier section',
        snapshot: null,
      };
      const input3: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 10,
        endEvent: 20,
        label: 'Middle section',
        snapshot: null,
      };

      sectionRepo.create(input1);
      sectionRepo.create(input2);
      sectionRepo.create(input3);

      const sections = sectionRepo.findBySessionId(testSessionId);

      expect(sections).toHaveLength(3);
      expect(sections[0].start_event).toBe(0);
      expect(sections[0].label).toBe('Earlier section');
      expect(sections[1].start_event).toBe(10);
      expect(sections[1].label).toBe('Middle section');
      expect(sections[2].start_event).toBe(20);
      expect(sections[2].label).toBe('Later section');
    });

    it('should not return sections from other sessions', () => {
      // Create another session
      const otherSessionData: SessionCreate = {
        filename: 'other.cast',
        filepath: 'sessions/other.cast',
        size_bytes: 2048,
        marker_count: 0,
        uploaded_at: '2026-02-17T11:00:00Z',
      };
      const otherSession = sessionRepo.create(otherSessionData);

      // Create section in test session
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Test session section',
        snapshot: null,
      };
      sectionRepo.create(input1);

      // Create section in other session
      const input2: CreateSectionInput = {
        sessionId: otherSession.id,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Other session section',
        snapshot: null,
      };
      sectionRepo.create(input2);

      // Query test session sections
      const sections = sectionRepo.findBySessionId(testSessionId);

      expect(sections).toHaveLength(1);
      expect(sections[0].session_id).toBe(testSessionId);
      expect(sections[0].label).toBe('Test session section');
    });
  });

  describe('deleteBySessionId', () => {
    it('should return 0 when no sections exist', () => {
      const count = sectionRepo.deleteBySessionId(testSessionId);

      expect(count).toBe(0);
    });

    it('should delete all sections for a session', () => {
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Section 1',
        snapshot: null,
      };
      const input2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 11,
        endEvent: 20,
        label: 'Section 2',
        snapshot: null,
      };

      sectionRepo.create(input1);
      sectionRepo.create(input2);

      const count = sectionRepo.deleteBySessionId(testSessionId);

      expect(count).toBe(2);

      const remaining = sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(0);
    });

    it('should delete only detected sections when type is specified', () => {
      const markerInput: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Marker section',
        snapshot: null,
      };
      const detectedInput1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 11,
        endEvent: 20,
        label: 'Detected section 1',
        snapshot: null,
      };
      const detectedInput2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 21,
        endEvent: 30,
        label: 'Detected section 2',
        snapshot: null,
      };

      sectionRepo.create(markerInput);
      sectionRepo.create(detectedInput1);
      sectionRepo.create(detectedInput2);

      const count = sectionRepo.deleteBySessionId(testSessionId, 'detected');

      expect(count).toBe(2);

      const remaining = sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('marker');
      expect(remaining[0].label).toBe('Marker section');
    });

    it('should delete only marker sections when type is specified', () => {
      const markerInput1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Marker section 1',
        snapshot: null,
      };
      const markerInput2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 11,
        endEvent: 20,
        label: 'Marker section 2',
        snapshot: null,
      };
      const detectedInput: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 21,
        endEvent: 30,
        label: 'Detected section',
        snapshot: null,
      };

      sectionRepo.create(markerInput1);
      sectionRepo.create(markerInput2);
      sectionRepo.create(detectedInput);

      const count = sectionRepo.deleteBySessionId(testSessionId, 'marker');

      expect(count).toBe(2);

      const remaining = sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('detected');
      expect(remaining[0].label).toBe('Detected section');
    });

    it('should not affect sections from other sessions', () => {
      // Create another session
      const otherSessionData: SessionCreate = {
        filename: 'other.cast',
        filepath: 'sessions/other.cast',
        size_bytes: 2048,
        marker_count: 0,
        uploaded_at: '2026-02-17T11:00:00Z',
      };
      const otherSession = sessionRepo.create(otherSessionData);

      // Create sections in both sessions
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Test session section',
        snapshot: null,
      };
      const input2: CreateSectionInput = {
        sessionId: otherSession.id,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Other session section',
        snapshot: null,
      };

      sectionRepo.create(input1);
      sectionRepo.create(input2);

      // Delete test session sections
      const count = sectionRepo.deleteBySessionId(testSessionId);

      expect(count).toBe(1);

      // Other session sections should remain
      const otherSections = sectionRepo.findBySessionId(otherSession.id);
      expect(otherSections).toHaveLength(1);
      expect(otherSections[0].label).toBe('Other session section');
    });
  });

  describe('deleteById', () => {
    it('should return false when section does not exist', () => {
      const deleted = sectionRepo.deleteById('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should return true and delete section when it exists', () => {
      const input: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Section to delete',
        snapshot: null,
      };

      const section = sectionRepo.create(input);
      const deleted = sectionRepo.deleteById(section.id);

      expect(deleted).toBe(true);

      const sections = sectionRepo.findBySessionId(testSessionId);
      expect(sections).toHaveLength(0);
    });

    it('should not affect other sections', () => {
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Section 1',
        snapshot: null,
      };
      const input2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 11,
        endEvent: 20,
        label: 'Section 2',
        snapshot: null,
      };

      const section1 = sectionRepo.create(input1);
      const section2 = sectionRepo.create(input2);

      sectionRepo.deleteById(section1.id);

      const remaining = sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(section2.id);
      expect(remaining[0].label).toBe('Section 2');
    });
  });

  describe('foreign key cascade', () => {
    it('should delete sections when parent session is deleted', () => {
      // Create sections
      const input1: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Section 1',
        snapshot: null,
      };
      const input2: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'detected',
        startEvent: 11,
        endEvent: 20,
        label: 'Section 2',
        snapshot: null,
      };

      sectionRepo.create(input1);
      sectionRepo.create(input2);

      // Verify sections exist
      let sections = sectionRepo.findBySessionId(testSessionId);
      expect(sections).toHaveLength(2);

      // Delete parent session
      sessionRepo.deleteById(testSessionId);

      // Sections should be automatically deleted
      sections = sectionRepo.findBySessionId(testSessionId);
      expect(sections).toHaveLength(0);
    });
  });

  describe('snapshot column', () => {
    it('should accept JSON blob', () => {
      const snapshot = {
        cursor: { x: 10, y: 5 },
        screen: [[{ char: 'a', attr: 0 }]],
      };

      const input: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'With snapshot',
        snapshot: JSON.stringify(snapshot),
      };

      const section = sectionRepo.create(input);

      expect(section.snapshot).toBeTruthy();
      expect(JSON.parse(section.snapshot!)).toEqual(snapshot);
    });

    it('should accept null snapshot', () => {
      const input: CreateSectionInput = {
        sessionId: testSessionId,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Without snapshot',
        snapshot: null,
      };

      const section = sectionRepo.create(input);

      expect(section.snapshot).toBeNull();
    });
  });

  describe('updateDetectionStatus', () => {
    it('should update detection status only', () => {
      sessionRepo.updateDetectionStatus(testSessionId, 'completed');

      const session = sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      // Note: Need to cast to any to access new fields not in Session type yet
      expect((session as any).detection_status).toBe('completed');
    });

    it('should update detection status and event count', () => {
      sessionRepo.updateDetectionStatus(testSessionId, 'completed', 100);

      const session = sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('completed');
      expect((session as any).event_count).toBe(100);
    });

    it('should update all metadata fields', () => {
      sessionRepo.updateDetectionStatus(testSessionId, 'completed', 150, 5);

      const session = sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('completed');
      expect((session as any).event_count).toBe(150);
      expect((session as any).detected_sections_count).toBe(5);
    });

    it('should update status to failed', () => {
      sessionRepo.updateDetectionStatus(testSessionId, 'failed', 50);

      const session = sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('failed');
      expect((session as any).event_count).toBe(50);
    });
  });

  describe('migration schema', () => {
    it('should have created sections table with all columns', () => {
      const tableInfo = db.pragma('table_info(sections)');

      const columns = tableInfo.map((col: any) => col.name);
      expect(columns).toContain('id');
      expect(columns).toContain('session_id');
      expect(columns).toContain('type');
      expect(columns).toContain('start_event');
      expect(columns).toContain('end_event');
      expect(columns).toContain('label');
      expect(columns).toContain('snapshot');
      expect(columns).toContain('created_at');
    });

    it('should have created sections indexes', () => {
      const indexes = db.pragma('index_list(sections)');

      const indexNames = indexes.map((idx: any) => idx.name);
      expect(indexNames).toContain('idx_sections_session_id');
      expect(indexNames).toContain('idx_sections_start_event');
    });

    it('should have added new columns to sessions table', () => {
      const tableInfo = db.pragma('table_info(sessions)');

      const columns = tableInfo.map((col: any) => col.name);
      expect(columns).toContain('agent_type');
      expect(columns).toContain('event_count');
      expect(columns).toContain('detected_sections_count');
      expect(columns).toContain('detection_status');
    });

    it('should have created agent_type index on sessions table', () => {
      const indexes = db.pragma('index_list(sessions)');

      const indexNames = indexes.map((idx: any) => idx.name);
      expect(indexNames).toContain('idx_sessions_agent_type');
    });
  });
});

/**
 * Unit tests for SqliteSectionImpl.
 * Uses an in-memory SQLite database to avoid filesystem side effects.
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { SqliteDatabaseImpl } from './sqlite_database_impl.js';
import type { SectionAdapter } from '../section_adapter.js';
import type { SessionAdapter } from '../session_adapter.js';
import type { DatabaseContext } from '../database_adapter.js';
import type { CreateSectionInput } from '../section_adapter.js';
import { createTestSession, createTestSection } from './test_fixtures.js';

describe('SqliteSectionImpl', () => {
  let ctx: DatabaseContext;
  let sectionRepo: SectionAdapter;
  let sessionRepo: SessionAdapter;
  let testSessionId: string;

  beforeEach(async () => {
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: tmpdir(), dbPath: ':memory:' });
    sectionRepo = ctx.sectionRepository;
    sessionRepo = ctx.sessionRepository;

    // Create a test session for use in tests
    const session = await sessionRepo.create(createTestSession({ marker_count: 3, uploaded_at: '2026-02-17T10:00:00Z' }));
    testSessionId = session.id;
  });

  afterEach(async () => {
    await ctx.close();
  });

  describe('create', () => {
    it('should create a section with generated id and created_at', async () => {
      const input: CreateSectionInput = createTestSection(testSessionId, {
        label: 'Setup',
        snapshot: JSON.stringify({ cursor: { x: 0, y: 0 } }),
      });

      const section = await sectionRepo.create(input);

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

    it('should accept null values for optional fields', async () => {
      const input: CreateSectionInput = createTestSection(testSessionId, {
        type: 'detected',
        startEvent: 5,
        endEvent: null,
        label: null,
      });

      const section = await sectionRepo.create(input);

      expect(section.end_event).toBeNull();
      expect(section.label).toBeNull();
      expect(section.snapshot).toBeNull();
    });

    it('should generate unique IDs for multiple sections', async () => {
      const input: CreateSectionInput = createTestSection(testSessionId, { label: 'Section 1' });

      const section1 = await sectionRepo.create(input);
      const section2 = await sectionRepo.create({ ...input, startEvent: 11, endEvent: 20, label: 'Section 2' });

      expect(section1.id).not.toBe(section2.id);
    });
  });

  describe('findBySessionId', () => {
    it('should return empty array when no sections exist', async () => {
      const sections = await sectionRepo.findBySessionId(testSessionId);

      expect(sections).toEqual([]);
    });

    it('should return all sections for a session', async () => {
      const input1: CreateSectionInput = createTestSection(testSessionId, { label: 'Section 1' });
      const input2: CreateSectionInput = createTestSection(testSessionId, { type: 'detected', startEvent: 11, endEvent: 20, label: 'Section 2' });

      const section1 = await sectionRepo.create(input1);
      const section2 = await sectionRepo.create(input2);

      const sections = await sectionRepo.findBySessionId(testSessionId);

      expect(sections).toHaveLength(2);
      expect(sections.map(s => s.id)).toContain(section1.id);
      expect(sections.map(s => s.id)).toContain(section2.id);
    });

    it('should return sections ordered by start_event ASC', async () => {
      const input1: CreateSectionInput = createTestSection(testSessionId, { startEvent: 20, endEvent: 30, label: 'Later section' });
      const input2: CreateSectionInput = createTestSection(testSessionId, { label: 'Earlier section' });
      const input3: CreateSectionInput = createTestSection(testSessionId, { startEvent: 10, endEvent: 20, label: 'Middle section' });

      await sectionRepo.create(input1);
      await sectionRepo.create(input2);
      await sectionRepo.create(input3);

      const sections = await sectionRepo.findBySessionId(testSessionId);

      expect(sections).toHaveLength(3);
      expect(sections[0]!.start_event).toBe(0);
      expect(sections[0]!.label).toBe('Earlier section');
      expect(sections[1]!.start_event).toBe(10);
      expect(sections[1]!.label).toBe('Middle section');
      expect(sections[2]!.start_event).toBe(20);
      expect(sections[2]!.label).toBe('Later section');
    });

    it('should not return sections from other sessions', async () => {
      const otherSession = await sessionRepo.create(
        createTestSession({ filename: 'other.cast', filepath: 'sessions/other.cast', size_bytes: 2048, uploaded_at: '2026-02-17T11:00:00Z' })
      );

      await sectionRepo.create(createTestSection(testSessionId, { label: 'Test session section' }));
      await sectionRepo.create(createTestSection(otherSession.id, { label: 'Other session section' }));

      const sections = await sectionRepo.findBySessionId(testSessionId);

      expect(sections).toHaveLength(1);
      expect(sections[0]!.session_id).toBe(testSessionId);
      expect(sections[0]!.label).toBe('Test session section');
    });
  });

  describe('deleteBySessionId', () => {
    it('should return 0 when no sections exist', async () => {
      const count = await sectionRepo.deleteBySessionId(testSessionId);

      expect(count).toBe(0);
    });

    it('should delete all sections for a session', async () => {
      const input1: CreateSectionInput = createTestSection(testSessionId, { label: 'Section 1' });
      const input2: CreateSectionInput = createTestSection(testSessionId, { type: 'detected', startEvent: 11, endEvent: 20, label: 'Section 2' });

      await sectionRepo.create(input1);
      await sectionRepo.create(input2);

      const count = await sectionRepo.deleteBySessionId(testSessionId);

      expect(count).toBe(2);

      const remaining = await sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(0);
    });

    it('should delete only detected sections when type is specified', async () => {
      const markerInput: CreateSectionInput = createTestSection(testSessionId, { label: 'Marker section' });
      const detectedInput1: CreateSectionInput = createTestSection(testSessionId, { type: 'detected', startEvent: 11, endEvent: 20, label: 'Detected section 1' });
      const detectedInput2: CreateSectionInput = createTestSection(testSessionId, { type: 'detected', startEvent: 21, endEvent: 30, label: 'Detected section 2' });

      await sectionRepo.create(markerInput);
      await sectionRepo.create(detectedInput1);
      await sectionRepo.create(detectedInput2);

      const count = await sectionRepo.deleteBySessionId(testSessionId, 'detected');

      expect(count).toBe(2);

      const remaining = await sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.type).toBe('marker');
      expect(remaining[0]!.label).toBe('Marker section');
    });

    it('should delete only marker sections when type is specified', async () => {
      const markerInput1: CreateSectionInput = createTestSection(testSessionId, { label: 'Marker section 1' });
      const markerInput2: CreateSectionInput = createTestSection(testSessionId, { startEvent: 11, endEvent: 20, label: 'Marker section 2' });
      const detectedInput: CreateSectionInput = createTestSection(testSessionId, { type: 'detected', startEvent: 21, endEvent: 30, label: 'Detected section' });

      await sectionRepo.create(markerInput1);
      await sectionRepo.create(markerInput2);
      await sectionRepo.create(detectedInput);

      const count = await sectionRepo.deleteBySessionId(testSessionId, 'marker');

      expect(count).toBe(2);

      const remaining = await sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.type).toBe('detected');
      expect(remaining[0]!.label).toBe('Detected section');
    });

    it('should not affect sections from other sessions', async () => {
      const otherSession = await sessionRepo.create(
        createTestSession({ filename: 'other.cast', filepath: 'sessions/other.cast', size_bytes: 2048, uploaded_at: '2026-02-17T11:00:00Z' })
      );

      const input1: CreateSectionInput = createTestSection(testSessionId, { label: 'Test session section' });
      const input2: CreateSectionInput = createTestSection(otherSession.id, { label: 'Other session section' });

      await sectionRepo.create(input1);
      await sectionRepo.create(input2);

      const count = await sectionRepo.deleteBySessionId(testSessionId);

      expect(count).toBe(1);

      const otherSections = await sectionRepo.findBySessionId(otherSession.id);
      expect(otherSections).toHaveLength(1);
      expect(otherSections[0]!.label).toBe('Other session section');
    });
  });

  describe('deleteById', () => {
    it('should return false when section does not exist', async () => {
      const deleted = await sectionRepo.deleteById('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should return true and delete section when it exists', async () => {
      const input: CreateSectionInput = createTestSection(testSessionId, { label: 'Section to delete' });

      const section = await sectionRepo.create(input);
      const deleted = await sectionRepo.deleteById(section.id);

      expect(deleted).toBe(true);

      const sections = await sectionRepo.findBySessionId(testSessionId);
      expect(sections).toHaveLength(0);
    });

    it('should not affect other sections', async () => {
      const input1: CreateSectionInput = createTestSection(testSessionId, { label: 'Section 1' });
      const input2: CreateSectionInput = createTestSection(testSessionId, { startEvent: 11, endEvent: 20, label: 'Section 2' });

      const section1 = await sectionRepo.create(input1);
      const section2 = await sectionRepo.create(input2);

      await sectionRepo.deleteById(section1.id);

      const remaining = await sectionRepo.findBySessionId(testSessionId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(section2.id);
      expect(remaining[0]!.label).toBe('Section 2');
    });
  });

  describe('foreign key cascade', () => {
    it('should delete sections when parent session is deleted', async () => {
      const input1: CreateSectionInput = createTestSection(testSessionId, { label: 'Section 1' });
      const input2: CreateSectionInput = createTestSection(testSessionId, { type: 'detected', startEvent: 11, endEvent: 20, label: 'Section 2' });

      await sectionRepo.create(input1);
      await sectionRepo.create(input2);

      let sections = await sectionRepo.findBySessionId(testSessionId);
      expect(sections).toHaveLength(2);

      await sessionRepo.deleteById(testSessionId);

      sections = await sectionRepo.findBySessionId(testSessionId);
      expect(sections).toHaveLength(0);
    });
  });

  describe('snapshot column', () => {
    it('should accept JSON blob', async () => {
      const snapshot = {
        cursor: { x: 10, y: 5 },
        screen: [[{ char: 'a', attr: 0 }]],
      };

      const input: CreateSectionInput = createTestSection(testSessionId, {
        label: 'With snapshot',
        snapshot: JSON.stringify(snapshot),
      });

      const section = await sectionRepo.create(input);

      expect(section.snapshot).toBeTruthy();
      expect(JSON.parse(section.snapshot!)).toEqual(snapshot);
    });

    it('should accept null snapshot', async () => {
      const input: CreateSectionInput = createTestSection(testSessionId, { label: 'Without snapshot' });

      const section = await sectionRepo.create(input);

      expect(section.snapshot).toBeNull();
    });
  });

  describe('updateDetectionStatus (via sessionRepo)', () => {
    it('should update detection status only', async () => {
      await sessionRepo.updateDetectionStatus(testSessionId, 'completed');

      const session = await sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('completed');
    });

    it('should update detection status and event count', async () => {
      await sessionRepo.updateDetectionStatus(testSessionId, 'completed', 100);

      const session = await sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('completed');
      expect((session as any).event_count).toBe(100);
    });

    it('should update all metadata fields', async () => {
      await sessionRepo.updateDetectionStatus(testSessionId, 'completed', 150, 5);

      const session = await sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('completed');
      expect((session as any).event_count).toBe(150);
      expect((session as any).detected_sections_count).toBe(5);
    });

    it('should update status to failed', async () => {
      await sessionRepo.updateDetectionStatus(testSessionId, 'failed', 50);

      const session = await sessionRepo.findById(testSessionId);
      expect(session).not.toBeNull();
      expect((session as any).detection_status).toBe('failed');
      expect((session as any).event_count).toBe(50);
    });
  });
});

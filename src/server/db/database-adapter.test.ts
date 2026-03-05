/**
 * Tests for SqliteDatabaseImpl.
 * Verifies initialize() returns working repositories and storage adapter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabaseImpl } from './sqlite-database-impl.js';
import type { DatabaseContext } from './database-adapter.js';

describe('SqliteDatabaseImpl', () => {
  let testDir: string;
  let ctx: DatabaseContext;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-provider-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
  });

  afterEach(() => {
    ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should return a DatabaseContext with all required fields', () => {
      expect(ctx.sessionRepository).toBeDefined();
      expect(ctx.sectionRepository).toBeDefined();
      expect(ctx.storageAdapter).toBeDefined();
      expect(typeof ctx.close).toBe('function');
    });

    it('should return working sessionRepository (insert + query round-trip)', () => {
      const session = ctx.sessionRepository.create({
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-03-05T10:00:00Z',
      });

      expect(session.id).toBeTruthy();

      const found = ctx.sessionRepository.findById(session.id);
      expect(found).not.toBeNull();
      expect(found!.filename).toBe('test.cast');
    });

    it('should return working sectionRepository (insert + query round-trip)', () => {
      const session = ctx.sessionRepository.create({
        filename: 'test.cast',
        filepath: 'sessions/test.cast',
        size_bytes: 1024,
        marker_count: 0,
        uploaded_at: '2026-03-05T10:00:00Z',
      });

      const section = ctx.sectionRepository.create({
        sessionId: session.id,
        type: 'marker',
        startEvent: 0,
        endEvent: 10,
        label: 'Setup',
        snapshot: null,
        startLine: null,
        endLine: null,
      });

      expect(section.id).toBeTruthy();

      const sections = ctx.sectionRepository.findBySessionId(session.id);
      expect(sections).toHaveLength(1);
      expect(sections[0].label).toBe('Setup');
    });

    it('should return working storageAdapter (save + read round-trip)', () => {
      const filepath = ctx.storageAdapter.save('test-id', 'cast content here');
      expect(filepath).toContain('test-id.cast');

      const content = ctx.storageAdapter.read('test-id');
      expect(content).toBe('cast content here');
    });

    it('should create the database file in dataDir', () => {
      expect(existsSync(join(testDir, 'ragts.db'))).toBe(true);
    });
  });

  describe('close', () => {
    it('should allow calling close without throwing', () => {
      expect(() => ctx.close()).not.toThrow();
    });

    it('should prevent further database operations after close', () => {
      ctx.close();

      expect(() =>
        ctx.sessionRepository.findAll()
      ).toThrow();
    });
  });
});

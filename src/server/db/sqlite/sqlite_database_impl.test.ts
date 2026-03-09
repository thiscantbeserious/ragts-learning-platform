/**
 * Tests for SqliteDatabaseImpl.
 * Verifies initialize() returns working repositories and storage adapter,
 * and that the underlying database is correctly configured.
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabaseImpl } from './sqlite_database_impl.js';
import type { DatabaseContext } from '../database_adapter.js';
import { createTestSession, createTestSection } from './test_fixtures.js';

describe('SqliteDatabaseImpl', () => {
  let testDir: string;
  let ctx: DatabaseContext;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-provider-test-'));
    const impl = new SqliteDatabaseImpl();
    ctx = await impl.initialize({ dataDir: testDir });
  });

  afterEach(async () => {
    await ctx.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should return a DatabaseContext with all required fields', () => {
      expect(ctx.sessionRepository).toBeDefined();
      expect(ctx.sectionRepository).toBeDefined();
      expect(ctx.storageAdapter).toBeDefined();
      expect(typeof ctx.close).toBe('function');
    });

    it('should return working sessionRepository (insert + query round-trip)', async () => {
      const session = await ctx.sessionRepository.create(createTestSession());

      expect(session.id).toBeTruthy();

      const found = await ctx.sessionRepository.findById(session.id);
      expect(found).not.toBeNull();
      expect(found!.filename).toBe('test.cast');
    });

    it('should return working sectionRepository (insert + query round-trip)', async () => {
      const session = await ctx.sessionRepository.create(createTestSession());

      const section = await ctx.sectionRepository.create(
        createTestSection(session.id, { label: 'Setup' })
      );

      expect(section.id).toBeTruthy();

      const sections = await ctx.sectionRepository.findBySessionId(session.id);
      expect(sections).toHaveLength(1);
      expect(sections[0]!.label).toBe('Setup');
    });

    it('should return working storageAdapter (save + read round-trip)', async () => {
      const filepath = await ctx.storageAdapter.save('test-id', 'cast content here');
      expect(filepath).toContain('test-id.cast');

      const content = await ctx.storageAdapter.read('test-id');
      expect(content).toBe('cast content here');
    });

    it('should create the database file in dataDir', () => {
      expect(existsSync(join(testDir, 'ragts.db'))).toBe(true);
    });

    it('should support in-memory database via dbPath override', async () => {
      const inMemoryImpl = new SqliteDatabaseImpl();
      const inMemoryCtx = await inMemoryImpl.initialize({
        dataDir: testDir,
        dbPath: ':memory:',
      });

      const session = await inMemoryCtx.sessionRepository.create(
        createTestSession({ filename: 'mem.cast', filepath: 'sessions/mem.cast', size_bytes: 512 })
      );

      expect(session.id).toBeTruthy();
      await inMemoryCtx.close();
    });
  });

  describe('close', () => {
    it('should allow calling close without throwing', async () => {
      await expect(ctx.close()).resolves.not.toThrow();
    });

    it('should prevent further database operations after close', async () => {
      await ctx.close();

      await expect(
        ctx.sessionRepository.findAll()
      ).rejects.toThrow();
    });
  });

  describe('schema verification via in-memory database', () => {
    let memCtx: DatabaseContext;

    beforeEach(async () => {
      const impl = new SqliteDatabaseImpl();
      memCtx = await impl.initialize({ dataDir: testDir, dbPath: ':memory:' });
    });

    afterEach(async () => {
      await memCtx.close();
    });

    it('should have sessions table with required columns', async () => {
      // Verify schema by inserting and querying a session
      const session = await memCtx.sessionRepository.create(
        createTestSession({ filename: 'schema-test.cast', filepath: 'sessions/schema-test.cast', size_bytes: 100 })
      );

      expect(session.id).toBeTruthy();
      expect(session.filename).toBe('schema-test.cast');
      expect(session.size_bytes).toBe(100);
      expect(session.created_at).toBeTruthy();
    });

    it('should have sections table with required columns (migration 002)', async () => {
      const session = await memCtx.sessionRepository.create(
        createTestSession({ filename: 'section-test.cast', filepath: 'sessions/section-test.cast', size_bytes: 100 })
      );

      const section = await memCtx.sectionRepository.create(
        createTestSection(session.id, { type: 'detected', endEvent: null, label: null })
      );

      expect(section.id).toBeTruthy();
      expect(section.start_line).toBeNull();
      expect(section.end_line).toBeNull();
    });

    it('should support snapshot column (migration 003)', async () => {
      const session = await memCtx.sessionRepository.create(
        createTestSession({ filename: 'snap-test.cast', filepath: 'sessions/snap-test.cast', size_bytes: 100 })
      );

      const snapshot = JSON.stringify({ cursor: { x: 0, y: 0 } });
      await memCtx.sessionRepository.updateSnapshot(session.id, snapshot);

      const found = await memCtx.sessionRepository.findById(session.id);
      expect(found).not.toBeNull();
      expect((found as any).snapshot).toBe(snapshot);
    });

    it('should enforce foreign key constraints on sections', async () => {
      // Deleting a session should cascade-delete its sections
      const session = await memCtx.sessionRepository.create(
        createTestSession({ filename: 'fk-test.cast', filepath: 'sessions/fk-test.cast', size_bytes: 100 })
      );

      await memCtx.sectionRepository.create(
        createTestSection(session.id, { endEvent: 5, label: 'test' })
      );

      await memCtx.sessionRepository.deleteById(session.id);

      const sections = await memCtx.sectionRepository.findBySessionId(session.id);
      expect(sections).toHaveLength(0);
    });
  });
});

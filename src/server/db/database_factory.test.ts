/**
 * Tests for DatabaseFactory.
 * Verifies factory creates a working DatabaseAdapter for known types
 * and rejects unknown types. All assertions go through the factory
 * as the public entry point — not directly against SqliteDatabaseImpl.
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseFactory } from './database_factory.js';
import type { DatabaseContext } from './database_adapter.js';
import { createTestSession, createTestSection } from './sqlite/test_fixtures.js';

describe('DatabaseFactory', () => {
  describe('create("sqlite")', () => {
    let ctx: DatabaseContext;
    let testDir: string;

    beforeEach(async () => {
      testDir = mkdtempSync(join(tmpdir(), 'ragts-factory-test-'));
      const factory = new DatabaseFactory();
      const adapter = await factory.create('sqlite');
      ctx = await adapter.initialize({ dataDir: testDir, dbPath: ':memory:' });
    });

    afterEach(async () => {
      await ctx.close();
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should return a DatabaseAdapter with an initialize method', async () => {
      const factory = new DatabaseFactory();
      const adapter = await factory.create('sqlite');
      expect(typeof adapter.initialize).toBe('function');
    });

    it('should return a DatabaseContext with all required fields', () => {
      expect(ctx.sessionRepository).toBeDefined();
      expect(ctx.sectionRepository).toBeDefined();
      expect(ctx.storageAdapter).toBeDefined();
      expect(typeof ctx.close).toBe('function');
    });

    it('should return a working sessionRepository (insert + query round-trip)', async () => {
      const session = await ctx.sessionRepository.create(
        createTestSession({ filename: 'factory-test.cast', filepath: 'sessions/factory-test.cast', size_bytes: 2048 })
      );

      expect(session.id).toBeTruthy();

      const found = await ctx.sessionRepository.findById(session.id);
      expect(found).not.toBeNull();
      expect(found!.filename).toBe('factory-test.cast');
    });

    it('should return a working sectionRepository (insert + query round-trip)', async () => {
      const session = await ctx.sessionRepository.create(
        createTestSession({ filename: 'section-factory.cast', filepath: 'sessions/section-factory.cast', size_bytes: 512 })
      );

      const section = await ctx.sectionRepository.create(
        createTestSection(session.id, { endEvent: 5, label: 'Intro' })
      );

      expect(section.id).toBeTruthy();

      const sections = await ctx.sectionRepository.findBySessionId(session.id);
      expect(sections).toHaveLength(1);
      expect(sections[0]!.label).toBe('Intro');
    });

    it('should return a working storageAdapter (save + read round-trip)', async () => {
      const filepath = await ctx.storageAdapter.save('factory-id', 'cast content');
      expect(filepath).toContain('factory-id.cast');

      const content = await ctx.storageAdapter.read('factory-id');
      expect(content).toBe('cast content');
    });
  });

  describe('create("sqlite") default argument', () => {
    it('should default to sqlite when no type is given', async () => {
      const factory = new DatabaseFactory();
      const adapter = await factory.create();
      expect(typeof adapter.initialize).toBe('function');
    });
  });

  describe('create("unknown")', () => {
    it('should throw for an unknown database type', async () => {
      const factory = new DatabaseFactory();
      await expect(factory.create('unknown')).rejects.toThrow('Unknown database type: unknown');
    });
  });

  describe('close()', () => {
    it('should prevent further operations after close', async () => {
      const testDir = mkdtempSync(join(tmpdir(), 'ragts-factory-close-'));

      try {
        const factory = new DatabaseFactory();
        const adapter = await factory.create('sqlite');
        const localCtx = await adapter.initialize({ dataDir: testDir, dbPath: ':memory:' });

        await localCtx.close();

        await expect(localCtx.sessionRepository.findAll()).rejects.toThrow();
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});

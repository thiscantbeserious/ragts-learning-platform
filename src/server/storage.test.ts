/**
 * Tests for file storage operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveSession, readSession, deleteSession } from './storage.js';

describe('storage', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temporary directory for each test
    testDir = mkdtempSync(join(tmpdir(), 'ragts-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('saveSession', () => {
    it('should save session file and return filepath', () => {
      const id = 'test123';
      const content = 'test content';

      const filepath = saveSession(testDir, id, content);

      expect(filepath).toContain('test123.cast');
      expect(filepath).toContain(join(testDir, 'sessions'));
    });

    it('should create sessions directory if it does not exist', () => {
      const id = 'test123';
      const content = 'test content';

      const filepath = saveSession(testDir, id, content);
      const read = readSession(filepath);

      expect(read).toBe(content);
    });

    it('should overwrite existing file with same id', () => {
      const id = 'test123';
      const content1 = 'first content';
      const content2 = 'second content';

      const filepath1 = saveSession(testDir, id, content1);
      const filepath2 = saveSession(testDir, id, content2);

      expect(filepath1).toBe(filepath2);
      expect(readSession(filepath2)).toBe(content2);
    });
  });

  describe('readSession', () => {
    it('should read existing session file', () => {
      const id = 'test123';
      const content = 'test content';

      const filepath = saveSession(testDir, id, content);
      const read = readSession(filepath);

      expect(read).toBe(content);
    });

    it('should throw error if file does not exist', () => {
      const filepath = join(testDir, 'nonexistent.cast');

      expect(() => readSession(filepath)).toThrow('Session file not found');
    });
  });

  describe('deleteSession', () => {
    it('should delete existing file and return true', () => {
      const id = 'test123';
      const content = 'test content';

      const filepath = saveSession(testDir, id, content);
      const deleted = deleteSession(filepath);

      expect(deleted).toBe(true);
      expect(() => readSession(filepath)).toThrow();
    });

    it('should return false if file does not exist', () => {
      const filepath = join(testDir, 'nonexistent.cast');

      const deleted = deleteSession(filepath);

      expect(deleted).toBe(false);
    });
  });
});

/**
 * Tests for FsStorageImpl.
 * Uses temporary directories to avoid filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, isAbsolute } from 'path';
import { FsStorageImpl } from './fs-storage-impl.js';

describe('FsStorageImpl', () => {
  let testDir: string;
  let adapter: FsStorageImpl;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'ragts-adapter-test-'));
    adapter = new FsStorageImpl(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('should save content and return absolute filepath', () => {
      const filepath = adapter.save('abc123', 'hello world');

      expect(filepath).toContain('abc123.cast');
      expect(filepath).toContain(join(testDir, 'sessions'));
    });

    it('should create sessions directory if it does not exist', () => {
      const filepath = adapter.save('abc123', 'hello world');
      const content = adapter.read('abc123');

      expect(content).toBe('hello world');
      expect(filepath).toBeTruthy();
    });

    it('should overwrite existing file with same id', () => {
      adapter.save('abc123', 'first content');
      adapter.save('abc123', 'second content');

      expect(adapter.read('abc123')).toBe('second content');
    });

    it('should return an absolute path', () => {
      const filepath = adapter.save('abc123', 'content');

      expect(isAbsolute(filepath)).toBe(true);
    });
  });

  describe('read', () => {
    it('should read content for an existing session', () => {
      adapter.save('abc123', 'my content');

      expect(adapter.read('abc123')).toBe('my content');
    });

    it('should throw if session does not exist', () => {
      expect(() => adapter.read('nonexistent')).toThrow('Session file not found');
    });
  });

  describe('delete', () => {
    it('should delete existing session and return true', () => {
      adapter.save('abc123', 'content');

      expect(adapter.delete('abc123')).toBe(true);
    });

    it('should return false if session does not exist', () => {
      expect(adapter.delete('nonexistent')).toBe(false);
    });

    it('should remove the file so read throws afterwards', () => {
      adapter.save('abc123', 'content');
      adapter.delete('abc123');

      expect(() => adapter.read('abc123')).toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for an existing session', () => {
      adapter.save('abc123', 'content');

      expect(adapter.exists('abc123')).toBe(true);
    });

    it('should return false for a non-existent session', () => {
      expect(adapter.exists('nonexistent')).toBe(false);
    });
  });

  describe('path traversal rejection', () => {
    it('should throw on save with ../ in id', () => {
      expect(() => adapter.save('../evil', 'content')).toThrow('Invalid session ID');
    });

    it('should throw on read with ../ in id', () => {
      expect(() => adapter.read('../etc/passwd')).toThrow('Invalid session ID');
    });

    it('should throw on delete with ../ in id', () => {
      expect(() => adapter.delete('../../secret')).toThrow('Invalid session ID');
    });

    it('should throw on exists with forward slash in id', () => {
      expect(() => adapter.exists('some/path')).toThrow('Invalid session ID');
    });

    it('should throw on save with backslash in id', () => {
      expect(() => adapter.save('some\\path', 'content')).toThrow('Invalid session ID');
    });
  });
});

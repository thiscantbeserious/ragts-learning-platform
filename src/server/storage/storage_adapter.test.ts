// @vitest-environment node
/**
 * Tests for FsStorageImpl.
 * Uses temporary directories to avoid filesystem side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, isAbsolute } from 'path';
import { FsStorageImpl } from './fs_storage_impl.js';

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
    it('should save content and return absolute filepath', async () => {
      const filepath = await adapter.save('abc123', 'hello world');

      expect(filepath).toContain('abc123.cast');
      expect(filepath).toContain(join(testDir, 'sessions'));
    });

    it('should create sessions directory if it does not exist', async () => {
      const filepath = await adapter.save('abc123', 'hello world');
      const content = await adapter.read('abc123');

      expect(content).toBe('hello world');
      expect(filepath).toBeTruthy();
    });

    it('should overwrite existing file with same id', async () => {
      await adapter.save('abc123', 'first content');
      await adapter.save('abc123', 'second content');

      expect(await adapter.read('abc123')).toBe('second content');
    });

    it('should return an absolute path', async () => {
      const filepath = await adapter.save('abc123', 'content');

      expect(isAbsolute(filepath)).toBe(true);
    });
  });

  describe('read', () => {
    it('should read content for an existing session', async () => {
      await adapter.save('abc123', 'my content');

      expect(await adapter.read('abc123')).toBe('my content');
    });

    it('should throw if session does not exist', async () => {
      await expect(adapter.read('nonexistent')).rejects.toThrow('Session file not found');
    });
  });

  describe('delete', () => {
    it('should delete existing session and return true', async () => {
      await adapter.save('abc123', 'content');

      expect(await adapter.delete('abc123')).toBe(true);
    });

    it('should return false if session does not exist', async () => {
      expect(await adapter.delete('nonexistent')).toBe(false);
    });

    it('should remove the file so read throws afterwards', async () => {
      await adapter.save('abc123', 'content');
      await adapter.delete('abc123');

      await expect(adapter.read('abc123')).rejects.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true for an existing session', async () => {
      await adapter.save('abc123', 'content');

      expect(await adapter.exists('abc123')).toBe(true);
    });

    it('should return false for a non-existent session', async () => {
      expect(await adapter.exists('nonexistent')).toBe(false);
    });
  });

  describe('path traversal rejection', () => {
    it('should throw on save with ../ in id', async () => {
      await expect(adapter.save('../evil', 'content')).rejects.toThrow('Invalid session ID');
    });

    it('should throw on read with ../ in id', async () => {
      await expect(adapter.read('../etc/passwd')).rejects.toThrow('Invalid session ID');
    });

    it('should throw on delete with ../ in id', async () => {
      await expect(adapter.delete('../../secret')).rejects.toThrow('Invalid session ID');
    });

    it('should throw on exists with forward slash in id', async () => {
      await expect(adapter.exists('some/path')).rejects.toThrow('Invalid session ID');
    });

    it('should throw on save with backslash in id', async () => {
      await expect(adapter.save('some\\path', 'content')).rejects.toThrow('Invalid session ID');
    });
  });
});

/**
 * Filesystem implementation of StorageAdapter.
 * Stores session files under `<dataDir>/sessions/<id>.cast`.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { StorageAdapter } from './storage-adapter.js';

/**
 * Filesystem-backed storage implementation.
 * Resolves all paths relative to the data directory given at construction.
 */
export class FsStorageImpl implements StorageAdapter {
  constructor(private readonly dataDir: string) {}

  /**
   * Resolve the absolute filepath for a session by ID.
   * Rejects IDs containing path separators or traversal sequences.
   */
  private resolvePath(id: string): string {
    if (id.includes('/') || id.includes('\\') || id.includes('..')) {
      throw new Error(`Invalid session ID: "${id}" contains disallowed characters`);
    }
    return resolve(this.dataDir, 'sessions', `${id}.cast`);
  }

  /**
   * Save session content to filesystem.
   * Creates parent directory if needed.
   * Returns absolute filepath where file was saved.
   */
  save(id: string, content: string): string {
    const filepath = this.resolvePath(id);
    mkdirSync(dirname(filepath), { recursive: true });
    writeFileSync(filepath, content, 'utf-8');
    return filepath;
  }

  /**
   * Read session content from filesystem.
   * Throws if the file does not exist.
   */
  read(id: string): string {
    const filepath = this.resolvePath(id);
    if (!existsSync(filepath)) {
      throw new Error(`Session file not found: ${filepath}`);
    }
    return readFileSync(filepath, 'utf-8');
  }

  /**
   * Delete session file from filesystem.
   * Returns true if deleted, false if not found.
   */
  delete(id: string): boolean {
    const filepath = this.resolvePath(id);
    if (!existsSync(filepath)) {
      return false;
    }
    unlinkSync(filepath);
    return true;
  }

  /**
   * Check whether a session file exists on filesystem.
   */
  exists(id: string): boolean {
    return existsSync(this.resolvePath(id));
  }
}

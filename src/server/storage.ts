/**
 * File storage operations for session asciicast files.
 * Handles reading, writing, and deleting session files in the data directory.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

/**
 * Save session content to filesystem.
 * Creates parent directory if needed.
 *
 * @param dataDir - Base directory for session files
 * @param id - Session ID (nanoid)
 * @param content - Asciicast file content
 * @returns Absolute filepath where file was saved
 */
export function saveSession(dataDir: string, id: string, content: string): string {
  const filepath = join(dataDir, 'sessions', `${id}.cast`);
  const dir = dirname(filepath);

  // Ensure directory exists
  mkdirSync(dir, { recursive: true });

  // Write file atomically
  writeFileSync(filepath, content, 'utf-8');

  return filepath;
}

/**
 * Read session content from filesystem.
 *
 * @param filepath - Absolute path to session file
 * @returns File content as string
 * @throws Error if file doesn't exist
 */
export function readSession(filepath: string): string {
  if (!existsSync(filepath)) {
    throw new Error(`Session file not found: ${filepath}`);
  }

  return readFileSync(filepath, 'utf-8');
}

/**
 * Delete session file from filesystem.
 *
 * @param filepath - Absolute path to session file
 * @returns true if file was deleted, false if file didn't exist
 */
export function deleteSession(filepath: string): boolean {
  if (!existsSync(filepath)) {
    return false;
  }

  unlinkSync(filepath);
  return true;
}

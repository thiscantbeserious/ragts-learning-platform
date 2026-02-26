/**
 * Utilities for seeding data in Playwright visual tests.
 * Uses raw fetch (not Playwright request) so they work in beforeAll hooks.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_BASE = 'http://localhost:3000';
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Upload a fixture .cast file via the API using raw fetch.
 * Returns the session ID.
 */
export async function uploadFixture(fixtureName: string): Promise<string> {
  const filePath = join(FIXTURES_DIR, fixtureName);
  const content = readFileSync(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([content]), fixtureName);

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { id: string };
  return data.id;
}

/**
 * Wait for session processing to complete.
 * Polls the API until detection_status is 'completed' or timeout.
 */
export async function waitForProcessing(sessionId: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
    const data = await response.json() as { detection_status: string };
    if (data.detection_status === 'completed' || data.detection_status === 'failed') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Processing timeout for session ${sessionId}`);
}

/**
 * Delete all sessions via the API using raw fetch.
 */
export async function deleteAllSessions(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/sessions`);
  const sessions = await response.json() as Array<{ id: string }>;
  for (const session of sessions) {
    await fetch(`${API_BASE}/api/sessions/${session.id}`, { method: 'DELETE' });
  }
}

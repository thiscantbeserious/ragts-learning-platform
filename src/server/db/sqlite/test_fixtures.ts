/**
 * Test fixture factories for database layer tests.
 * Provides default objects for SessionCreate and CreateSectionInput
 * so individual tests only need to specify fields relevant to their scenario.
 */

// @vitest-environment node
import type { SessionCreate } from '../../../shared/types/session.js';
import type { CreateSectionInput } from '../section_adapter.js';

/**
 * Returns a SessionCreate object with sensible defaults.
 * Override any field by passing a partial object.
 */
export function createTestSession(overrides: Partial<SessionCreate> = {}): SessionCreate {
  return {
    filename: 'test.cast',
    filepath: 'sessions/test.cast',
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: '2026-03-05T10:00:00Z',
    ...overrides,
  };
}

/**
 * Returns a CreateSectionInput with sensible defaults for the given session.
 * Override any field by passing a partial object.
 */
export function createTestSection(
  sessionId: string,
  overrides: Partial<CreateSectionInput> = {}
): CreateSectionInput {
  return {
    sessionId,
    type: 'marker',
    startEvent: 0,
    endEvent: 10,
    label: 'Test section',
    snapshot: null,
    startLine: null,
    endLine: null,
    lineCount: null,
    contentHash: null,
    preview: null,
    ...overrides,
  };
}

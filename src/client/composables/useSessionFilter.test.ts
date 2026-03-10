import { describe, it, expect } from 'vitest';
import { ref, readonly } from 'vue';
import type { Session } from '../../shared/types/session.js';
import { useSessionFilter } from './useSessionFilter.js';

/** Helper to build a minimal Session fixture with overrides. */
function makeSession(overrides: Partial<Session> & { id: string; filename: string }): Session {
  return {
    filepath: `/sessions/${overrides.id}.cast`,
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    detection_status: 'completed',
    ...overrides,
  };
}

const sessionReady = makeSession({ id: '1', filename: 'alpha.cast', detection_status: 'completed' });
const sessionProcessing = makeSession({ id: '2', filename: 'beta.cast', detection_status: 'processing' });
const sessionPending = makeSession({ id: '3', filename: 'gamma.cast', detection_status: 'pending' });
const sessionQueued = makeSession({ id: '4', filename: 'delta.cast', detection_status: 'queued' });
const sessionValidating = makeSession({ id: '5', filename: 'epsilon.cast', detection_status: 'validating' });
const sessionDetecting = makeSession({ id: '6', filename: 'zeta.cast', detection_status: 'detecting' });
const sessionReplaying = makeSession({ id: '7', filename: 'eta.cast', detection_status: 'replaying' });
const sessionDeduplicating = makeSession({ id: '8', filename: 'theta.cast', detection_status: 'deduplicating' });
const sessionStoring = makeSession({ id: '9', filename: 'iota.cast', detection_status: 'storing' });
const sessionFailed = makeSession({ id: '10', filename: 'kappa.cast', detection_status: 'failed' });
const sessionInterrupted = makeSession({ id: '11', filename: 'lambda.cast', detection_status: 'interrupted' });

const allSessions: Session[] = [
  sessionReady,
  sessionProcessing,
  sessionPending,
  sessionQueued,
  sessionValidating,
  sessionDetecting,
  sessionReplaying,
  sessionDeduplicating,
  sessionStoring,
  sessionFailed,
  sessionInterrupted,
];

describe('useSessionFilter', () => {
  describe('input typing', () => {
    it('accepts a Readonly<Ref<Session[]>> as input', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      // Should not throw - just verify composable accepts the type
      const result = useSessionFilter(sessions);
      expect(result).toBeDefined();
    });
  });

  describe('searchQuery', () => {
    it('returns all sessions when searchQuery is empty', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery } = useSessionFilter(sessions);
      searchQuery.value = '';
      expect(filteredSessions.value).toHaveLength(allSessions.length);
    });

    it('filters sessions by case-insensitive substring on filename', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery } = useSessionFilter(sessions);
      searchQuery.value = 'ALPHA';
      expect(filteredSessions.value).toHaveLength(1);
      expect(filteredSessions.value[0]?.id).toBe('1');
    });

    it('filters by partial filename match', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery } = useSessionFilter(sessions);
      searchQuery.value = '.cast';
      expect(filteredSessions.value).toHaveLength(allSessions.length);
    });

    it('returns empty array when no filename matches', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery } = useSessionFilter(sessions);
      searchQuery.value = 'nonexistent_file_xyz';
      expect(filteredSessions.value).toHaveLength(0);
    });

    it('updates reactively when searchQuery changes', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery } = useSessionFilter(sessions);
      searchQuery.value = 'alpha';
      expect(filteredSessions.value).toHaveLength(1);
      searchQuery.value = '';
      expect(filteredSessions.value).toHaveLength(allSessions.length);
    });
  });

  describe('activeFilter', () => {
    it("returns all sessions when activeFilter is 'all'", () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'all';
      expect(filteredSessions.value).toHaveLength(allSessions.length);
    });

    it("filters to processing group: pending, queued, processing, validating, detecting, replaying, deduplicating, storing", () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'processing';
      const ids = filteredSessions.value.map((s) => s.id);
      expect(ids).toContain('2'); // processing
      expect(ids).toContain('3'); // pending
      expect(ids).toContain('4'); // queued
      expect(ids).toContain('5'); // validating
      expect(ids).toContain('6'); // detecting
      expect(ids).toContain('7'); // replaying
      expect(ids).toContain('8'); // deduplicating
      expect(ids).toContain('9'); // storing
      expect(ids).not.toContain('1'); // completed (ready)
      expect(ids).not.toContain('10'); // failed
      expect(ids).not.toContain('11'); // interrupted
    });

    it("processing group contains exactly 8 statuses", () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'processing';
      expect(filteredSessions.value).toHaveLength(8);
    });

    it("filters to ready group: completed only", () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'ready';
      const ids = filteredSessions.value.map((s) => s.id);
      expect(ids).toContain('1'); // completed
      expect(ids).not.toContain('2'); // processing
      expect(ids).not.toContain('10'); // failed
      expect(filteredSessions.value).toHaveLength(1);
    });

    it("filters to failed group: failed and interrupted", () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'failed';
      const ids = filteredSessions.value.map((s) => s.id);
      expect(ids).toContain('10'); // failed
      expect(ids).toContain('11'); // interrupted
      expect(filteredSessions.value).toHaveLength(2);
    });

    it('updates reactively when activeFilter changes', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'ready';
      expect(filteredSessions.value).toHaveLength(1);
      activeFilter.value = 'all';
      expect(filteredSessions.value).toHaveLength(allSessions.length);
    });
  });

  describe('combined search + filter', () => {
    it('applies both search and filter simultaneously', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery, activeFilter } = useSessionFilter(sessions);
      searchQuery.value = 'beta';
      activeFilter.value = 'processing';
      // beta.cast has detection_status 'processing' — should match both
      expect(filteredSessions.value).toHaveLength(1);
      expect(filteredSessions.value[0]?.id).toBe('2');
    });

    it('returns empty when search matches but filter excludes', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery, activeFilter } = useSessionFilter(sessions);
      searchQuery.value = 'alpha'; // matches sessionReady (completed)
      activeFilter.value = 'processing'; // excludes completed
      expect(filteredSessions.value).toHaveLength(0);
    });

    it('returns empty when filter matches but search excludes', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions, searchQuery, activeFilter } = useSessionFilter(sessions);
      searchQuery.value = 'nonexistent';
      activeFilter.value = 'ready';
      expect(filteredSessions.value).toHaveLength(0);
    });
  });

  describe('reactivity', () => {
    it('updates filteredSessions when the source sessions ref changes', () => {
      const sessionsRef = ref<Session[]>([sessionReady]);
      const sessions = readonly(sessionsRef);
      const { filteredSessions } = useSessionFilter(sessions);
      expect(filteredSessions.value).toHaveLength(1);
      sessionsRef.value = [...allSessions];
      expect(filteredSessions.value).toHaveLength(allSessions.length);
    });

    it('filteredSessions is a computed (has .value)', () => {
      const sessions = readonly(ref<Session[]>(allSessions));
      const { filteredSessions } = useSessionFilter(sessions);
      expect(filteredSessions).toHaveProperty('value');
    });
  });

  describe('edge cases', () => {
    it('handles sessions with no detection_status (undefined)', () => {
      const noStatus = makeSession({ id: 'ns', filename: 'no-status.cast' });
      // Remove detection_status to test undefined handling
      delete (noStatus as Partial<Session>).detection_status;
      const sessions = readonly(ref<Session[]>([noStatus]));
      const { filteredSessions, activeFilter } = useSessionFilter(sessions);
      activeFilter.value = 'all';
      expect(filteredSessions.value).toHaveLength(1);
    });

    it('empty sessions list returns empty filteredSessions', () => {
      const sessions = readonly(ref<Session[]>([]));
      const { filteredSessions } = useSessionFilter(sessions);
      expect(filteredSessions.value).toHaveLength(0);
    });
  });
});

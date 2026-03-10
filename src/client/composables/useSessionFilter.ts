import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import type { Session } from '../../shared/types/session.js';
import type { DetectionStatus } from '../../shared/types/pipeline.js';

/** Filter category values for the status filter pill. */
export type SessionFilterGroup = 'all' | 'processing' | 'ready' | 'failed';

/** Detection statuses that belong to the "processing in progress" group. */
const PROCESSING_STATUSES: ReadonlySet<DetectionStatus> = new Set([
  'pending',
  'queued',
  'processing',
  'validating',
  'detecting',
  'replaying',
  'deduplicating',
  'storing',
]);

/** Detection statuses that belong to the "ready" (completed) group. */
const READY_STATUSES: ReadonlySet<DetectionStatus> = new Set(['completed']);

/** Detection statuses that belong to the "failed/interrupted" group. */
const FAILED_STATUSES: ReadonlySet<DetectionStatus> = new Set(['failed', 'interrupted']);

/** Returns true if the session's detection_status belongs to the given filter group. */
function matchesFilter(session: Session, filter: SessionFilterGroup): boolean {
  if (filter === 'all') return true;
  const status = session.detection_status as DetectionStatus | undefined;
  if (filter === 'processing') return status !== undefined && PROCESSING_STATUSES.has(status);
  if (filter === 'ready') return status !== undefined && READY_STATUSES.has(status);
  if (filter === 'failed') return status !== undefined && FAILED_STATUSES.has(status);
  return true;
}

/** Returns true if the session's filename contains the query (case-insensitive). */
function matchesSearch(session: Session, query: string): boolean {
  if (query === '') return true;
  return session.filename.toLowerCase().includes(query.toLowerCase());
}

/**
 * Derives a filtered session list from a reactive sessions source.
 * Exposes `searchQuery` and `activeFilter` refs that drive a computed `filteredSessions`.
 * No API calls — pure derivation logic.
 *
 * @param sessions - A readonly ref wrapping a (possibly readonly) array of sessions.
 *   Accepts both `Ref<Session[]>` and `Readonly<Ref<Session[]>>` (covariant array element read).
 */
export function useSessionFilter(sessions: Readonly<Ref<readonly Session[]>>) {
  const searchQuery = ref('');
  const activeFilter = ref<SessionFilterGroup>('all');

  const filteredSessions = computed(() =>
    sessions.value.filter(
      (s) => matchesSearch(s, searchQuery.value) && matchesFilter(s, activeFilter.value),
    ),
  );

  return { searchQuery, activeFilter, filteredSessions };
}

/**
 * EventLogService: retrieves pipeline event history for a session.
 *
 * Validates that the session exists, then returns all persisted pipeline
 * events ordered by id ASC. Pre-upgrade sessions with no events return [].
 *
 * Connections: SessionAdapter (db/), EventLogAdapter (events/).
 */

import type { SessionAdapter } from '../db/session_adapter.js';
import type { EventLogAdapter, EventLogEntry } from '../events/event_log_adapter.js';

export interface EventLogServiceDeps {
  sessionRepository: SessionAdapter;
  eventLog: EventLogAdapter;
}

export type EventLogResult =
  | { ok: true; data: EventLogEntry[] }
  | { ok: false; status: 400 | 404; error: string };

/**
 * EventLogService returns all pipeline events for a session ordered by id ASC.
 */
export class EventLogService {
  private readonly sessionRepository: SessionAdapter;
  private readonly eventLog: EventLogAdapter;

  constructor(deps: EventLogServiceDeps) {
    this.sessionRepository = deps.sessionRepository;
    this.eventLog = deps.eventLog;
  }

  /**
   * Return all pipeline events for a session ordered by id ASC.
   * Returns 400 if sessionId is undefined, 404 if the session does not exist.
   */
  async getEvents(sessionId: string | undefined): Promise<EventLogResult> {
    if (!sessionId) {
      return { ok: false, status: 400, error: 'sessionId query parameter is required' };
    }

    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return { ok: false, status: 404, error: 'Session not found' };
    }

    const entries = await this.eventLog.findBySessionId(sessionId);
    return { ok: true, data: entries };
  }
}

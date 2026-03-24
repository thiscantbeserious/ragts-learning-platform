/**
 * PipelineStatusService: aggregate pipeline state for the global SSE endpoint.
 *
 * Subscribes to the EventBusAdapter for all pipeline events and maintains
 * an in-memory map of active sessions (processing + queued). Tracks recently
 * completed sessions in a 5-minute rolling window.
 *
 * Connections: EventBusAdapter (events/), SessionAdapter (db/).
 */

import type {
  EventBusAdapter,
  EventHandler,
  AnyEventHandler,
} from '../events/event_bus_adapter.js';
import type { SessionAdapter } from '../db/session_adapter.js';
import type {
  PipelineEvent,
  PipelineEventType,
  DetectionStatus,
} from '../../shared/types/pipeline.js';
import type {
  PipelineSession,
  PipelineStatusSnapshot,
} from '../../shared/types/pipeline_status.js';

/** How long recently completed sessions remain visible in the snapshot (milliseconds). */
const RECENTLY_COMPLETED_TTL_MS = 5 * 60 * 1000;

/** Active detection statuses that belong in the processing list. */
const PROCESSING_STATUSES = new Set<DetectionStatus>([
  'pending',
  'processing',
  'validating',
  'detecting',
  'replaying',
  'deduplicating',
  'storing',
]);

/**
 * Maps pipeline event types to the *next* detection_status.
 * Each event signals that a stage completed, so the status advances to the
 * following stage. Matches the EVENT_TO_STATUS mapping in useSSE.ts.
 */
const EVENT_TO_STATUS: Partial<Record<PipelineEventType, DetectionStatus>> = {
  'session.uploaded': 'processing',
  'session.validated': 'detecting',
  'session.detected': 'replaying',
  'session.replayed': 'deduplicating',
  'session.deduped': 'storing',
};

/** Recently completed entry with completion timestamp for rolling window. */
interface CompletedEntry {
  session: PipelineSession;
  completedAt: number;
}

export interface PipelineStatusServiceDeps {
  eventBus: EventBusAdapter;
  sessionAdapter: SessionAdapter;
}

/** Callback type for state change notifications. */
export type PipelineStatusCallback = (snapshot: PipelineStatusSnapshot) => void;

/**
 * PipelineStatusService manages aggregate pipeline state for the global SSE stream.
 * Call init() once before calling getSnapshot() or onUpdate().
 */
export class PipelineStatusService {
  private readonly eventBus: EventBusAdapter;
  private readonly sessionAdapter: SessionAdapter;

  /** In-memory map of active sessions by ID. */
  private readonly activeSessions = new Map<string, PipelineSession>();

  /** Rolling window of recently completed sessions. */
  private recentlyCompleted: CompletedEntry[] = [];

  /** Registered update callbacks for SSE subscribers. */
  private readonly callbacks = new Set<PipelineStatusCallback>();

  /** Registered event bus handler references for cleanup. */
  private readonly handlers = new Map<PipelineEventType, AnyEventHandler>();

  constructor(deps: PipelineStatusServiceDeps) {
    this.eventBus = deps.eventBus;
    this.sessionAdapter = deps.sessionAdapter;
  }

  /**
   * Initialize the service: load active sessions from DB and subscribe to events.
   * Must be called once before getSnapshot() is meaningful.
   */
  async init(): Promise<void> {
    await this.loadInitialState();
    this.subscribeToEvents();
  }

  /**
   * Returns the current pipeline state snapshot.
   * The recentlyCompleted list is filtered to the 5-minute rolling window on each call.
   */
  getSnapshot(): PipelineStatusSnapshot {
    const now = Date.now();
    const cutoff = now - RECENTLY_COMPLETED_TTL_MS;

    const processing: PipelineSession[] = [];
    const queued: PipelineSession[] = [];

    for (const session of this.activeSessions.values()) {
      if (session.status === 'queued') {
        queued.push(session);
      } else {
        processing.push(session);
      }
    }

    const recentlyCompleted = this.recentlyCompleted
      .filter((e) => e.completedAt > cutoff)
      .map((e) => e.session);

    return { processing, queued, recentlyCompleted };
  }

  /**
   * Register a callback to be called whenever pipeline state changes.
   * The callback receives the updated snapshot.
   */
  onUpdate(callback: PipelineStatusCallback): void {
    this.callbacks.add(callback);
  }

  /**
   * Remove a previously registered update callback.
   * No-op if the callback is not registered.
   */
  offUpdate(callback: PipelineStatusCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * Unsubscribe all event bus handlers. Call this when shutting down the service.
   */
  destroy(): void {
    for (const [type, handler] of this.handlers) {
      this.eventBus.off(type, handler as unknown as EventHandler<PipelineEventType>);
    }
    this.handlers.clear();
    this.callbacks.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Load current pipeline state from DB to reconstruct in-memory map. */
  private async loadInitialState(): Promise<void> {
    const activeStatuses: DetectionStatus[] = [...PROCESSING_STATUSES, 'queued'];
    const sessions = await this.sessionAdapter.findByStatuses(activeStatuses);
    for (const session of sessions) {
      this.activeSessions.set(session.id, {
        id: session.id,
        name: session.filename,
        status: session.detection_status!,
      });
    }
  }

  /** Subscribe to all pipeline event types on the event bus. */
  private subscribeToEvents(): void {
    // Upload creates a new active session entry
    this.registerHandler('session.uploaded', (event) => {
      this.handleUploaded(event);
    });

    // Progress events advance the session's status to the next pipeline stage
    for (const eventType of Object.keys(EVENT_TO_STATUS) as PipelineEventType[]) {
      if (eventType === 'session.uploaded') continue; // handled above
      const nextStatus = EVENT_TO_STATUS[eventType]!;
      this.registerHandler(eventType, (event) => {
        this.handleProgressEvent(event.sessionId, nextStatus);
      });
    }

    // Retry keeps the session active in processing state
    this.registerHandler('session.retrying', (event) => {
      this.handleProgressEvent(event.sessionId, 'processing');
    });

    // Terminal events move sessions to recentlyCompleted
    this.registerHandler('session.ready', (event) => {
      this.handleTerminal(event.sessionId, 'completed');
    });
    this.registerHandler('session.failed', (event) => {
      this.handleTerminal(event.sessionId, 'failed');
    });
  }

  /** Register a typed handler and store the reference for cleanup. */
  private registerHandler<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void {
    this.handlers.set(type, handler as unknown as AnyEventHandler);
    this.eventBus.on(type, handler);
  }

  /** Handle session.uploaded — add new session to the active processing list. */
  private handleUploaded(event: Extract<PipelineEvent, { type: 'session.uploaded' }>): void {
    this.activeSessions.set(event.sessionId, {
      id: event.sessionId,
      name: event.filename,
      status: EVENT_TO_STATUS['session.uploaded']!,
    });
    this.notifyCallbacks();
  }

  /** Handle intermediate pipeline events — update the session's current status. */
  private handleProgressEvent(sessionId: string, status: DetectionStatus): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = status;
    } else {
      this.activeSessions.set(sessionId, { id: sessionId, name: sessionId, status });
    }
    this.notifyCallbacks();
  }

  /** Handle terminal events (ready/failed) — move session to recentlyCompleted. */
  private handleTerminal(sessionId: string, status: DetectionStatus): void {
    const session = this.activeSessions.get(sessionId);
    this.activeSessions.delete(sessionId);

    const completedSession: PipelineSession = {
      id: sessionId,
      name: session?.name ?? sessionId,
      status,
      completedAt: new Date().toISOString(),
    };

    const now = Date.now();
    const cutoff = now - RECENTLY_COMPLETED_TTL_MS;

    // Prune expired entries before appending to prevent unbounded growth.
    this.recentlyCompleted = this.recentlyCompleted.filter((e) => e.completedAt > cutoff);
    this.recentlyCompleted.push({ session: completedSession, completedAt: now });
    this.notifyCallbacks();
  }

  /** Notify all registered callbacks with the current snapshot. */
  private notifyCallbacks(): void {
    if (this.callbacks.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const cb of this.callbacks) {
      cb(snapshot);
    }
  }
}

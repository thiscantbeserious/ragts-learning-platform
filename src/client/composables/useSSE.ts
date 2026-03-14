/**
 * useSSE — real-time session status updates via Server-Sent Events.
 *
 * Opens an EventSource to /api/sessions/:id/events while the session is in an
 * active (processing) state. Tracks a module-level connection budget of max 3
 * concurrent SSE connections; sessions beyond the budget fall back to 10s polling.
 *
 * Returns reactive `status` and `isConnected` refs. The connection closes
 * automatically on terminal events (session.ready / session.failed), session ID
 * change, or component unmount.
 */

import { ref, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { DetectionStatus } from '../../shared/types/pipeline.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum concurrent SSE connections. */
const MAX_CONNECTIONS = 3;

/** Polling interval in milliseconds for sessions beyond the budget. */
const POLL_INTERVAL_MS = 10_000;

/** Processing statuses that warrant an active connection. */
const ACTIVE_STATUSES = new Set<DetectionStatus>([
  'pending', 'processing', 'queued', 'validating',
  'detecting', 'replaying', 'deduplicating', 'storing',
]);

/** Terminal statuses — connection closes when one is reached. */
const TERMINAL_STATUSES = new Set<DetectionStatus>(['completed', 'failed', 'interrupted']);

// ---------------------------------------------------------------------------
// Module-level budget tracker
// ---------------------------------------------------------------------------

/** Session IDs that currently hold an SSE connection slot. */
const activeConnections = new Set<string>();

/**
 * Attempt to acquire a connection slot for the given session ID.
 * Returns true if the slot was acquired, false if budget is exhausted.
 */
function acquireSlot(sessionId: string): boolean {
  if (activeConnections.has(sessionId)) return true;
  if (activeConnections.size >= MAX_CONNECTIONS) return false;
  activeConnections.add(sessionId);
  return true;
}

/** Release a connection slot for the given session ID. */
function releaseSlot(sessionId: string): void {
  activeConnections.delete(sessionId);
}

/**
 * Reset the connection budget. Exported for use in tests only.
 * Do not call this in production code.
 */
export function resetConnectionBudget(): void {
  activeConnections.clear();
}

// ---------------------------------------------------------------------------
// Event → next status mapping
// ---------------------------------------------------------------------------

/**
 * Maps incoming SSE event types to the corresponding next detection_status.
 * Terminal events (session.ready, session.failed) are handled separately.
 */
const EVENT_TO_STATUS: Record<string, DetectionStatus> = {
  'session.validated': 'detecting',
  'session.detected': 'replaying',
  'session.replayed': 'deduplicating',
  'session.deduped': 'storing',
};

// ---------------------------------------------------------------------------
// Response shape for polling endpoint
// ---------------------------------------------------------------------------

interface SessionPollResponse {
  id: string;
  detection_status?: DetectionStatus;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export interface UseSSEReturn {
  /** Reactive detection_status, updated by SSE events or polling. */
  status: Ref<DetectionStatus | undefined>;
  /** True while the SSE connection is open. */
  isConnected: Ref<boolean>;
}

/**
 * Opens an SSE connection (or polling fallback) to track real-time status
 * updates for a session. Closes automatically on terminal events or unmount.
 *
 * @param sessionId - Reactive session ID. Changing this value re-opens the connection.
 * @param detectionStatus - Initial detection_status from the session object.
 */
export function useSSE(
  sessionId: Ref<string>,
  detectionStatus: Ref<DetectionStatus | undefined>,
): UseSSEReturn {
  const status = ref<DetectionStatus | undefined>(detectionStatus.value);
  const isConnected = ref(false);

  let eventSource: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let currentSessionId = '';
  /** Set to true when an SSE event updates status; prevents stale sync-on-open overwrite. */
  let sseEventReceived = false;

  /** Close SSE connection and release budget slot. */
  function closeSSE(): void {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isConnected.value = false;
    if (currentSessionId) {
      releaseSlot(currentSessionId);
    }
  }

  /** Clear polling timer. */
  function clearPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** Teardown both SSE and polling. */
  function teardown(): void {
    closeSSE();
    clearPolling();
  }

  /** Register named-event listeners on the EventSource. */
  function attachEventListeners(es: EventSource): void {
    const eventTypes = Object.keys(EVENT_TO_STATUS);
    eventTypes.push('session.ready', 'session.failed');

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        handleSSEMessage(type, e);
      });
    }
  }

  /** Handle an SSE message — update status and close on terminal event. */
  function handleSSEMessage(type: string, _e: MessageEvent): void {
    sseEventReceived = true;
    if (type === 'session.ready') {
      status.value = 'completed';
      closeSSE();
      return;
    }
    if (type === 'session.failed') {
      status.value = 'failed';
      closeSSE();
      return;
    }
    const next = EVENT_TO_STATUS[type];
    if (next !== undefined) {
      status.value = next;
    }
  }

  /**
   * Sync session status once via REST on SSE open.
   * If the server reports a terminal status (already completed/failed before the client
   * connected), update liveStatus and close the SSE connection immediately so the card
   * stops showing "Processing" indefinitely.
   * Skips applying the fetched status if an SSE event has already provided a more recent value,
   * or if the session ID has changed since the request was initiated.
   */
  async function syncStatusOnOpen(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json() as SessionPollResponse;
      if (data.detection_status === undefined) return;
      // If an SSE event already updated status, skip applying the potentially stale fetch result
      if (sseEventReceived) return;
      // Guard against stale response when session ID has changed
      if (currentSessionId !== id) return;
      status.value = data.detection_status;
      if (TERMINAL_STATUSES.has(data.detection_status)) {
        closeSSE();
      }
    } catch {
      // Sync errors are non-fatal — SSE events will still drive status updates
    }
  }

  /** Open SSE connection for the given session ID. */
  function openSSE(id: string): void {
    if (!acquireSlot(id)) {
      startPolling(id);
      return;
    }
    currentSessionId = id;

    const es = new EventSource(`/api/sessions/${id}/events`);
    eventSource = es;

    es.onopen = () => {
      isConnected.value = true;
      void syncStatusOnOpen(id);
    };
    es.onerror = () => {
      // Close the EventSource first to prevent automatic reconnection,
      // then release the budget slot and clean up state.
      closeSSE();
    };

    attachEventListeners(es);
  }

  /** Poll /api/sessions/:id at POLL_INTERVAL_MS until terminal status. */
  function startPolling(id: string): void {
    clearPolling();
    pollTimer = setInterval(() => {
      void pollSession(id);
    }, POLL_INTERVAL_MS);
  }

  /** Fetch session status once and update the reactive ref. */
  async function pollSession(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json() as SessionPollResponse;
      if (data.detection_status !== undefined) {
        status.value = data.detection_status;
        if (TERMINAL_STATUSES.has(data.detection_status)) {
          clearPolling();
        }
      }
    } catch {
      // Polling errors are non-fatal — will retry on next tick
    }
  }

  /** Start the appropriate connection strategy for the current session ID. */
  function connect(id: string): void {
    teardown();
    currentSessionId = id;
    sseEventReceived = false;
    status.value = detectionStatus.value;

    const currentStatus = status.value;
    if (currentStatus === undefined || !ACTIVE_STATUSES.has(currentStatus)) {
      return;
    }

    openSSE(id);
  }

  // Watch session ID changes — re-connect when ID changes
  watch(
    sessionId,
    (id) => { connect(id); },
    { immediate: true },
  );

  onUnmounted(teardown);

  return { status, isConnected };
}

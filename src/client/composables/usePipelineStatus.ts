/**
 * usePipelineStatus — aggregate pipeline state via Server-Sent Events.
 *
 * Connects to GET /api/pipeline/status and listens for `pipeline-status`
 * events containing PipelineStatusSnapshot payloads. Exposes reactive refs
 * for processing, queued, and recently-completed sessions plus computed counts.
 *
 * Unlike useSSE, this composable manages its own single SSE connection
 * independently — it does not share the per-session MAX_CONNECTIONS budget.
 * Use `provide(pipelineStatusKey, usePipelineStatus())` in SpatialShell.
 */

import { ref, computed, onUnmounted, getCurrentInstance } from 'vue';
import type { Ref, ComputedRef, InjectionKey } from 'vue';
import type { PipelineSession, PipelineStatusSnapshot } from '../../shared/types/pipeline_status.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SSE_ENDPOINT = '/api/pipeline/status';
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the pipeline status state provided to child components. */
export interface PipelineStatusState {
  /** Sessions actively running through the pipeline. */
  processingSessions: Ref<PipelineSession[]>;
  /** Sessions waiting in the queue, ordered by position. */
  queuedSessions: Ref<PipelineSession[]>;
  /** Sessions that completed in the last 5 minutes. */
  recentlyCompleted: Ref<PipelineSession[]>;
  /** Number of sessions currently processing. */
  processingCount: ComputedRef<number>;
  /** Number of sessions waiting in queue. */
  queuedCount: ComputedRef<number>;
  /** Total active sessions (processing + queued). */
  totalActive: ComputedRef<number>;
  /** True while the SSE connection is open. */
  connected: Ref<boolean>;
  /** Close the SSE connection and cancel any pending reconnect. Call on unmount. */
  cleanup: () => void;
}

/**
 * Injection key for pipeline status state.
 * Provided by SpatialShell, injected by toolbar components.
 */
export const pipelineStatusKey: InjectionKey<PipelineStatusState> = Symbol('pipelineStatus');

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Subscribes to the pipeline status SSE stream and exposes reactive state.
 * Handles disconnection with exponential backoff reconnection.
 * Registers a cleanup on component unmount when called inside a component.
 */
export function usePipelineStatus(): PipelineStatusState {
  const processingSessions = ref<PipelineSession[]>([]);
  const queuedSessions = ref<PipelineSession[]>([]);
  const recentlyCompleted = ref<PipelineSession[]>([]);
  const connected = ref(false);

  const processingCount: ComputedRef<number> = computed(() => processingSessions.value.length);
  const queuedCount: ComputedRef<number> = computed(() => queuedSessions.value.length);
  const totalActive: ComputedRef<number> = computed(() => processingCount.value + queuedCount.value);

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  /** Apply a snapshot to the reactive refs. */
  function applySnapshot(snapshot: PipelineStatusSnapshot): void {
    processingSessions.value = snapshot.processing;
    queuedSessions.value = snapshot.queued;
    recentlyCompleted.value = snapshot.recentlyCompleted;
  }

  /** Cancel any pending reconnect timer. */
  function cancelReconnect(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  /** Close the current EventSource and mark as disconnected. */
  function closeConnection(): void {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    connected.value = false;
  }

  /** Open a fresh EventSource connection to the pipeline status endpoint. */
  function openConnection(): void {
    closeConnection();

    const es = new EventSource(SSE_ENDPOINT);
    eventSource = es;

    es.onopen = () => {
      connected.value = true;
      attempt = 0;
    };

    es.onerror = () => {
      closeConnection();
      scheduleReconnect();
    };

    es.addEventListener('pipeline-status', (e: MessageEvent) => {
      try {
        // The server wraps the snapshot in { type, data }. Extract the inner payload.
        const parsed = JSON.parse(e.data as string) as { type: string; data: PipelineStatusSnapshot } | PipelineStatusSnapshot;
        const snapshot = 'data' in parsed && typeof parsed.data === 'object' && parsed.data !== null
          ? parsed.data
          : parsed as PipelineStatusSnapshot;
        applySnapshot(snapshot);
      } catch {
        // Malformed snapshot — ignore and wait for next event
      }
    });
  }

  /** Schedule a reconnect attempt using exponential backoff. */
  function scheduleReconnect(): void {
    cancelReconnect();
    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openConnection();
    }, delay);
  }

  /** Close connection and cancel any pending reconnect. */
  function cleanup(): void {
    cancelReconnect();
    closeConnection();
  }

  openConnection();
  // Only register lifecycle hook when called inside a component setup context.
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return {
    processingSessions,
    queuedSessions,
    recentlyCompleted,
    processingCount,
    queuedCount,
    totalActive,
    connected,
    cleanup,
  };
}

/**
 * Tests for usePipelineStatus composable.
 *
 * Covers: SSE connection lifecycle, state updates from pipeline-status events,
 * exponential backoff reconnection, cleanup on unmount, and InjectionKey export.
 *
 * EventSource is stubbed globally since happy-dom does not provide a native
 * implementation. Each test drives events manually via the mock instance API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { usePipelineStatus, pipelineStatusKey } from './usePipelineStatus.js';
import type { PipelineStatusSnapshot } from '../../shared/types/pipeline_status.js';

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

interface MockEventSourceInstance {
  url: string;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener: (type: string, handler: (e: MessageEvent) => void) => void;
  close: () => void;
  /** Simulate the server opening the connection. */
  simulateOpen: () => void;
  /** Simulate a pipeline-status event. */
  simulateStatus: (snapshot: PipelineStatusSnapshot) => void;
  /** Simulate a connection error (fires onerror). */
  simulateError: () => void;
  /** Whether close() has been called. */
  closed: boolean;
}

let mockInstances: MockEventSourceInstance[] = [];

function createMockEventSource(url: string): MockEventSourceInstance {
  const handlers = new Map<string, Set<(e: MessageEvent) => void>>();

  const instance: MockEventSourceInstance = {
    url,
    onopen: null,
    onerror: null,
    closed: false,

    addEventListener(type: string, handler: (e: MessageEvent) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },

    close() {
      this.closed = true;
    },

    simulateOpen() {
      this.onopen?.(new Event('open'));
    },

    simulateStatus(snapshot: PipelineStatusSnapshot) {
      const event = new MessageEvent('pipeline-status', {
        data: JSON.stringify(snapshot),
      });
      handlers.get('pipeline-status')?.forEach(h => h(event));
    },

    simulateError() {
      this.onerror?.(new Event('error'));
    },
  };

  mockInstances.push(instance);
  return instance;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function MockEventSourceConstructor(url: string) {
  return createMockEventSource(url);
}
MockEventSourceConstructor.prototype = {};

beforeEach(() => {
  mockInstances = [];
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', MockEventSourceConstructor);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<PipelineStatusSnapshot> = {}): PipelineStatusSnapshot {
  return {
    processing: [],
    queued: [],
    recentlyCompleted: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePipelineStatus()', () => {
  describe('InjectionKey', () => {
    it('exports pipelineStatusKey as a Symbol', () => {
      expect(typeof pipelineStatusKey).toBe('symbol');
    });
  });

  describe('SSE connection', () => {
    it('opens an EventSource to /api/pipeline/status on creation', () => {
      usePipelineStatus();
      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0]!.url).toBe('/api/pipeline/status');
    });

    it('sets connected=true when connection opens', async () => {
      const composable = usePipelineStatus();
      expect(composable.connected.value).toBe(false);

      mockInstances[0]!.simulateOpen();
      await nextTick();

      expect(composable.connected.value).toBe(true);
    });

    it('sets connected=false when connection errors', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();
      await nextTick();

      mockInstances[0]!.simulateError();
      await nextTick();

      expect(composable.connected.value).toBe(false);
    });
  });

  describe('state from pipeline-status events', () => {
    it('updates processingSessions from snapshot', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();

      const snapshot = makeSnapshot({
        processing: [{ id: 's1', name: 'a.cast', status: 'processing' }],
      });
      mockInstances[0]!.simulateStatus(snapshot);
      await nextTick();

      expect(composable.processingSessions.value).toHaveLength(1);
      expect(composable.processingSessions.value[0]!.id).toBe('s1');
    });

    it('updates queuedSessions from snapshot', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();

      const snapshot = makeSnapshot({
        queued: [{ id: 's2', name: 'b.cast', status: 'queued', queuePosition: 1 }],
      });
      mockInstances[0]!.simulateStatus(snapshot);
      await nextTick();

      expect(composable.queuedSessions.value).toHaveLength(1);
      expect(composable.queuedSessions.value[0]!.id).toBe('s2');
    });

    it('updates recentlyCompleted from snapshot', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();

      const snapshot = makeSnapshot({
        recentlyCompleted: [{ id: 's3', name: 'c.cast', status: 'completed', completedAt: '2024-01-01T00:00:00Z' }],
      });
      mockInstances[0]!.simulateStatus(snapshot);
      await nextTick();

      expect(composable.recentlyCompleted.value).toHaveLength(1);
      expect(composable.recentlyCompleted.value[0]!.id).toBe('s3');
    });
  });

  describe('computed counts', () => {
    it('processingCount reflects processingSessions length', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();

      mockInstances[0]!.simulateStatus(makeSnapshot({
        processing: [
          { id: 's1', name: 'a.cast', status: 'processing' },
          { id: 's2', name: 'b.cast', status: 'processing' },
        ],
      }));
      await nextTick();

      expect(composable.processingCount.value).toBe(2);
    });

    it('queuedCount reflects queuedSessions length', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();

      mockInstances[0]!.simulateStatus(makeSnapshot({
        queued: [{ id: 's1', name: 'a.cast', status: 'queued' }],
      }));
      await nextTick();

      expect(composable.queuedCount.value).toBe(1);
    });

    it('totalActive = processingCount + queuedCount', async () => {
      const composable = usePipelineStatus();
      mockInstances[0]!.simulateOpen();

      mockInstances[0]!.simulateStatus(makeSnapshot({
        processing: [{ id: 's1', name: 'a.cast', status: 'processing' }],
        queued: [{ id: 's2', name: 'b.cast', status: 'queued' }],
      }));
      await nextTick();

      expect(composable.totalActive.value).toBe(2);
    });

    it('totalActive is 0 when idle', () => {
      const composable = usePipelineStatus();
      expect(composable.totalActive.value).toBe(0);
    });
  });

  describe('reconnection on error', () => {
    it('attempts reconnect after connection error with backoff delay', async () => {
      usePipelineStatus();
      expect(mockInstances).toHaveLength(1);

      // Simulate error — should trigger reconnect after backoff
      mockInstances[0]!.simulateError();

      // Advance past first backoff (1000ms)
      vi.advanceTimersByTime(1100);
      await nextTick();

      expect(mockInstances).toHaveLength(2);
    });

    it('reconnects to the same endpoint', async () => {
      usePipelineStatus();

      mockInstances[0]!.simulateError();
      vi.advanceTimersByTime(1100);
      await nextTick();

      expect(mockInstances[1]!.url).toBe('/api/pipeline/status');
    });

    it('resets connected=true after successful reconnect', async () => {
      const composable = usePipelineStatus();

      mockInstances[0]!.simulateError();
      vi.advanceTimersByTime(1100);
      await nextTick();

      mockInstances[1]!.simulateOpen();
      await nextTick();

      expect(composable.connected.value).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('closes EventSource when cleanup is called', () => {
      const composable = usePipelineStatus();
      composable.cleanup();

      expect(mockInstances[0]!.closed).toBe(true);
    });

    it('cancels pending reconnect timer on cleanup', async () => {
      const composable = usePipelineStatus();

      mockInstances[0]!.simulateError();
      composable.cleanup();

      // Advance past backoff — no new EventSource should be created
      vi.advanceTimersByTime(2000);
      await nextTick();

      // Still only the original instance, closed
      expect(mockInstances).toHaveLength(1);
    });
  });
});

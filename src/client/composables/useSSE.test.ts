/**
 * Tests for useSSE composable — Stage 11.
 *
 * Covers: EventSource connection lifecycle, status updates from SSE events,
 * terminal event handling, connection budget enforcement (max 3), polling
 * fallback when over budget, and cleanup on unmount.
 *
 * EventSource is mocked globally. Each test creates a fresh instance via
 * the mockEventSourceFactory helper so event handlers can be driven manually.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useSSE, resetConnectionBudget } from './useSSE.js';
import type { DetectionStatus } from '../../shared/types/pipeline.js';

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

interface MockEventSourceInstance {
  url: string;
  onopen: ((e: Event) => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener: (type: string, handler: (e: MessageEvent) => void) => void;
  removeEventListener: (type: string, handler: (e: MessageEvent) => void) => void;
  close: () => void;
  /** Simulate the server sending an event by named event type. */
  simulateEvent: (type: string, data: object) => void;
  /** Simulate opening the connection. */
  simulateOpen: () => void;
  /** Simulate a connection error. */
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
    onmessage: null,
    onerror: null,
    closed: false,

    addEventListener(type: string, handler: (e: MessageEvent) => void) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
    },

    removeEventListener(type: string, handler: (e: MessageEvent) => void) {
      handlers.get(type)?.delete(handler);
    },

    close() {
      this.closed = true;
    },

    simulateOpen() {
      if (this.onopen) this.onopen(new Event('open'));
    },

    simulateEvent(type: string, data: object) {
      const msg = new MessageEvent(type, { data: JSON.stringify(data) });
      const set = handlers.get(type);
      if (set) {
        for (const h of set) h(msg);
      }
      if (this.onmessage) this.onmessage(msg);
    },

    simulateError() {
      if (this.onerror) this.onerror(new Event('error'));
    },
  };

  mockInstances.push(instance);
  return instance;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(s: DetectionStatus = 'processing') {
  return ref<DetectionStatus>(s);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

/** Constructable mock for EventSource that delegates to createMockEventSource. */
class MockEventSourceConstructor {
  constructor(url: string) {
    const instance = createMockEventSource(url);
    Object.assign(this, instance);
    return instance as unknown as MockEventSourceConstructor;
  }
}

beforeEach(() => {
  mockInstances = [];
  vi.stubGlobal('EventSource', MockEventSourceConstructor);
  vi.useFakeTimers();
  resetConnectionBudget();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetConnectionBudget();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSSE()', () => {
  describe('initial state', () => {
    it('starts with status equal to the initial detection_status', () => {
      const sessionId = ref('sess-1');
      const detectionStatus = makeStatus('processing');
      const { status } = useSSE(sessionId, detectionStatus);
      expect(status.value).toBe('processing');
    });

    it('starts with isConnected false', () => {
      const sessionId = ref('sess-1');
      const { isConnected } = useSSE(sessionId, makeStatus());
      expect(isConnected.value).toBe(false);
    });
  });

  describe('connection lifecycle — active status', () => {
    it('opens EventSource when status is a processing state', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0]!.url).toBe('/api/sessions/sess-1/events');
    });

    it('does not open EventSource when status is "completed"', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('completed'));
      await nextTick();
      expect(mockInstances).toHaveLength(0);
    });

    it('does not open EventSource when status is "failed"', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('failed'));
      await nextTick();
      expect(mockInstances).toHaveLength(0);
    });

    it('does not open EventSource when status is "interrupted"', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('interrupted'));
      await nextTick();
      expect(mockInstances).toHaveLength(0);
    });

    it('sets isConnected to true after simulated open', async () => {
      const sessionId = ref('sess-1');
      const { isConnected } = useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateOpen();
      expect(isConnected.value).toBe(true);
    });

    it('sets isConnected to false on error event', async () => {
      const sessionId = ref('sess-1');
      const { isConnected } = useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateOpen();
      instance.simulateError();
      expect(isConnected.value).toBe(false);
    });
  });

  describe('status updates from SSE events', () => {
    it('updates status when session.validated event arrives', async () => {
      const sessionId = ref('sess-1');
      const { status } = useSSE(sessionId, makeStatus('validating'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.validated', { type: 'session.validated', sessionId: 'sess-1', eventCount: 10 });
      expect(status.value).toBe('detecting');
    });

    it('updates status when session.detected event arrives', async () => {
      const sessionId = ref('sess-1');
      const { status } = useSSE(sessionId, makeStatus('detecting'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.detected', { type: 'session.detected', sessionId: 'sess-1', sectionCount: 5 });
      expect(status.value).toBe('replaying');
    });

    it('updates status when session.replayed event arrives', async () => {
      const sessionId = ref('sess-1');
      const { status } = useSSE(sessionId, makeStatus('replaying'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.replayed', { type: 'session.replayed', sessionId: 'sess-1', lineCount: 100 });
      expect(status.value).toBe('deduplicating');
    });

    it('updates status when session.deduped event arrives', async () => {
      const sessionId = ref('sess-1');
      const { status } = useSSE(sessionId, makeStatus('deduplicating'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.deduped', { type: 'session.deduped', sessionId: 'sess-1', rawLines: 50, cleanLines: 40 });
      expect(status.value).toBe('storing');
    });

    it('updates status to "completed" when session.ready event arrives', async () => {
      const sessionId = ref('sess-1');
      const { status } = useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.ready', { type: 'session.ready', sessionId: 'sess-1' });
      expect(status.value).toBe('completed');
    });

    it('updates status to "failed" when session.failed event arrives', async () => {
      const sessionId = ref('sess-1');
      const { status } = useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.failed', { type: 'session.failed', sessionId: 'sess-1', stage: 'validate', error: 'bad data' });
      expect(status.value).toBe('failed');
    });
  });

  describe('terminal event handling', () => {
    it('closes EventSource after session.ready event', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.ready', { type: 'session.ready', sessionId: 'sess-1' });
      expect(instance.closed).toBe(true);
    });

    it('closes EventSource after session.failed event', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.failed', { type: 'session.failed', sessionId: 'sess-1', stage: 'validate', error: 'bad' });
      expect(instance.closed).toBe(true);
    });

    it('sets isConnected to false after terminal event', async () => {
      const sessionId = ref('sess-1');
      const { isConnected } = useSSE(sessionId, makeStatus('processing'));
      await nextTick();
      const instance = mockInstances[0]!;
      instance.simulateOpen();
      instance.simulateEvent('session.ready', { type: 'session.ready', sessionId: 'sess-1' });
      expect(isConnected.value).toBe(false);
    });
  });

  describe('connection budget — max 3 concurrent', () => {
    it('opens connections for the first 3 active sessions', async () => {
      useSSE(ref('sess-1'), makeStatus('processing'));
      useSSE(ref('sess-2'), makeStatus('processing'));
      useSSE(ref('sess-3'), makeStatus('processing'));
      await nextTick();
      expect(mockInstances).toHaveLength(3);
    });

    it('does not open a 4th connection when budget is exhausted', async () => {
      useSSE(ref('sess-1'), makeStatus('processing'));
      useSSE(ref('sess-2'), makeStatus('processing'));
      useSSE(ref('sess-3'), makeStatus('processing'));
      useSSE(ref('sess-4'), makeStatus('processing'));
      await nextTick();
      expect(mockInstances).toHaveLength(3);
    });

    it('releases budget slot when terminal event closes connection', async () => {
      useSSE(ref('sess-1'), makeStatus('processing'));
      useSSE(ref('sess-2'), makeStatus('processing'));
      useSSE(ref('sess-3'), makeStatus('processing'));
      await nextTick();
      // All 3 slots used — simulate terminal event on sess-1
      const [inst1] = mockInstances;
      inst1!.simulateEvent('session.ready', { type: 'session.ready', sessionId: 'sess-1' });

      // Now sess-4 should be able to connect
      useSSE(ref('sess-4'), makeStatus('processing'));
      await nextTick();
      expect(mockInstances).toHaveLength(4);
    });
  });

  describe('polling fallback — beyond budget', () => {
    it('polls /api/sessions/:id when beyond connection budget', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'sess-4', detection_status: 'processing' }),
      }));

      useSSE(ref('sess-1'), makeStatus('processing'));
      useSSE(ref('sess-2'), makeStatus('processing'));
      useSSE(ref('sess-3'), makeStatus('processing'));
      await nextTick();

      const status4 = makeStatus('processing');
      useSSE(ref('sess-4'), status4);
      await nextTick();

      // Advance timer to trigger first poll (10s interval)
      vi.advanceTimersByTime(10000);
      await nextTick();

      expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/sessions/sess-4');
    });

    it('updates status from polling response when it changes', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'sess-4', detection_status: 'completed' }),
      }));

      useSSE(ref('sess-1'), makeStatus('processing'));
      useSSE(ref('sess-2'), makeStatus('processing'));
      useSSE(ref('sess-3'), makeStatus('processing'));
      await nextTick();

      const status4 = makeStatus('processing');
      const { status } = useSSE(ref('sess-4'), status4);
      await nextTick();

      vi.advanceTimersByTime(10000);
      await Promise.resolve(); // flush promise queue
      await nextTick();

      expect(status.value).toBe('completed');
    });

    it('stops polling after terminal status is reached', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'sess-4', detection_status: 'completed' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      useSSE(ref('sess-1'), makeStatus('processing'));
      useSSE(ref('sess-2'), makeStatus('processing'));
      useSSE(ref('sess-3'), makeStatus('processing'));
      await nextTick();

      useSSE(ref('sess-4'), makeStatus('processing'));
      await nextTick();

      // First poll — returns completed
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await nextTick();

      const callCountAfterFirst = fetchMock.mock.calls.length;

      // Second poll tick — should NOT call fetch again
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      await nextTick();

      expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  describe('session ID change', () => {
    it('closes existing connection and opens new one when sessionId changes', async () => {
      const sessionId = ref('sess-1');
      useSSE(sessionId, makeStatus('processing'));
      await nextTick();

      const firstInstance = mockInstances[0]!;
      expect(firstInstance.closed).toBe(false);

      sessionId.value = 'sess-2';
      await nextTick();

      expect(firstInstance.closed).toBe(true);
      // Second instance should have been created with sess-2
      expect(mockInstances).toHaveLength(2);
      expect(mockInstances[1]!.url).toBe('/api/sessions/sess-2/events');
    });

    it('resets status to initial detectionStatus when sessionId changes', async () => {
      const sessionId = ref('sess-1');
      const initialStatus = makeStatus('processing');
      const { status } = useSSE(sessionId, initialStatus);
      await nextTick();

      // Simulate a status update from SSE
      const instance = mockInstances[0]!;
      instance.simulateEvent('session.validated', { type: 'session.validated', sessionId: 'sess-1', eventCount: 5 });
      expect(status.value).toBe('detecting');

      // Change session ID — status should reset to initial
      sessionId.value = 'sess-2';
      await nextTick();
      expect(status.value).toBe(initialStatus.value);
    });
  });
});

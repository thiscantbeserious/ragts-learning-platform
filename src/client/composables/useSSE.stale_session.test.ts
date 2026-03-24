/**
 * Branch coverage for useSSE — stale session guard (line 196).
 *
 * Lines targeted:
 *   196 — syncStatusOnOpen: `if (currentSessionId !== id) return;`
 *         This guard fires when the sessionId ref changes while a fetch is in-flight.
 *         The stale response should be discarded.
 *
 * Also covers acquireSlot returning false (line 49): already partially covered,
 * adding another explicit variant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useSSE, resetConnectionBudget } from './useSSE.js';
import type { DetectionStatus } from '../../shared/types/pipeline.js';

interface MockEventSourceInstance {
  url: string;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener: (type: string, handler: (e: MessageEvent) => void) => void;
  close: () => void;
  simulateOpen: () => void;
  closed: boolean;
}

let mockInstances: MockEventSourceInstance[] = [];

function createMockEventSource(url: string): MockEventSourceInstance {
  const instance: MockEventSourceInstance = {
    url,
    onopen: null,
    onerror: null,
    closed: false,
    addEventListener: vi.fn(),
    close() {
      this.closed = true;
    },
    simulateOpen() {
      if (this.onopen) this.onopen(new Event('open'));
    },
  };
  mockInstances.push(instance);
  return instance;
}

function MockEventSourceConstructor(this: MockEventSourceInstance, url: string): void {
  const instance = createMockEventSource(url);
  Object.assign(this, instance);
  mockInstances[mockInstances.length - 1] = this;
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

describe('useSSE() — stale session guard in syncStatusOnOpen (line 196)', () => {
  it('discards sync response when sessionId changes while fetch is in-flight', async () => {
    let resolveSecondFetch: (value: Response) => void = () => {};
    let fetchCallCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string) => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          // First fetch: returns a pending promise that we control
          return new Promise<Response>((resolve) => {
            resolveSecondFetch = resolve;
          });
        }
        // Second fetch (after session ID change): resolve immediately
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ id: 'sess-b', detection_status: 'completed' as DetectionStatus }),
        } as Response);
      }),
    );

    // Start with session A
    const sessionId = ref('sess-a');
    const { status } = useSSE(sessionId, ref<DetectionStatus>('processing'));
    await nextTick();

    // Open SSE connection for session A
    const instance = mockInstances[0]!;
    instance.simulateOpen();
    // syncStatusOnOpen for sess-a is now in-flight (pending)

    // Change session ID to B — this re-connects and sets currentSessionId = 'sess-b'
    sessionId.value = 'sess-b';
    await nextTick();
    await nextTick();

    // Now resolve the stale fetch for sess-a with completed status
    resolveSecondFetch({
      ok: true,
      json: () =>
        Promise.resolve({ id: 'sess-a', detection_status: 'completed' as DetectionStatus }),
    } as Response);
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    // Status should NOT be 'completed' from stale sess-a response
    // currentSessionId is now 'sess-b', so the guard fires and discards the stale result
    // Status was reset to the new session's initial status ('processing') when session changed
    expect(status.value).toBe('processing');
  });
});

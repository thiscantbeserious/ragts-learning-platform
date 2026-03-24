/**
 * Branch coverage tests for SidebarPanel — drag-drop optimistic callbacks (lines 282-295).
 *
 * Lines targeted:
 *   282-290 — onDrop handler: onOptimisticInsert callback (prepends temp session)
 *   284-290 — onDrop handler: onUploadComplete callback (removes temp session + refresh)
 *
 * The existing SidebarPanel.upload.test.ts covers the FILE INPUT path for these callbacks.
 * This test covers the equivalent callbacks in the DRAG-DROP path (onDrop function).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { provide, defineComponent, ref, computed } from 'vue';
import type { Session } from '../../shared/types/session.js';
import SidebarPanel from './SidebarPanel.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';

const mockUploadFileWithOptimisticDrag = vi.fn();

vi.mock('../composables/useUpload.js', () => ({
  useUpload: () => ({
    uploadFileWithOptimistic: mockUploadFileWithOptimisticDrag,
    uploading: ref(false),
    error: ref(null),
    isDragging: ref(false),
  }),
}));

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/session/:id', component: { template: '<div />' } },
    ],
  });
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test.cast',
    filepath: '/data/sessions/test.cast',
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    detection_status: 'completed',
    ...overrides,
  };
}

function makeSessionListState(overrides: Partial<SessionListState> = {}): SessionListState {
  const sessions = ref<Session[]>(overrides.sessions?.value ?? []);
  const searchQuery = ref('');
  const statusFilter = ref('all' as const);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filteredSessions = computed(() => sessions.value);
  return {
    sessions,
    loading,
    error,
    searchQuery,
    statusFilter,
    filteredSessions,
    fetchSessions: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn(),
    refreshOnSessionComplete: vi.fn(),
    ...overrides,
  };
}

async function mountWithState(state: SessionListState) {
  const router = createTestRouter();
  await router.push('/');
  const Wrapper = defineComponent({
    components: { SidebarPanel },
    setup() {
      provide(sessionListKey, state);
      return {};
    },
    template: '<SidebarPanel />',
  });
  return mount(Wrapper, { global: { plugins: [router] } });
}

describe('SidebarPanel — drag-drop onOptimisticInsert callback (line 282-290)', () => {
  beforeEach(() => {
    mockUploadFileWithOptimisticDrag.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('onOptimisticInsert via drag-drop prepends temp session to the list', async () => {
    const state = makeSessionListState();
    const wrapper = await mountWithState(state);

    const sidebar = wrapper.find('.spatial-shell__sidebar');
    const file = new File(['content'], 'dragged.cast');
    await sidebar.trigger('drop', { dataTransfer: { files: [file] } });

    // Verify the callback was registered
    const callArgs = mockUploadFileWithOptimisticDrag.mock.calls[0];
    expect(callArgs).toBeDefined();
    const callbacks = callArgs![1] as { onOptimisticInsert: (s: Session) => void };

    const tempSession = makeSession({ id: 'temp-drag-1', filename: 'dragged.cast' });
    callbacks.onOptimisticInsert(tempSession);

    // Session should be prepended to the list
    expect(state.sessions.value[0]).toEqual(tempSession);
  });

  it('onUploadComplete via drag-drop removes temp session and calls fetchSessions', async () => {
    const tempSession = makeSession({ id: 'temp-drag-2', filename: 'drag-upload.cast' });
    const existingSession = makeSession({ id: 'existing', filename: 'existing.cast' });
    const state = makeSessionListState({
      sessions: ref([tempSession, existingSession]),
    });
    const wrapper = await mountWithState(state);

    const sidebar = wrapper.find('.spatial-shell__sidebar');
    const file = new File(['content'], 'drag-upload.cast');
    await sidebar.trigger('drop', { dataTransfer: { files: [file] } });

    const callArgs = mockUploadFileWithOptimisticDrag.mock.calls[0];
    const callbacks = callArgs![1] as { onUploadComplete: (tempId: string) => Promise<void> };

    await callbacks.onUploadComplete('temp-drag-2');

    // Temp session should be removed from the list
    expect(state.sessions.value.find((s) => s.id === 'temp-drag-2')).toBeUndefined();
    // fetchSessions should have been called to refresh
    expect(state.fetchSessions).toHaveBeenCalled();
  });
});

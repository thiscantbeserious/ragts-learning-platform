/**
 * Unit tests for LandingPage orchestration.
 * Exercises empty/populated state branching, composable wiring,
 * body class management, and toast integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ref, computed } from 'vue';
import LandingPage from './LandingPage.vue';

// Mock all composables used by LandingPage
vi.mock('../composables/useSessionList', () => ({
  useSessionList: vi.fn(),
}));
vi.mock('../composables/useSessionFilter', () => ({
  useSessionFilter: vi.fn(),
}));
vi.mock('../composables/useSessionSSE', () => ({
  useSessionSSE: vi.fn(),
}));
vi.mock('../composables/useUpload', () => ({
  useUpload: vi.fn(),
}));
vi.mock('../composables/useToast', () => ({
  useToast: vi.fn(),
}));

import { useSessionList } from '../composables/useSessionList';
import { useSessionFilter } from '../composables/useSessionFilter';
import { useSessionSSE } from '../composables/useSessionSSE';
import { useUpload } from '../composables/useUpload';
import { useToast } from '../composables/useToast';
import type { Session } from '../../shared/types/session.js';
import type { SessionFilterGroup } from '../composables/useSessionFilter';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'landing', component: { template: '<div />' } },
    { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
  ],
});

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    filename: `session-${id}.cast`,
    filepath: `/data/sessions/${id}.cast`,
    size_bytes: 100_000,
    marker_count: 3,
    uploaded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    detection_status: 'completed',
    ...overrides,
  };
}

interface SetupOptions {
  sessions?: Session[];
  loading?: boolean;
  filteredSessions?: Session[];
  searchQuery?: string;
  activeFilter?: SessionFilterGroup;
  connectionStates?: Map<string, 'connecting' | 'connected' | 'disconnected'>;
  isDragging?: boolean;
}

function setupMocks({
  sessions = [],
  loading = false,
  filteredSessions,
  searchQuery = '',
  activeFilter = 'all' as SessionFilterGroup,
  connectionStates = new Map<string, 'connecting' | 'connected' | 'disconnected'>(),
  isDragging = false,
}: SetupOptions = {}) {
  const resolvedFiltered = filteredSessions ?? sessions;
  const sessionsRef = ref(sessions);
  const loadingRef = ref(loading);
  const filteredSessionsComputed = computed(() => resolvedFiltered);
  const searchQueryRef = ref(searchQuery);
  const activeFilterRef = ref<SessionFilterGroup>(activeFilter);

  vi.mocked(useSessionList).mockReturnValue({
    sessions: sessionsRef,
    loading: loadingRef,
    error: ref(null),
    fetchSessions: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(true),
    updateSession: vi.fn().mockResolvedValue(undefined),
  } as ReturnType<typeof useSessionList>);

  vi.mocked(useSessionFilter).mockReturnValue({
    searchQuery: searchQueryRef,
    activeFilter: activeFilterRef,
    filteredSessions: filteredSessionsComputed,
  } as ReturnType<typeof useSessionFilter>);

  vi.mocked(useSessionSSE).mockReturnValue({
    connectionStates: ref(connectionStates),
  } as ReturnType<typeof useSessionSSE>);

  const addToastMock = vi.fn();
  const removeToastMock = vi.fn();
  vi.mocked(useToast).mockReturnValue({
    toasts: ref([]),
    addToast: addToastMock,
    removeToast: removeToastMock,
  });

  const triggerFileInputMock = vi.fn();
  vi.mocked(useUpload).mockReturnValue({
    uploading: ref(false),
    error: ref(null),
    isDragging: ref(isDragging),
    uploadFile: vi.fn().mockResolvedValue(undefined),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleFileInput: vi.fn(),
    clearError: vi.fn(),
  });

  return { addToastMock, triggerFileInputMock, sessionsRef, loadingRef, searchQueryRef, activeFilterRef };
}

function mountPage() {
  return mount(LandingPage, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
}

describe('LandingPage — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('renders UploadZone in .landing-empty when no sessions and not loading', () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    expect(wrapper.find('.landing-empty').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'UploadZone' }).exists()).toBe(true);
    wrapper.unmount();
  });

  it('does NOT render SessionToolbar in empty state', () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'SessionToolbar' }).exists()).toBe(false);
    wrapper.unmount();
  });

  it('does NOT render SessionGrid in empty state', () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'SessionGrid' }).exists()).toBe(false);
    wrapper.unmount();
  });

  it('does NOT render compact upload strip in empty state', () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    expect(wrapper.find('.landing__upload-strip').exists()).toBe(false);
    wrapper.unmount();
  });

  it('adds .no-body-grid to document.body in empty state', async () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    await flushPromises();
    expect(document.body.classList.contains('no-body-grid')).toBe(true);
    wrapper.unmount();
  });
});

describe('LandingPage — populated state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('renders .landing container when sessions exist', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    expect(wrapper.find('.landing').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does NOT render .landing-empty when sessions exist', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    expect(wrapper.find('.landing-empty').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders SessionToolbar in populated state', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'SessionToolbar' }).exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders SessionGrid in populated state', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'SessionGrid' }).exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders compact upload strip in populated state', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    expect(wrapper.find('.landing__upload-strip').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does NOT add .no-body-grid to body in populated state', async () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    await flushPromises();
    expect(document.body.classList.contains('no-body-grid')).toBe(false);
    wrapper.unmount();
  });

  it('removes .no-body-grid from body when unmounting in populated state', async () => {
    document.body.classList.add('no-body-grid');
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    await flushPromises();
    wrapper.unmount();
    expect(document.body.classList.contains('no-body-grid')).toBe(false);
  });
});

describe('LandingPage — toolbar wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('passes searchQuery to SessionToolbar', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions, searchQuery: 'test-query' });
    const wrapper = mountPage();
    const toolbar = wrapper.findComponent({ name: 'SessionToolbar' });
    expect(toolbar.props('searchQuery')).toBe('test-query');
    wrapper.unmount();
  });

  it('passes activeFilter to SessionToolbar', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions, activeFilter: 'ready' });
    const wrapper = mountPage();
    const toolbar = wrapper.findComponent({ name: 'SessionToolbar' });
    expect(toolbar.props('activeFilter')).toBe('ready');
    wrapper.unmount();
  });

  it('passes sessionCount to SessionToolbar', () => {
    const sessions = [makeSession('1'), makeSession('2')];
    setupMocks({ sessions, filteredSessions: sessions });
    const wrapper = mountPage();
    const toolbar = wrapper.findComponent({ name: 'SessionToolbar' });
    expect(toolbar.props('sessionCount')).toBe(2);
    wrapper.unmount();
  });

  it('passes filteredCount to SessionToolbar', () => {
    const sessions = [makeSession('1'), makeSession('2'), makeSession('3')];
    const filteredSessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions });
    const wrapper = mountPage();
    const toolbar = wrapper.findComponent({ name: 'SessionToolbar' });
    expect(toolbar.props('filteredCount')).toBe(1);
    wrapper.unmount();
  });
});

describe('LandingPage — SessionGrid wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('passes filteredSessions to SessionGrid', () => {
    const sessions = [makeSession('1'), makeSession('2')];
    const filteredSessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions });
    const wrapper = mountPage();
    const grid = wrapper.findComponent({ name: 'SessionGrid' });
    expect(grid.props('sessions')).toEqual(filteredSessions);
    wrapper.unmount();
  });

  it('passes loading to SessionGrid', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions, loading: true });
    const wrapper = mountPage();
    const grid = wrapper.findComponent({ name: 'SessionGrid' });
    expect(grid.props('loading')).toBe(true);
    wrapper.unmount();
  });

  it('passes connectionStates to SessionGrid', () => {
    const sessions = [makeSession('p1', { detection_status: 'processing' })];
    const connectionStates = new Map([['p1', 'connecting' as const]]);
    setupMocks({ sessions, filteredSessions: sessions, connectionStates });
    const wrapper = mountPage();
    const grid = wrapper.findComponent({ name: 'SessionGrid' });
    expect(grid.props('connectionStates')).toStrictEqual(connectionStates);
    wrapper.unmount();
  });
});

describe('LandingPage — clear-filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('resets searchQuery and activeFilter when SessionGrid emits clear-filters', async () => {
    const sessions = [makeSession('1')];
    const { searchQueryRef, activeFilterRef } = setupMocks({
      sessions,
      filteredSessions: sessions,
      searchQuery: 'some-query',
      activeFilter: 'ready',
    });
    const wrapper = mountPage();
    const grid = wrapper.findComponent({ name: 'SessionGrid' });
    await grid.vm.$emit('clear-filters');
    expect(searchQueryRef.value).toBe('');
    expect(activeFilterRef.value).toBe('all');
    wrapper.unmount();
  });
});

describe('LandingPage — skeleton loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('shows SessionGrid with loading=true during initial load when sessions are loading', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions, loading: true });
    const wrapper = mountPage();
    const grid = wrapper.findComponent({ name: 'SessionGrid' });
    expect(grid.props('loading')).toBe(true);
    wrapper.unmount();
  });
});

describe('LandingPage — body class management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.classList.remove('no-body-grid');
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('removes .no-body-grid when component is unmounted', async () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    await flushPromises();
    expect(document.body.classList.contains('no-body-grid')).toBe(true);
    wrapper.unmount();
    expect(document.body.classList.contains('no-body-grid')).toBe(false);
  });
});

describe('LandingPage — toast wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('calls addToast with title and message on upload success', () => {
    const sessions = [] as Session[];
    const { addToastMock } = setupMocks({ sessions, filteredSessions: sessions });
    // Capture the onSuccess callback passed to useUpload
    let capturedOnSuccess: (() => void) | undefined;
    vi.mocked(useUpload).mockImplementation((onSuccess) => {
      capturedOnSuccess = onSuccess;
      return {
        uploading: ref(false),
        error: ref(null),
        isDragging: ref(false),
        uploadFile: vi.fn().mockResolvedValue(undefined),
        handleDrop: vi.fn(),
        handleDragOver: vi.fn(),
        handleDragLeave: vi.fn(),
        handleFileInput: vi.fn(),
        clearError: vi.fn(),
      };
    });

    mountPage();
    capturedOnSuccess?.();

    expect(addToastMock).toHaveBeenCalledWith(
      expect.any(String),
      'success',
      'Session uploaded',
    );
  });

  it('renders ToastContainer', () => {
    setupMocks({ sessions: [], loading: false });
    const wrapper = mountPage();
    expect(wrapper.findComponent({ name: 'ToastContainer' }).exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('LandingPage — drag state on upload strip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.classList.remove('no-body-grid');
  });

  it('applies drag class to upload strip when isDragging is true', () => {
    const sessions = [makeSession('1')];
    setupMocks({ sessions, filteredSessions: sessions, isDragging: true });
    const wrapper = mountPage();
    const strip = wrapper.find('.landing__upload-strip');
    expect(strip.classes()).toContain('landing__upload-strip--drag');
    wrapper.unmount();
  });
});

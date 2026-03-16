/**
 * Tests for SidebarPanel component — Stage 6 full implementation.
 *
 * Covers: skeleton loading, search input, filter pills, session list,
 * empty state, "+ New Session" button, SessionCard integration, safe inject guard,
 * drag handling including multiple-file drop.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { provide, defineComponent, ref, computed } from 'vue';
import type { Session } from '../../shared/types/session.js';
import SidebarPanel from './SidebarPanel.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import { layoutKey } from '../composables/useLayout.js';
import type { LayoutState } from '../composables/useLayout.js';

const { mockUploadFileWithOptimistic } = vi.hoisted(() => ({
  mockUploadFileWithOptimistic: vi.fn(),
}));

vi.mock('../composables/useUpload.js', () => ({
  useUpload: () => ({
    uploadFileWithOptimistic: mockUploadFileWithOptimistic,
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
  const searchQuery = ref(overrides.searchQuery?.value ?? '');
  const statusFilter = ref(overrides.statusFilter?.value ?? 'all' as const);
  const loading = ref(overrides.loading?.value ?? false);
  const error = ref<string | null>(overrides.error?.value ?? null);
  const filteredSessions = computed(() => sessions.value);
  return {
    sessions,
    loading,
    error,
    searchQuery,
    statusFilter,
    filteredSessions,
    fetchSessions: vi.fn(),
    deleteSession: vi.fn(),
    refreshOnSessionComplete: vi.fn(),
    ...overrides,
  };
}

function makeLayoutState(isMobile: boolean): { layout: LayoutState; closeMobileOverlay: ReturnType<typeof vi.fn> } {
  const closeMobileOverlay = vi.fn();
  const layout: LayoutState = {
    isSidebarOpen: ref(true),
    isMobile: ref(isMobile),
    isMobileOverlayOpen: ref(true),
    openMobileOverlay: vi.fn(),
    closeMobileOverlay,
    toggleSidebar: vi.fn(),
  };
  return { layout, closeMobileOverlay };
}

/** Mounts SidebarPanel with an injected session list state and a test router. */
async function mountWithState(state: SessionListState, layoutState?: LayoutState) {
  const router = createTestRouter();
  await router.push('/');
  const Wrapper = defineComponent({
    components: { SidebarPanel },
    setup() {
      provide(sessionListKey, state);
      if (layoutState) {
        provide(layoutKey, layoutState);
      }
      return {};
    },
    template: '<SidebarPanel />',
  });
  return mount(Wrapper, { global: { plugins: [router] } });
}

describe('SidebarPanel', () => {
  describe('sidebar grid area', () => {
    it('renders inside the sidebar grid area element', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.spatial-shell__sidebar').exists()).toBe(true);
    });
  });

  describe('skeleton loading', () => {
    it('shows skeleton while loading is true', async () => {
      const state = makeSessionListState({ loading: ref(true) });
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.skeleton-sidebar').exists()).toBe(true);
    });

    it('hides skeleton when loading is false', async () => {
      const state = makeSessionListState({ loading: ref(false) });
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.skeleton-sidebar').exists()).toBe(false);
    });
  });

  describe('search input', () => {
    it('renders a search input with correct placeholder', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const input = wrapper.find('.sidebar__search-input');
      expect(input.exists()).toBe(true);
      expect((input.element as HTMLInputElement).placeholder).toBe('Filter sessions...');
    });

    it('updates searchQuery when user types in search input', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const input = wrapper.find('.sidebar__search-input');
      await input.setValue('my query');
      expect(state.searchQuery.value).toBe('my query');
    });
  });

  describe('filter pills', () => {
    it('renders filter pills group with role="group"', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const group = wrapper.find('[role="group"]');
      expect(group.exists()).toBe(true);
    });

    it('renders four filter pills: All, Processing, Ready, Failed', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const pills = wrapper.findAll('[aria-pressed]');
      const labels = pills.map(p => p.text());
      expect(labels).toContain('All');
      expect(labels).toContain('Processing');
      expect(labels).toContain('Ready');
      expect(labels).toContain('Failed');
    });

    it('marks the "All" pill as pressed when statusFilter is "all"', async () => {
      const state = makeSessionListState({ statusFilter: ref('all') });
      const wrapper = await mountWithState(state);
      const allPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'All');
      expect(allPill?.attributes('aria-pressed')).toBe('true');
    });

    it('marks the "Ready" pill as pressed when statusFilter is "ready"', async () => {
      const state = makeSessionListState({ statusFilter: ref('ready') });
      const wrapper = await mountWithState(state);
      const readyPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'Ready');
      expect(readyPill?.attributes('aria-pressed')).toBe('true');
    });

    it('updates statusFilter when a pill is clicked', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const processingPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'Processing');
      await processingPill?.trigger('click');
      expect(state.statusFilter.value).toBe('processing');
    });

    it('resets statusFilter to "all" when "All" pill is clicked', async () => {
      const state = makeSessionListState({ statusFilter: ref('ready') });
      const wrapper = await mountWithState(state);
      const allPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'All');
      await allPill?.trigger('click');
      expect(state.statusFilter.value).toBe('all');
    });
  });

  describe('session list', () => {
    it('renders a <ul> for sessions when sessions exist', async () => {
      const sessions = [makeSession({ id: '1', filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = await mountWithState(state);
      const list = wrapper.find('ul.sidebar__session-list');
      expect(list.exists()).toBe(true);
    });

    it('renders a <li> for each filtered session', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'alpha.cast' }),
        makeSession({ id: '2', filename: 'beta.cast' }),
      ];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = await mountWithState(state);
      const items = wrapper.findAll('li.sidebar__session-item');
      expect(items).toHaveLength(2);
    });

    it('shows session filename in each list item', async () => {
      const sessions = [makeSession({ filename: 'my-recording.cast' })];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = await mountWithState(state);
      expect(wrapper.text()).toContain('my-recording.cast');
    });

    it('renders SessionCard components for each session', async () => {
      const sessions = [
        makeSession({ id: '1', filename: 'alpha.cast' }),
        makeSession({ id: '2', filename: 'beta.cast' }),
      ];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = await mountWithState(state);
      const cards = wrapper.findAll('.session-card');
      expect(cards).toHaveLength(2);
    });

    it('marks the session matching the current route as selected', async () => {
      const sessions = [
        makeSession({ id: 'sel-1', filename: 'selected.cast' }),
        makeSession({ id: 'other', filename: 'other.cast' }),
      ];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const router = createTestRouter();
      await router.push('/session/sel-1');
      const Wrapper = defineComponent({
        components: { SidebarPanel },
        setup() {
          provide(sessionListKey, state);
          return {};
        },
        template: '<SidebarPanel />',
      });
      const wrapper = mount(Wrapper, { global: { plugins: [router] } });
      const selectedCards = wrapper.findAll('.session-card--selected');
      expect(selectedCards).toHaveLength(1);
    });
  });

  describe('empty state', () => {
    it('shows empty state when filteredSessions is empty and sessions exist', async () => {
      const allSessions = [makeSession({ filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(allSessions),
        filteredSessions: computed(() => []),
        searchQuery: ref('zzz-no-match'),
      });
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.sidebar__empty-state').exists()).toBe(true);
    });

    it('shows empty state with clear-filters action when filters are active', async () => {
      const allSessions = [makeSession({ filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(allSessions),
        filteredSessions: computed(() => []),
        searchQuery: ref('no-match'),
      });
      const wrapper = await mountWithState(state);
      const clearBtn = wrapper.find('.sidebar__empty-state button');
      expect(clearBtn.exists()).toBe(true);
    });

    it('clears filters when clear-filters button is clicked', async () => {
      const allSessions = [makeSession({ filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(allSessions),
        filteredSessions: computed(() => []),
        searchQuery: ref('no-match'),
        statusFilter: ref('ready'),
      });
      const wrapper = await mountWithState(state);
      const clearBtn = wrapper.find('.sidebar__empty-state button');
      await clearBtn.trigger('click');
      expect(state.searchQuery.value).toBe('');
      expect(state.statusFilter.value).toBe('all');
    });

    it('does not show empty state when there are no sessions at all', async () => {
      const state = makeSessionListState({
        sessions: ref([]),
        filteredSessions: computed(() => []),
      });
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.sidebar__empty-state').exists()).toBe(false);
    });
  });

  describe('+ New Session button', () => {
    it('renders a "+ New Session" button', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.sidebar__new-session-btn').exists()).toBe(true);
    });

    it('renders a hidden file input accepting .cast files', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const fileInput = wrapper.find('input[type="file"][accept=".cast"]');
      expect(fileInput.exists()).toBe(true);
    });
  });

  describe('inject guard', () => {
    it('throws a clear error when sessionListKey is not provided', async () => {
      const router = createTestRouter();
      await router.push('/');
      // Mount without any provider — inject will return undefined.
      expect(() => mount(SidebarPanel, { global: { plugins: [router] } })).toThrow();
    });
  });

  describe('drag handling', () => {
    it('shows drop zone when dragenter fires on the sidebar', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.sidebar__drop-zone').exists()).toBe(true);
    });

    it('hides session list when drop zone is visible', async () => {
      const sessions = [makeSession({ id: '1', filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.sidebar__list-region').attributes('style')).toContain('display: none');
    });

    it('hides drop zone after dragleave when counter reaches zero', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.sidebar__drop-zone').exists()).toBe(true);
      await sidebar.trigger('dragleave');
      expect(wrapper.find('.sidebar__drop-zone').attributes('style')).toContain('display: none');
    });

    it('hides drop zone after drop event', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.sidebar__drop-zone').exists()).toBe(true);
      await sidebar.trigger('drop', { dataTransfer: { files: [] } });
      expect(wrapper.find('.sidebar__drop-zone').attributes('style')).toContain('display: none');
    });

    it('changes footer button text to "or browse files" during drag', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      const btn = wrapper.find('.sidebar__new-session-btn');
      expect(btn.text()).toBe('or browse files');
    });

    it('footer button shows "+ New Session" when not dragging', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const btn = wrapper.find('.sidebar__new-session-btn');
      expect(btn.text()).toBe('+ New Session');
    });

    it('applies sidebar__dimmed to search wrap during drag', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.sidebar__search-wrap').classes()).toContain('sidebar__dimmed');
    });

    it('applies sidebar__dimmed to filter pills during drag', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.sidebar__filters').classes()).toContain('sidebar__dimmed');
    });

    it('drop zone has correct aria-label', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      const dropZone = wrapper.find('.sidebar__drop-zone');
      expect(dropZone.attributes('aria-label')).toBe('Drop .cast file to upload');
    });

    it('drop zone contains upload-zone title and subtitle', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      await sidebar.trigger('dragenter');
      expect(wrapper.find('.upload-zone__title').text()).toBe('Release to upload');
      expect(wrapper.find('.upload-zone__subtitle').text()).toBe('File will be processed automatically');
    });

    it('calls uploadFileWithOptimistic for each file when multiple files are dropped', async () => {
      mockUploadFileWithOptimistic.mockClear();
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const sidebar = wrapper.find('.spatial-shell__sidebar');
      const file1 = new File(['content1'], 'session1.cast', { type: 'text/plain' });
      const file2 = new File(['content2'], 'session2.cast', { type: 'text/plain' });
      const dataTransfer = { files: [file1, file2] };
      await sidebar.trigger('drop', { dataTransfer });
      expect(mockUploadFileWithOptimistic).toHaveBeenCalledTimes(2);
      expect(mockUploadFileWithOptimistic).toHaveBeenNthCalledWith(1, file1, expect.any(Object));
      expect(mockUploadFileWithOptimistic).toHaveBeenNthCalledWith(2, file2, expect.any(Object));
    });

    it('file input has multiple attribute to allow selecting multiple files', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      const fileInput = wrapper.find('input[type="file"][accept=".cast"]');
      expect(fileInput.attributes('multiple')).toBeDefined();
    });
  });

  describe('mobile close button', () => {
    it('renders the mobile header when isMobile is true', async () => {
      const state = makeSessionListState();
      const { layout } = makeLayoutState(true);
      const wrapper = await mountWithState(state, layout);
      expect(wrapper.find('.sidebar__mobile-header').exists()).toBe(true);
    });

    it('does not render the mobile header when isMobile is false', async () => {
      const state = makeSessionListState();
      const { layout } = makeLayoutState(false);
      const wrapper = await mountWithState(state, layout);
      expect(wrapper.find('.sidebar__mobile-header').exists()).toBe(false);
    });

    it('does not render the mobile header when no layout is provided', async () => {
      const state = makeSessionListState();
      const wrapper = await mountWithState(state);
      expect(wrapper.find('.sidebar__mobile-header').exists()).toBe(false);
    });

    it('renders a close button inside the mobile header', async () => {
      const state = makeSessionListState();
      const { layout } = makeLayoutState(true);
      const wrapper = await mountWithState(state, layout);
      const header = wrapper.find('.sidebar__mobile-header');
      expect(header.find('button').exists()).toBe(true);
    });

    it('close button has aria-label="Close navigation"', async () => {
      const state = makeSessionListState();
      const { layout } = makeLayoutState(true);
      const wrapper = await mountWithState(state, layout);
      const header = wrapper.find('.sidebar__mobile-header');
      const btn = header.find('button');
      expect(btn.attributes('aria-label')).toBe('Close navigation');
    });

    it('close button has is-open class (always shows X state)', async () => {
      const state = makeSessionListState();
      const { layout } = makeLayoutState(true);
      const wrapper = await mountWithState(state, layout);
      const header = wrapper.find('.sidebar__mobile-header');
      const btn = header.find('button');
      expect(btn.classes()).toContain('is-open');
    });

    it('renders the brand name in the mobile header', async () => {
      const state = makeSessionListState();
      const { layout } = makeLayoutState(true);
      const wrapper = await mountWithState(state, layout);
      expect(wrapper.find('.sidebar__mobile-brand').text()).toBe('Erika');
    });

    it('clicking the close button calls closeMobileOverlay', async () => {
      const state = makeSessionListState();
      const { layout, closeMobileOverlay } = makeLayoutState(true);
      const wrapper = await mountWithState(state, layout);
      const header = wrapper.find('.sidebar__mobile-header');
      const btn = header.find('button');
      await btn.trigger('click');
      expect(closeMobileOverlay).toHaveBeenCalledOnce();
    });
  });
});

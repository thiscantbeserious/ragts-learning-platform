/**
 * Tests for SidebarPanel component — Stage 6 full implementation.
 *
 * Covers: skeleton loading, search input, filter pills, session list,
 * empty state, and "+ New Session" button.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { provide, defineComponent, ref, computed } from 'vue';
import type { Session } from '../../shared/types/session.js';
import SidebarPanel from './SidebarPanel.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';

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
    ...overrides,
  };
}

/** Mounts SidebarPanel with an injected session list state. */
function mountWithState(state: SessionListState) {
  const Wrapper = defineComponent({
    components: { SidebarPanel },
    setup() {
      provide(sessionListKey, state);
      return {};
    },
    template: '<SidebarPanel />',
  });
  return mount(Wrapper);
}

describe('SidebarPanel', () => {
  describe('sidebar grid area', () => {
    it('renders inside the sidebar grid area element', () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      expect(wrapper.find('.spatial-shell__sidebar').exists()).toBe(true);
    });
  });

  describe('skeleton loading', () => {
    it('shows skeleton while loading is true', () => {
      const state = makeSessionListState({ loading: ref(true) });
      const wrapper = mountWithState(state);
      expect(wrapper.find('.skeleton-sidebar').exists()).toBe(true);
    });

    it('hides skeleton when loading is false', () => {
      const state = makeSessionListState({ loading: ref(false) });
      const wrapper = mountWithState(state);
      expect(wrapper.find('.skeleton-sidebar').exists()).toBe(false);
    });
  });

  describe('search input', () => {
    it('renders a search input with correct placeholder', () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      const input = wrapper.find('.sidebar__search-input');
      expect(input.exists()).toBe(true);
      expect((input.element as HTMLInputElement).placeholder).toBe('Filter sessions...');
    });

    it('updates searchQuery when user types in search input', async () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      const input = wrapper.find('.sidebar__search-input');
      await input.setValue('my query');
      expect(state.searchQuery.value).toBe('my query');
    });
  });

  describe('filter pills', () => {
    it('renders filter pills group with role="group"', () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      const group = wrapper.find('[role="group"]');
      expect(group.exists()).toBe(true);
    });

    it('renders four filter pills: All, Processing, Ready, Failed', () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      const pills = wrapper.findAll('[aria-pressed]');
      const labels = pills.map(p => p.text());
      expect(labels).toContain('All');
      expect(labels).toContain('Processing');
      expect(labels).toContain('Ready');
      expect(labels).toContain('Failed');
    });

    it('marks the "All" pill as pressed when statusFilter is "all"', () => {
      const state = makeSessionListState({ statusFilter: ref('all') });
      const wrapper = mountWithState(state);
      const allPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'All');
      expect(allPill?.attributes('aria-pressed')).toBe('true');
    });

    it('marks the "Ready" pill as pressed when statusFilter is "ready"', () => {
      const state = makeSessionListState({ statusFilter: ref('ready') });
      const wrapper = mountWithState(state);
      const readyPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'Ready');
      expect(readyPill?.attributes('aria-pressed')).toBe('true');
    });

    it('updates statusFilter when a pill is clicked', async () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      const processingPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'Processing');
      await processingPill?.trigger('click');
      expect(state.statusFilter.value).toBe('processing');
    });

    it('resets statusFilter to "all" when "All" pill is clicked', async () => {
      const state = makeSessionListState({ statusFilter: ref('ready') });
      const wrapper = mountWithState(state);
      const allPill = wrapper.findAll('[aria-pressed]').find(p => p.text() === 'All');
      await allPill?.trigger('click');
      expect(state.statusFilter.value).toBe('all');
    });
  });

  describe('session list', () => {
    it('renders a <ul> with role="list" when sessions exist', () => {
      const sessions = [makeSession({ id: '1', filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = mountWithState(state);
      const list = wrapper.find('ul[role="list"]');
      expect(list.exists()).toBe(true);
    });

    it('renders a <li> with role="listitem" for each filtered session', () => {
      const sessions = [
        makeSession({ id: '1', filename: 'alpha.cast' }),
        makeSession({ id: '2', filename: 'beta.cast' }),
      ];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = mountWithState(state);
      const items = wrapper.findAll('li[role="listitem"]');
      expect(items).toHaveLength(2);
    });

    it('shows session filename in each list item', () => {
      const sessions = [makeSession({ filename: 'my-recording.cast' })];
      const state = makeSessionListState({
        sessions: ref(sessions),
        filteredSessions: computed(() => sessions),
      });
      const wrapper = mountWithState(state);
      expect(wrapper.text()).toContain('my-recording.cast');
    });
  });

  describe('empty state', () => {
    it('shows empty state when filteredSessions is empty and sessions exist', () => {
      const allSessions = [makeSession({ filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(allSessions),
        filteredSessions: computed(() => []),
        searchQuery: ref('zzz-no-match'),
      });
      const wrapper = mountWithState(state);
      expect(wrapper.find('.sidebar__empty-state').exists()).toBe(true);
    });

    it('shows empty state with clear-filters action when filters are active', async () => {
      const allSessions = [makeSession({ filename: 'alpha.cast' })];
      const state = makeSessionListState({
        sessions: ref(allSessions),
        filteredSessions: computed(() => []),
        searchQuery: ref('no-match'),
      });
      const wrapper = mountWithState(state);
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
      const wrapper = mountWithState(state);
      const clearBtn = wrapper.find('.sidebar__empty-state button');
      await clearBtn.trigger('click');
      expect(state.searchQuery.value).toBe('');
      expect(state.statusFilter.value).toBe('all');
    });

    it('does not show empty state when there are no sessions at all', () => {
      const state = makeSessionListState({
        sessions: ref([]),
        filteredSessions: computed(() => []),
      });
      const wrapper = mountWithState(state);
      expect(wrapper.find('.sidebar__empty-state').exists()).toBe(false);
    });
  });

  describe('+ New Session button', () => {
    it('renders a "+ New Session" button', () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      expect(wrapper.find('.sidebar__new-session-btn').exists()).toBe(true);
    });

    it('renders a hidden file input accepting .cast files', () => {
      const state = makeSessionListState();
      const wrapper = mountWithState(state);
      const fileInput = wrapper.find('input[type="file"][accept=".cast"]');
      expect(fileInput.exists()).toBe(true);
    });
  });
});

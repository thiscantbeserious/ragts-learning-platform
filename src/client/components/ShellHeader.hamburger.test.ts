/**
 * Tests for ShellHeader breadcrumb — Stage 9.
 *
 * Covers: breadcrumb hidden on home route, breadcrumb visible on session-detail
 * route, displays session filename from injected session list, falls back to
 * raw session ID when filename not found, separator rendered.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import ShellHeader from './ShellHeader.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import type { Session } from '../../shared/types/session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSessionListState(sessions: Session[] = []): SessionListState {
  const sessionsRef = ref(sessions);
  return {
    sessions: sessionsRef,
    loading: ref(false),
    error: ref(null),
    searchQuery: ref(''),
    statusFilter: ref('all'),
    filteredSessions: computed(() => sessionsRef.value),
    fetchSessions: async () => {},
    deleteSession: async () => false,
    refreshOnSessionComplete: async () => {},
  };
}

function makeSession(id: string, filename: string): Session {
  return { id, filename, detection_status: 'completed' } as Session;
}

function mountHeader(
  sessions: Session[] = [],
  routes?: Parameters<typeof createRouter>[0]['routes'],
) {
  const defaultRoutes = [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/session/:id', name: 'session-detail', component: { template: '<div/>' } },
  ];

  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes ?? defaultRoutes,
  });

  return { router, sessions };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShellHeader', () => {
  describe('home route', () => {
    it('renders without errors on home route', async () => {
      const { router } = mountHeader();
      await router.push('/');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState() },
        },
      });
      expect(wrapper.exists()).toBe(true);
    });

    it('does not render the breadcrumb on home route', async () => {
      const { router } = mountHeader();
      await router.push('/');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState() },
        },
      });
      expect(wrapper.find('.shell-header__breadcrumb').exists()).toBe(false);
    });
  });

  describe('session-detail route', () => {
    it('renders the breadcrumb on session-detail route', async () => {
      const { router } = mountHeader();
      await router.push('/session/abc');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState() },
        },
      });
      expect(wrapper.find('.shell-header__breadcrumb').exists()).toBe(true);
    });

    it('renders "Sessions" as the root breadcrumb label', async () => {
      const { router } = mountHeader();
      await router.push('/session/abc');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState() },
        },
      });
      expect(wrapper.text()).toContain('Sessions');
    });

    it('renders a separator between Sessions and the filename', async () => {
      const sessions = [makeSession('abc', 'my-session.cast')];
      const { router } = mountHeader();
      await router.push('/session/abc');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState(sessions) },
        },
      });
      expect(wrapper.find('.shell-header__breadcrumb-sep').exists()).toBe(true);
    });

    it('displays the session filename when found in session list', async () => {
      const sessions = [makeSession('abc', 'my-session.cast')];
      const { router } = mountHeader();
      await router.push('/session/abc');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState(sessions) },
        },
      });
      expect(wrapper.find('.shell-header__breadcrumb-current').text()).toBe('my-session.cast');
    });

    it('falls back to session ID when filename not found in session list', async () => {
      const { router } = mountHeader();
      await router.push('/session/unknown-id');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState([]) },
        },
      });
      expect(wrapper.find('.shell-header__breadcrumb-current').text()).toBe('unknown-id');
    });

    it('updates breadcrumb when session id changes', async () => {
      const sessions = [
        makeSession('sess-1', 'first.cast'),
        makeSession('sess-2', 'second.cast'),
      ];
      const { router } = mountHeader();
      await router.push('/session/sess-1');
      const wrapper = mount(ShellHeader, {
        global: {
          plugins: [router],
          provide: { [sessionListKey as symbol]: mockSessionListState(sessions) },
        },
      });

      expect(wrapper.find('.shell-header__breadcrumb-current').text()).toBe('first.cast');

      await router.push('/session/sess-2');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.shell-header__breadcrumb-current').text()).toBe('second.cast');
    });
  });

  describe('without session list injection', () => {
    it('falls back gracefully to raw session ID when no session list provided', async () => {
      const { router } = mountHeader();
      await router.push('/session/sess-xyz');
      const wrapper = mount(ShellHeader, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.shell-header__breadcrumb-current').text()).toBe('sess-xyz');
    });
  });
});

/**
 * Tests for ShellHeader breadcrumb behavior — Stage 9.
 *
 * Covers: no breadcrumb on home route, breadcrumb shown on session detail route,
 * "Sessions" links back to "/", filename is displayed, separator is rendered,
 * and correct token-based CSS classes are used.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ref, computed } from 'vue';
import ShellHeader from './ShellHeader.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import type { Session } from '../../shared/types/session.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'demo.cast',
    filepath: '/data/sessions/demo.cast',
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    detection_status: 'completed',
    ...overrides,
  };
}

function makeSessionListState(sessions: Session[] = []): SessionListState {
  const sessionsRef = ref(sessions);
  return {
    sessions: sessionsRef,
    loading: ref(false),
    error: ref(null),
    searchQuery: ref(''),
    statusFilter: ref('all'),
    filteredSessions: computed(() => sessionsRef.value),
    fetchSessions: async () => {},
    deleteSession: async () => true,
    refreshOnSessionComplete: async () => {},
  };
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
    ],
  });
}

async function mountHeader(path: string, sessions: Session[] = []) {
  const router = createTestRouter();
  await router.push(path);
  return mount(ShellHeader, {
    global: {
      plugins: [router],
      provide: {
        [sessionListKey as symbol]: makeSessionListState(sessions),
      },
    },
  });
}

describe('ShellHeader breadcrumb', () => {
  describe('home route', () => {
    it('does not render breadcrumb on home route', async () => {
      const wrapper = await mountHeader('/');
      expect(wrapper.find('.shell-header__breadcrumb').exists()).toBe(false);
    });
  });

  describe('session detail route', () => {
    it('renders breadcrumb on session detail route', async () => {
      const session = makeSession({ id: 'sess-1', filename: 'demo.cast' });
      const wrapper = await mountHeader('/session/sess-1', [session]);
      expect(wrapper.find('.shell-header__breadcrumb').exists()).toBe(true);
    });

    it('renders "Sessions" as a link to "/"', async () => {
      const session = makeSession({ id: 'sess-1', filename: 'demo.cast' });
      const wrapper = await mountHeader('/session/sess-1', [session]);
      const link = wrapper.find('.shell-header__breadcrumb-home');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe('/');
    });

    it('renders the session filename as current breadcrumb segment', async () => {
      const session = makeSession({ id: 'sess-1', filename: 'my-session.cast' });
      const wrapper = await mountHeader('/session/sess-1', [session]);
      const current = wrapper.find('.shell-header__breadcrumb-current');
      expect(current.exists()).toBe(true);
      expect(current.text()).toContain('my-session.cast');
    });

    it('renders a separator between home and current', async () => {
      const session = makeSession({ id: 'sess-1', filename: 'demo.cast' });
      const wrapper = await mountHeader('/session/sess-1', [session]);
      expect(wrapper.find('.shell-header__breadcrumb-sep').exists()).toBe(true);
    });

    it('shows raw session ID when session is not in list', async () => {
      const wrapper = await mountHeader('/session/unknown-id', []);
      const current = wrapper.find('.shell-header__breadcrumb-current');
      expect(current.exists()).toBe(true);
      expect(current.text()).toContain('unknown-id');
    });

    it('breadcrumb is a nav element for landmark semantics', async () => {
      const session = makeSession({ id: 'sess-1', filename: 'demo.cast' });
      const wrapper = await mountHeader('/session/sess-1', [session]);
      expect(wrapper.find('nav.shell-header__breadcrumb').exists()).toBe(true);
    });
  });
});

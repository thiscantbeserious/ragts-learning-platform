/**
 * Tests for ShellHeader hamburger button — hex gate icon.
 *
 * Covers: hex gate rendered on mobile, toggling open/close state,
 * aria-expanded binding, toggle semantics, desktop hidden.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import ShellHeader from './ShellHeader.vue';
import { layoutKey } from '../composables/useLayout.js';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import type { Session } from '../../shared/types/session.js';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
    ],
  });
}

function makeLayoutState(isMobile: boolean, isMobileOverlayOpen = false) {
  const openMobileOverlay = vi.fn();
  const closeMobileOverlay = vi.fn();
  return {
    isSidebarOpen: ref(true),
    isMobile: ref(isMobile),
    isMobileOverlayOpen: ref(isMobileOverlayOpen),
    openMobileOverlay,
    closeMobileOverlay,
    toggleSidebar: vi.fn(),
  };
}

function makeSessionListState(): SessionListState {
  const sessions = ref<Session[]>([]);
  return {
    sessions,
    loading: ref(false),
    error: ref(null),
    searchQuery: ref(''),
    statusFilter: ref('all' as const),
    filteredSessions: computed(() => sessions.value),
    fetchSessions: async () => {},
    deleteSession: async () => false,
  };
}

async function mountHeader(isMobile: boolean, isMobileOverlayOpen = false, path = '/') {
  const router = createTestRouter();
  await router.push(path);
  const layout = makeLayoutState(isMobile, isMobileOverlayOpen);
  const sessionList = makeSessionListState();

  const wrapper = mount(ShellHeader, {
    global: {
      plugins: [router],
      provide: {
        [layoutKey as symbol]: layout,
        [sessionListKey as symbol]: sessionList,
      },
    },
  });

  return { wrapper, layout };
}

describe('ShellHeader — hex gate hamburger button', () => {
  describe('on mobile viewport', () => {
    it('renders the hamburger button when isMobile is true', async () => {
      const { wrapper } = await mountHeader(true);
      expect(wrapper.find('.shell-header__hamburger').exists()).toBe(true);
    });

    it('hamburger button has an aria-label for accessibility', async () => {
      const { wrapper } = await mountHeader(true);
      const btn = wrapper.find('.shell-header__hamburger');
      expect(btn.attributes('aria-label')).toBeTruthy();
    });

    it('hamburger has type="button" to prevent form submission', async () => {
      const { wrapper } = await mountHeader(true);
      const btn = wrapper.find('.shell-header__hamburger');
      expect(btn.attributes('type')).toBe('button');
    });

    it('renders hex gate box container', async () => {
      const { wrapper } = await mountHeader(true);
      expect(wrapper.find('.hex-gate-icon__box').exists()).toBe(true);
    });

    it('renders hex gate inner container', async () => {
      const { wrapper } = await mountHeader(true);
      expect(wrapper.find('.hex-gate-icon__inner').exists()).toBe(true);
    });

    it('renders exactly 5 hex segments', async () => {
      const { wrapper } = await mountHeader(true);
      const segs = wrapper.findAll('.hex-gate-icon__seg');
      expect(segs).toHaveLength(5);
    });

    it('renders each of the 5 numbered segment modifier classes', async () => {
      const { wrapper } = await mountHeader(true);
      for (let i = 1; i <= 5; i++) {
        expect(wrapper.find(`.hex-gate-icon__seg--${i}`).exists()).toBe(true);
      }
    });

    it('hex segments have aria-hidden="true"', async () => {
      const { wrapper } = await mountHeader(true);
      const inner = wrapper.find('.hex-gate-icon__inner');
      expect(inner.attributes('aria-hidden')).toBe('true');
    });

    it('has aria-expanded="false" when overlay is closed', async () => {
      const { wrapper } = await mountHeader(true, false);
      const btn = wrapper.find('.shell-header__hamburger');
      expect(btn.attributes('aria-expanded')).toBe('false');
    });

    it('has aria-expanded="true" when overlay is open', async () => {
      const { wrapper } = await mountHeader(true, true);
      const btn = wrapper.find('.shell-header__hamburger');
      expect(btn.attributes('aria-expanded')).toBe('true');
    });

    it('adds is-open class to button when overlay is open', async () => {
      const { wrapper } = await mountHeader(true, true);
      const btn = wrapper.find('.shell-header__hamburger');
      expect(btn.classes()).toContain('is-open');
    });

    it('does not have is-open class when overlay is closed', async () => {
      const { wrapper } = await mountHeader(true, false);
      const btn = wrapper.find('.shell-header__hamburger');
      expect(btn.classes()).not.toContain('is-open');
    });

    it('clicking when closed calls openMobileOverlay', async () => {
      const { wrapper, layout } = await mountHeader(true, false);
      await wrapper.find('.shell-header__hamburger').trigger('click');
      expect(layout.openMobileOverlay).toHaveBeenCalledOnce();
      expect(layout.closeMobileOverlay).not.toHaveBeenCalled();
    });

    it('clicking when open calls closeMobileOverlay', async () => {
      const { wrapper, layout } = await mountHeader(true, true);
      await wrapper.find('.shell-header__hamburger').trigger('click');
      expect(layout.closeMobileOverlay).toHaveBeenCalledOnce();
      expect(layout.openMobileOverlay).not.toHaveBeenCalled();
    });

    it('does not render old hamburger-bar spans', async () => {
      const { wrapper } = await mountHeader(true);
      expect(wrapper.find('.shell-header__hamburger-bar').exists()).toBe(false);
    });

    it('does not render old hamburger-icon wrapper', async () => {
      const { wrapper } = await mountHeader(true);
      expect(wrapper.find('.shell-header__hamburger-icon').exists()).toBe(false);
    });
  });

  describe('on desktop viewport', () => {
    it('does not render the hamburger button when isMobile is false', async () => {
      const { wrapper } = await mountHeader(false);
      expect(wrapper.find('.shell-header__hamburger').exists()).toBe(false);
    });
  });
});

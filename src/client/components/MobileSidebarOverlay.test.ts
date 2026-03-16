/**
 * Tests for MobileSidebarOverlay component — Stage 13.
 *
 * Covers: open/closed state via CSS class, backdrop element present, aria-modal attribute,
 * Escape key closes overlay, backdrop click closes overlay, animation class applied when open.
 *
 * Note: The component uses <Teleport to="body">, so rendered elements appear in
 * document.body. Tests use document.querySelector instead of wrapper.find()
 * for elements inside the Teleport.
 *
 * Animation strategy: always in DOM, open state toggled via
 * .mobile-sidebar-overlay__root--open class (no v-if / Vue Transition).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import MobileSidebarOverlay from './MobileSidebarOverlay.vue';
import { layoutKey } from '../composables/useLayout.js';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import type { Session } from '../../shared/types/session.js';

vi.mock('../composables/useUpload.js', () => ({
  useUpload: () => ({
    uploadFileWithOptimistic: vi.fn(),
    uploading: ref(false),
    error: ref(null),
    isDragging: ref(false),
  }),
}));

vi.mock('./SessionCard.vue', () => ({
  default: {
    name: 'SessionCard',
    props: ['session', 'isSelected'],
    template: '<div class="session-card-stub" />',
  },
}));

vi.mock('./OverlayScrollbar.vue', () => ({
  default: {
    name: 'OverlayScrollbar',
    template: '<div><slot /></div>',
  },
}));

vi.mock('./SkeletonSidebar.vue', () => ({
  default: {
    name: 'SkeletonSidebar',
    template: '<div class="skeleton-sidebar-stub" />',
  },
}));

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
    ],
  });
}

function makeLayoutState(overrides: Partial<{
  isMobileOverlayOpen: boolean;
  isSidebarOpen: boolean;
  isMobile: boolean;
}> = {}) {
  const isMobileOverlayOpen = ref(overrides.isMobileOverlayOpen ?? false);
  const isSidebarOpen = ref(overrides.isSidebarOpen ?? true);
  const isMobile = ref(overrides.isMobile ?? true);
  const closeMobileOverlay = vi.fn(() => { isMobileOverlayOpen.value = false; });
  const openMobileOverlay = vi.fn(() => { isMobileOverlayOpen.value = true; });
  const toggleSidebar = vi.fn();

  return {
    isMobileOverlayOpen,
    isSidebarOpen,
    isMobile,
    closeMobileOverlay,
    openMobileOverlay,
    toggleSidebar,
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
    refreshOnSessionComplete: async () => {},
  };
}

async function mountOverlay(layoutOverrides: Parameters<typeof makeLayoutState>[0] = {}) {
  const router = createTestRouter();
  await router.push('/');
  const layout = makeLayoutState(layoutOverrides);
  const sessionList = makeSessionListState();

  const wrapper = mount(MobileSidebarOverlay, {
    attachTo: document.body,
    global: {
      plugins: [router],
      provide: {
        [layoutKey as symbol]: layout,
        [sessionListKey as symbol]: sessionList,
      },
    },
  });

  return { wrapper, layout, sessionList, router };
}

/** Query element from document.body (needed for Teleport). */
function q(selector: string): Element | null {
  return document.querySelector(selector);
}

afterEach(() => {
  // Clean up any Teleport-appended elements after each test.
  document.querySelectorAll('.mobile-sidebar-overlay__root').forEach(el => el.remove());
  document.querySelectorAll('.mobile-sidebar-overlay__backdrop').forEach(el => el.remove());
  document.querySelectorAll('.mobile-sidebar-overlay__panel').forEach(el => el.remove());
});

describe('MobileSidebarOverlay', () => {
  describe('when overlay is closed', () => {
    it('renders the root element in the DOM (always-in-DOM approach)', async () => {
      await mountOverlay({ isMobileOverlayOpen: false });
      expect(q('.mobile-sidebar-overlay__root')).not.toBeNull();
    });

    it('does not have the open class when closed', async () => {
      await mountOverlay({ isMobileOverlayOpen: false });
      const root = q('.mobile-sidebar-overlay__root');
      expect(root?.classList.contains('mobile-sidebar-overlay__root--open')).toBe(false);
    });
  });

  describe('when overlay is open', () => {
    it('renders the overlay panel', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      expect(q('.mobile-sidebar-overlay__panel')).not.toBeNull();
    });

    it('renders a backdrop element', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      expect(q('.mobile-sidebar-overlay__backdrop')).not.toBeNull();
    });

    it('has aria-modal="true" on the panel', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const panel = q('.mobile-sidebar-overlay__panel');
      expect(panel?.getAttribute('aria-modal')).toBe('true');
    });

    it('has role="dialog" on the panel', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const panel = q('.mobile-sidebar-overlay__panel');
      expect(panel?.getAttribute('role')).toBe('dialog');
    });

    it('has an accessible label on the panel', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const panel = q('.mobile-sidebar-overlay__panel');
      expect(panel?.getAttribute('aria-label')).toBeTruthy();
    });

    it('renders the sidebar panel content inside the overlay', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      // The inner wrapper class confirming SidebarPanel is rendered inside.
      expect(q('.mobile-sidebar-overlay')).not.toBeNull();
    });

    it('has the open modifier class when open', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const root = q('.mobile-sidebar-overlay__root');
      expect(root?.classList.contains('mobile-sidebar-overlay__root--open')).toBe(true);
    });
  });

  describe('Escape key', () => {
    it('calls closeMobileOverlay when Escape is pressed while open', async () => {
      const { layout } = await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const panel = q('.mobile-sidebar-overlay__panel') as HTMLElement | null;
      panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(layout.closeMobileOverlay).toHaveBeenCalledOnce();
    });
  });

  describe('backdrop click', () => {
    it('calls closeMobileOverlay when backdrop is clicked', async () => {
      const { layout } = await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const backdrop = q('.mobile-sidebar-overlay__backdrop') as HTMLElement | null;
      backdrop?.click();
      expect(layout.closeMobileOverlay).toHaveBeenCalledOnce();
    });
  });

  describe('animation class', () => {
    it('applies the open modifier class when overlay is open', async () => {
      await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      const root = q('.mobile-sidebar-overlay__root');
      expect(root?.classList.contains('mobile-sidebar-overlay__root--open')).toBe(true);
    });

    it('removes the open modifier class when overlay is closed', async () => {
      const { layout } = await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      layout.isMobileOverlayOpen.value = false;
      await nextTick();
      const root = q('.mobile-sidebar-overlay__root');
      expect(root?.classList.contains('mobile-sidebar-overlay__root--open')).toBe(false);
    });
  });

  describe('route navigation closes overlay', () => {
    it('calls closeMobileOverlay when route changes while overlay is open', async () => {
      const { layout, router } = await mountOverlay({ isMobileOverlayOpen: true });
      await nextTick();
      await router.push('/session/test-id');
      await nextTick();
      expect(layout.closeMobileOverlay).toHaveBeenCalled();
    });
  });
});

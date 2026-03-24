/**
 * Branch coverage tests for MobileSidebarOverlay — uncovered focus trap branches.
 *
 * Lines targeted:
 *   51  — inject guard throw (layoutKey not provided)
 *   88-94 — trapFocus: active === panelRef (panel itself focused — Tab goes to first/last)
 *   98-99 — trapFocus: isShift && active === first → last?.focus()
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

vi.mock('./SidebarPanel.vue', () => ({
  default: {
    name: 'SidebarPanel',
    template: '<div class="sidebar-panel-stub" />',
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

function makeLayoutState(overlayOpen = false) {
  const isMobileOverlayOpen = ref(overlayOpen);
  const isSidebarOpen = ref(true);
  const isMobile = ref(true);
  const closeMobileOverlay = vi.fn(() => {
    isMobileOverlayOpen.value = false;
  });
  const openMobileOverlay = vi.fn(() => {
    isMobileOverlayOpen.value = true;
  });
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

async function mountOverlay(overlayOpen = false) {
  const router = createTestRouter();
  await router.push('/');
  const layout = makeLayoutState(overlayOpen);
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

afterEach(() => {
  document.querySelectorAll('.mobile-sidebar-overlay__root').forEach((el) => el.remove());
  document.documentElement.style.overflow = '';
});

describe('MobileSidebarOverlay — inject guard throw (line 51)', () => {
  it('throws when layoutKey is not provided', () => {
    const router = createTestRouter();
    expect(() =>
      mount(MobileSidebarOverlay, {
        global: {
          plugins: [router],
          provide: {
            [sessionListKey as symbol]: makeSessionListState(),
          },
        },
      }),
    ).toThrow('MobileSidebarOverlay: layoutKey not provided');
  });
});

describe('MobileSidebarOverlay — focus trap: panel itself focused (lines 88-94)', () => {
  it('moves focus to first focusable on Tab when panel itself is focused', async () => {
    const { layout } = await mountOverlay(true);
    await nextTick();
    await nextTick();

    const panel = document.querySelector('.mobile-sidebar-overlay__panel') as HTMLElement | null;
    expect(panel).not.toBeNull();

    // Add focusable buttons
    const btn1 = document.createElement('button');
    btn1.textContent = 'First';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Last';
    panel!.appendChild(btn1);
    panel!.appendChild(btn2);

    const focusSpy = vi.spyOn(btn1, 'focus');

    // Simulate document.activeElement === panel by overriding it
    Object.defineProperty(document, 'activeElement', {
      get: () => panel,
      configurable: true,
    });

    // Tab with panel as activeElement → should direct to first element
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    panel!.dispatchEvent(event);

    expect(focusSpy).toHaveBeenCalled();
    expect(layout.closeMobileOverlay).not.toHaveBeenCalled();

    // Restore activeElement
    Object.defineProperty(document, 'activeElement', {
      get: () => document.body,
      configurable: true,
    });

    btn1.remove();
    btn2.remove();
  });

  it('moves focus to last focusable on Shift+Tab when panel itself is focused', async () => {
    const { layout } = await mountOverlay(true);
    await nextTick();
    await nextTick();

    const panel = document.querySelector('.mobile-sidebar-overlay__panel') as HTMLElement | null;
    expect(panel).not.toBeNull();

    const btn1 = document.createElement('button');
    btn1.textContent = 'First';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Last';
    panel!.appendChild(btn1);
    panel!.appendChild(btn2);

    const focusSpy = vi.spyOn(btn2, 'focus');

    Object.defineProperty(document, 'activeElement', {
      get: () => panel,
      configurable: true,
    });

    // Shift+Tab with panel as activeElement → should direct to last element
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    panel!.dispatchEvent(event);

    expect(focusSpy).toHaveBeenCalled();
    expect(layout.closeMobileOverlay).not.toHaveBeenCalled();

    Object.defineProperty(document, 'activeElement', {
      get: () => document.body,
      configurable: true,
    });

    btn1.remove();
    btn2.remove();
  });
});

describe('MobileSidebarOverlay — focus trap: Shift+Tab from first (lines 98-99)', () => {
  it('wraps focus to last element when Shift+Tab pressed from first focusable', async () => {
    const { layout } = await mountOverlay(true);
    await nextTick();
    await nextTick();

    const panel = document.querySelector('.mobile-sidebar-overlay__panel') as HTMLElement | null;
    expect(panel).not.toBeNull();

    const btn1 = document.createElement('button');
    btn1.textContent = 'First';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Last';
    panel!.appendChild(btn1);
    panel!.appendChild(btn2);

    const focusSpy = vi.spyOn(btn2, 'focus');

    // Simulate document.activeElement === btn1 (first focusable)
    Object.defineProperty(document, 'activeElement', {
      get: () => btn1,
      configurable: true,
    });

    // Shift+Tab from first → should wrap to last
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    panel!.dispatchEvent(event);

    expect(focusSpy).toHaveBeenCalled();
    expect(layout.closeMobileOverlay).not.toHaveBeenCalled();

    Object.defineProperty(document, 'activeElement', {
      get: () => document.body,
      configurable: true,
    });

    btn1.remove();
    btn2.remove();
  });
});

/**
 * Branch coverage tests for SpatialShell component.
 *
 * Lines targeted:
 *   6 — v-if="!isMobile" on SidebarPanel: when isMobile is true,
 *        SidebarPanel is NOT rendered in the grid (only in MobileSidebarOverlay).
 *
 * This exercises the false branch of the v-if that hides the static sidebar
 * on mobile viewports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SpatialShell from './SpatialShell.vue';

function MockEventSource() {
  return {
    onopen: null,
    onerror: null,
    addEventListener: vi.fn(),
    close: vi.fn(),
  };
}
MockEventSource.prototype = {};

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div>Home</div>' } }],
  });
}

beforeEach(() => {
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SpatialShell — isMobile branch (v-if="!isMobile" on SidebarPanel)', () => {
  it('renders SidebarPanel in grid when viewport is desktop (isMobile=false)', async () => {
    // Mock matchMedia to return a non-mobile result (default behavior in tests)
    const mqStub = {
      matches: false, // matches: false → isMobile = false (desktop)
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mqStub),
    );

    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });

    // On desktop, SidebarPanel appears inside the sidebar grid area
    expect(wrapper.find('.spatial-shell__sidebar').exists()).toBe(true);
    // The sidebar has content (not empty) — SidebarPanel rendered
    expect(wrapper.find('.sidebar-panel').exists()).toBe(true);
  });

  it('hides SidebarPanel from grid when viewport is mobile (isMobile=true)', async () => {
    // Mock matchMedia to simulate mobile viewport
    const mqStub = {
      matches: true, // matches: true → isMobile = true
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mqStub),
    );

    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });

    // On mobile, SidebarPanel is NOT in the grid (it lives in MobileSidebarOverlay)
    // The sidebar container still renders (grid slot), but SidebarPanel inside is hidden
    expect(wrapper.find('.spatial-shell__sidebar').exists()).toBe(true);
    // SidebarPanel should NOT be rendered inside the grid sidebar slot
    expect(wrapper.find('.spatial-shell__sidebar .sidebar-panel').exists()).toBe(false);
  });
});

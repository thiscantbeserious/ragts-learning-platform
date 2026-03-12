/**
 * Tests for SpatialShell component.
 *
 * Verifies that the shell renders child components, exposes the router-view
 * for page content, and provides layout state to children via inject.
 * Also verifies that the data-hydrating attribute is removed after mount.
 * Stage 10: drag handlers, overlay visibility, and optimistic upload integration.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { defineComponent, inject } from 'vue';
import SpatialShell from './SpatialShell.vue';
import { layoutKey } from '../composables/useLayout.js';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div>Home</div>' } }],
  });
}

describe('SpatialShell', () => {
  it('renders without errors', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders the BrandMark element with correct grid area class', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });
    expect(wrapper.find('.spatial-shell__brand').exists()).toBe(true);
  });

  it('renders the ShellHeader element with correct grid area class', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });
    expect(wrapper.find('.spatial-shell__header').exists()).toBe(true);
  });

  it('renders the SidebarPanel element with correct grid area class', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });
    expect(wrapper.find('.spatial-shell__sidebar').exists()).toBe(true);
  });

  it('renders a router-view in the main area', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(SpatialShell, {
      global: { plugins: [router] },
    });
    expect(wrapper.find('.spatial-shell__main').exists()).toBe(true);
  });

  it('provides layout state to child components via inject', async () => {
    let injectedLayout: unknown = undefined;

    const ConsumerComponent = defineComponent({
      setup() {
        injectedLayout = inject(layoutKey);
        return {};
      },
      template: '<div></div>',
    });

    // Child route renders ConsumerComponent so it is inside SpatialShell's provide scope.
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/',
        component: SpatialShell,
        children: [{ path: '', component: ConsumerComponent }],
      }],
    });

    await testRouter.push('/');

    mount(SpatialShell, {
      global: { plugins: [testRouter] },
    });

    // Allow router-view to render the child component
    await testRouter.isReady();

    // The provide/inject must surface layout state
    expect(injectedLayout).toBeDefined();
    expect(injectedLayout).toHaveProperty('isSidebarOpen');
    expect(injectedLayout).toHaveProperty('toggleSidebar');
    expect(injectedLayout).toHaveProperty('isMobile');
  });

  describe('DropOverlay integration', () => {
    it('renders DropOverlay component', async () => {
      const router = createTestRouter();
      await router.push('/');
      const wrapper = mount(SpatialShell, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.drop-overlay').exists()).toBe(true);
    });

    it('DropOverlay is not visible by default', async () => {
      const router = createTestRouter();
      await router.push('/');
      const wrapper = mount(SpatialShell, {
        global: { plugins: [router] },
      });
      const overlay = wrapper.find('.drop-overlay');
      expect(overlay.classes()).not.toContain('drop-overlay--visible');
    });
  });

  describe('drag event handlers', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('registers drag event listeners on the .spatial-shell__sidebar element after mount', async () => {
      const router = createTestRouter();
      await router.push('/');

      const wrapper = mount(SpatialShell, {
        global: { plugins: [router] },
        attachTo: document.body,
      });

      const sidebarEl = wrapper.find('.spatial-shell__sidebar').element as HTMLElement;

      // Verify handlers are attached by dispatching dragenter — overlay should become visible.
      const dragEnterEvent = new Event('dragenter', { bubbles: true });
      Object.defineProperty(dragEnterEvent, 'preventDefault', { value: vi.fn() });
      sidebarEl.dispatchEvent(dragEnterEvent);

      await wrapper.vm.$nextTick();

      // DropOverlay is rendered inside the sidebar and should now show.
      const overlay = wrapper.find('.drop-overlay');
      expect(overlay.classes()).toContain('drop-overlay--visible');

      wrapper.unmount();
    });
  });

  describe('hydration transition suppression', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('removes data-hydrating attribute from .spatial-shell after mount', async () => {
      // Simulate the #app element having data-hydrating set (as index.html does).
      const shellEl = document.createElement('div');
      shellEl.classList.add('spatial-shell');
      shellEl.setAttribute('data-hydrating', '');
      document.body.appendChild(shellEl);

      const captured: { cb: FrameRequestCallback | null } = { cb: null };
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        captured.cb = cb;
        return 0;
      });

      const router = createTestRouter();
      await router.push('/');
      mount(SpatialShell, {
        global: { plugins: [router] },
        attachTo: shellEl,
      });

      // Attribute still present before rAF fires
      expect(shellEl.hasAttribute('data-hydrating')).toBe(true);

      // Fire the rAF callback
      if (captured.cb) captured.cb(0);

      // Attribute must be gone
      expect(shellEl.hasAttribute('data-hydrating')).toBe(false);

      document.body.removeChild(shellEl);
    });
  });
});

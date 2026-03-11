/**
 * Tests for SpatialShell component.
 *
 * Verifies that the shell renders child components, exposes the router-view
 * for page content, and provides layout state to children via inject.
 */
import { describe, it, expect } from 'vitest';
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
});

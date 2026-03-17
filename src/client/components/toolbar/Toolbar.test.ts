import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Toolbar from './Toolbar.vue';

// Stub EventSource for usePipelineStatus composable
function MockEventSource() {
  return { onopen: null, onerror: null, addEventListener: vi.fn(), close: vi.fn() };
}
MockEventSource.prototype = {};

beforeEach(() => { vi.stubGlobal('EventSource', MockEventSource); });
afterEach(() => { vi.unstubAllGlobals(); });

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  });
}

describe('Toolbar', () => {
  it('renders the toolbar pill', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(Toolbar, { global: { plugins: [router] } });
    expect(wrapper.find('.toolbar-pill').exists()).toBe(true);
  });

  it('renders pipeline trigger, buttons, and avatar', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(Toolbar, { global: { plugins: [router] } });
    expect(wrapper.find('.pipeline-ring-trigger').exists()).toBe(true);
    expect(wrapper.findAll('.toolbar-btn').length).toBe(2);
    expect(wrapper.find('.toolbar-avatar').exists()).toBe(true);
  });

  it('navigates to /settings when settings button is clicked', async () => {
    const router = createTestRouter();
    await router.push('/');
    const wrapper = mount(Toolbar, { global: { plugins: [router] } });
    const buttons = wrapper.findAll('.toolbar-btn');
    // Settings button has title="Settings"
    const settings = buttons.find((b) => b.attributes('title') === 'Settings');
    expect(settings).toBeTruthy();
    await settings!.trigger('click');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/settings');
  });
});

/**
 * Snapshot tests for AppHeader component.
 * Locks down the header HTML including brand link.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppHeader from '@client/components/AppHeader.vue';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div/>' } },
    ],
  });
}

describe('AppHeader component snapshots', () => {
  it('default render', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppHeader, {
      global: { plugins: [router] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('brand link points to root', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(AppHeader, {
      global: { plugins: [router] },
    });
    const link = wrapper.find('.app-header__brand');
    expect(link.attributes('href')).toBe('/');
    expect(link.text()).toBe('RAGTS');
    expect(wrapper.html()).toMatchSnapshot();
  });
});

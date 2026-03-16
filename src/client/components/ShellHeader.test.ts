/**
 * Tests for ShellHeader component.
 *
 * Covers: container structure, left/right slot areas, and accessibility
 * (landmark role for the header element).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ShellHeader from './ShellHeader.vue';
import ToolbarPill from './toolbar/ToolbarPill.vue';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
    ],
  });
}

async function mountShellHeader(path = '/') {
  const router = createTestRouter();
  await router.push(path);
  return mount(ShellHeader, {
    global: { plugins: [router] },
  });
}

describe('ShellHeader', () => {
  describe('container', () => {
    it('renders the shell-header container', async () => {
      const wrapper = await mountShellHeader();
      expect(wrapper.find('.shell-header').exists()).toBe(true);
    });

    it('carries the spatial-shell grid area class', async () => {
      const wrapper = await mountShellHeader();
      expect(wrapper.find('.spatial-shell__header').exists()).toBe(true);
    });

    it('renders a <header> element for landmark semantics', async () => {
      const wrapper = await mountShellHeader();
      expect(wrapper.find('header').exists()).toBe(true);
    });
  });

  describe('layout areas', () => {
    it('renders the left area for breadcrumbs', async () => {
      const wrapper = await mountShellHeader();
      expect(wrapper.find('.shell-header__left').exists()).toBe(true);
    });

    it('renders the right area for global actions', async () => {
      const wrapper = await mountShellHeader();
      expect(wrapper.find('.shell-header__right').exists()).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('header has an aria-label', async () => {
      const wrapper = await mountShellHeader();
      const header = wrapper.find('header');
      expect(header.attributes('aria-label')).toBeTruthy();
    });
  });

  describe('toolbar', () => {
    it('renders the ToolbarPill component inside the right area', async () => {
      const wrapper = await mountShellHeader();
      expect(wrapper.findComponent(ToolbarPill).exists()).toBe(true);
    });
  });
});

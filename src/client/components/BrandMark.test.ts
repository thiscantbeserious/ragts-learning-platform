/**
 * Tests for BrandMark component.
 *
 * Covers: structure (container, logotype link, icon, name), CSS classes,
 * and accessibility (link role, label).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import BrandMark from './BrandMark.vue';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

async function mountBrandMark() {
  const router = createTestRouter();
  await router.push('/');
  return mount(BrandMark, { global: { plugins: [router] } });
}

describe('BrandMark', () => {
  describe('container', () => {
    it('renders the brand-mark container', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.brand-mark').exists()).toBe(true);
    });

    it('carries the spatial-shell grid area class', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.spatial-shell__brand').exists()).toBe(true);
    });
  });

  describe('logotype', () => {
    it('renders a logotype link element', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.brand-mark__logotype').exists()).toBe(true);
    });

    it('logotype links to the home route "/"', async () => {
      const wrapper = await mountBrandMark();
      const link = wrapper.find('.brand-mark__logotype');
      expect(link.attributes('href')).toBe('/');
    });
  });

  describe('icon', () => {
    it('renders the brand icon element', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.brand-mark__icon').exists()).toBe(true);
    });

    it('renders "E" as the icon monogram', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.brand-mark__icon').text()).toBe('E');
    });
  });

  describe('name', () => {
    it('renders the brand name element', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.brand-mark__name').exists()).toBe(true);
    });

    it('displays "Erika" as the brand name', async () => {
      const wrapper = await mountBrandMark();
      expect(wrapper.find('.brand-mark__name').text()).toBe('Erika');
    });
  });

  describe('accessibility', () => {
    it('logotype link has an accessible aria-label', async () => {
      const wrapper = await mountBrandMark();
      const link = wrapper.find('.brand-mark__logotype');
      expect(link.attributes('aria-label')).toBeTruthy();
    });
  });
});

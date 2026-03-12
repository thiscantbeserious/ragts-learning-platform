/**
 * Tests for ShellHeader component.
 *
 * Covers: container structure, left/right slot areas, and accessibility
 * (landmark role for the header element).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ShellHeader from './ShellHeader.vue';

function mountShellHeader() {
  return mount(ShellHeader);
}

describe('ShellHeader', () => {
  describe('container', () => {
    it('renders the shell-header container', () => {
      const wrapper = mountShellHeader();
      expect(wrapper.find('.shell-header').exists()).toBe(true);
    });

    it('carries the spatial-shell grid area class', () => {
      const wrapper = mountShellHeader();
      expect(wrapper.find('.spatial-shell__header').exists()).toBe(true);
    });

    it('renders a <header> element for landmark semantics', () => {
      const wrapper = mountShellHeader();
      expect(wrapper.find('header').exists()).toBe(true);
    });
  });

  describe('layout areas', () => {
    it('renders the left area for future breadcrumbs', () => {
      const wrapper = mountShellHeader();
      expect(wrapper.find('.shell-header__left').exists()).toBe(true);
    });

    it('renders the right area for future global actions', () => {
      const wrapper = mountShellHeader();
      expect(wrapper.find('.shell-header__right').exists()).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('header has an aria-label', () => {
      const wrapper = mountShellHeader();
      const header = wrapper.find('header');
      expect(header.attributes('aria-label')).toBeTruthy();
    });
  });
});

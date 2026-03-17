/**
 * Tests for ToolbarPill component.
 *
 * Covers: glass pill container structure, CSS class application, ARIA attributes,
 * and slot projection for toolbar items.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolbarPill from './ToolbarPill.vue';

describe('ToolbarPill', () => {
  it('renders the toolbar-pill container', () => {
    const wrapper = mount(ToolbarPill);
    expect(wrapper.find('.toolbar-pill').exists()).toBe(true);
  });

  it('renders as a div element', () => {
    const wrapper = mount(ToolbarPill);
    expect(wrapper.element.tagName).toBe('DIV');
  });

  it('renders slot content inside the pill', () => {
    const wrapper = mount(ToolbarPill, {
      slots: { default: '<span class="test-child">content</span>' },
    });
    expect(wrapper.find('.test-child').exists()).toBe(true);
  });

  describe('accessibility', () => {
    it('has role="toolbar" for ARIA landmark', () => {
      const wrapper = mount(ToolbarPill);
      expect(wrapper.attributes('role')).toBe('toolbar');
    });

    it('has aria-label="Main toolbar"', () => {
      const wrapper = mount(ToolbarPill);
      expect(wrapper.attributes('aria-label')).toBe('Main toolbar');
    });
  });
});

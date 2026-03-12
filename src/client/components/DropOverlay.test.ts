/**
 * Tests for DropOverlay component — Stage 10.
 *
 * Covers: visibility, accessibility attributes, ARIA dropeffect,
 * and correct design token class usage.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DropOverlay from './DropOverlay.vue';

describe('DropOverlay', () => {
  describe('structure', () => {
    it('renders without errors', () => {
      const wrapper = mount(DropOverlay);
      expect(wrapper.exists()).toBe(true);
    });

    it('renders the overlay container', () => {
      const wrapper = mount(DropOverlay);
      expect(wrapper.find('.drop-overlay').exists()).toBe(true);
    });

    it('renders the drop message text', () => {
      const wrapper = mount(DropOverlay);
      expect(wrapper.find('.drop-overlay__message').exists()).toBe(true);
      expect(wrapper.find('.drop-overlay__message').text()).toContain('.cast');
    });
  });

  describe('accessibility', () => {
    it('has aria-dropeffect="copy"', () => {
      const wrapper = mount(DropOverlay);
      expect(wrapper.find('.drop-overlay').attributes('aria-dropeffect')).toBe('copy');
    });

    it('has role="region" or is a landmark for screen readers', () => {
      const wrapper = mount(DropOverlay);
      const overlay = wrapper.find('.drop-overlay');
      // Must have aria-label so screen readers understand purpose
      expect(overlay.attributes('aria-label')).toBeTruthy();
    });
  });

  describe('visibility prop', () => {
    it('is not visible (opacity 0 or display none) by default when visible=false', () => {
      const wrapper = mount(DropOverlay, { props: { visible: false } });
      const overlay = wrapper.find('.drop-overlay');
      // Should have the hidden class or the visible class should be absent
      expect(overlay.classes()).not.toContain('drop-overlay--visible');
    });

    it('shows the visible class when visible=true', () => {
      const wrapper = mount(DropOverlay, { props: { visible: true } });
      const overlay = wrapper.find('.drop-overlay');
      expect(overlay.classes()).toContain('drop-overlay--visible');
    });
  });
});

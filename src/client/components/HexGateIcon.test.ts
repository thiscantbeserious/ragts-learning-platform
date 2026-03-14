/**
 * Tests for HexGateIcon component — reusable hex gate icon button.
 *
 * Covers: renders segments, applies is-open class, native click via fallthrough,
 * aria attributes, and accessibility.
 * aria-label is passed as a fallthrough attribute (not a prop).
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HexGateIcon from './HexGateIcon.vue';

/** Mount helper — passes aria-label as a fallthrough attribute. */
function mountIcon(isOpen: boolean, ariaLabel = 'Toggle') {
  return mount(HexGateIcon, {
    props: { isOpen },
    attrs: { 'aria-label': ariaLabel },
  });
}

describe('HexGateIcon', () => {
  describe('structure', () => {
    it('renders a button element', () => {
      const wrapper = mountIcon(false);
      expect(wrapper.element.tagName).toBe('BUTTON');
    });

    it('has type="button" to prevent form submission', () => {
      const wrapper = mountIcon(false);
      expect(wrapper.attributes('type')).toBe('button');
    });

    it('renders the hex box container', () => {
      const wrapper = mountIcon(false);
      expect(wrapper.find('.hex-gate-icon__box').exists()).toBe(true);
    });

    it('renders the hex inner container', () => {
      const wrapper = mountIcon(false);
      expect(wrapper.find('.hex-gate-icon__inner').exists()).toBe(true);
    });

    it('renders exactly 5 hex segments', () => {
      const wrapper = mountIcon(false);
      const segs = wrapper.findAll('.hex-gate-icon__seg');
      expect(segs).toHaveLength(5);
    });

    it('renders each numbered segment modifier class 1 through 5', () => {
      const wrapper = mountIcon(false);
      for (let i = 1; i <= 5; i++) {
        expect(wrapper.find(`.hex-gate-icon__seg--${i}`).exists()).toBe(true);
      }
    });

    it('hex inner has aria-hidden="true"', () => {
      const wrapper = mountIcon(false);
      expect(wrapper.find('.hex-gate-icon__inner').attributes('aria-hidden')).toBe('true');
    });
  });

  describe('isOpen prop', () => {
    it('does not have is-open class when isOpen is false', () => {
      const wrapper = mountIcon(false);
      expect(wrapper.classes()).not.toContain('is-open');
    });

    it('adds is-open class to button when isOpen is true', () => {
      const wrapper = mountIcon(true);
      expect(wrapper.classes()).toContain('is-open');
    });
  });

  describe('aria-label attribute inheritance', () => {
    it('inherits aria-label on the root button', () => {
      const wrapper = mountIcon(false, 'Close navigation');
      expect(wrapper.attributes('aria-label')).toBe('Close navigation');
    });

    it('inherits a different aria-label value correctly', () => {
      const wrapper = mountIcon(false, 'Toggle navigation');
      expect(wrapper.attributes('aria-label')).toBe('Toggle navigation');
    });
  });

  describe('click event', () => {
    it('calls a native click handler exactly once per click via fallthrough', async () => {
      const handler = vi.fn();
      const wrapper = mount(HexGateIcon, {
        props: { isOpen: false },
        attrs: { 'aria-label': 'Toggle', onClick: handler },
      });
      await wrapper.trigger('click');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls native click handler multiple times for multiple clicks', async () => {
      const handler = vi.fn();
      const wrapper = mount(HexGateIcon, {
        props: { isOpen: false },
        attrs: { 'aria-label': 'Toggle', onClick: handler },
      });
      await wrapper.trigger('click');
      await wrapper.trigger('click');
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});

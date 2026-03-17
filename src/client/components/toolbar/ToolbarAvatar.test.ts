/**
 * Tests for ToolbarAvatar component.
 *
 * Covers: rendering initial, accessibility, element type, click event emission,
 * and collapse toggle integration via toolbarCollapseKey injection.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolbarAvatar from './ToolbarAvatar.vue';
import { toolbarCollapseKey } from './toolbar_collapse.js';

function mountAvatar(props: { initial?: string } = {}) {
  return mount(ToolbarAvatar, { props });
}

describe('ToolbarAvatar', () => {
  describe('rendering', () => {
    it('renders a <button> element', () => {
      const wrapper = mountAvatar();
      expect(wrapper.find('button').exists()).toBe(true);
    });

    it('renders the default "S" initial when no prop is provided', () => {
      const wrapper = mountAvatar();
      expect(wrapper.text()).toBe('S');
    });

    it('renders a custom initial when the initial prop is provided', () => {
      const wrapper = mountAvatar({ initial: 'A' });
      expect(wrapper.text()).toBe('A');
    });
  });

  describe('accessibility', () => {
    it('has title set to "User menu"', () => {
      const wrapper = mountAvatar();
      expect(wrapper.find('button').attributes('title')).toBe('User menu');
    });
  });

  describe('events', () => {
    it('emits a click event when the button is clicked', async () => {
      const wrapper = mountAvatar();
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('click')).toBeTruthy();
    });
  });

  describe('collapse integration', () => {
    it('calls toggleCollapse when the button is clicked and injection is provided', async () => {
      const toggleCollapse = vi.fn();
      const wrapper = mount(ToolbarAvatar, {
        global: {
          provide: {
            [toolbarCollapseKey as symbol]: {
              isCollapsed: { value: false },
              toggleCollapse,
            },
          },
        },
      });
      await wrapper.find('button').trigger('click');
      expect(toggleCollapse).toHaveBeenCalledTimes(1);
    });

    it('does not throw when no toolbarCollapseKey is provided', async () => {
      const wrapper = mountAvatar();
      await expect(wrapper.find('button').trigger('click')).resolves.not.toThrow();
    });
  });
});

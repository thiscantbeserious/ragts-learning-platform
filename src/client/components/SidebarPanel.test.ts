/**
 * Tests for SidebarPanel component.
 *
 * Verifies that the panel shows the skeleton loader while loading, and
 * renders slotted content when not loading.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SidebarPanel from './SidebarPanel.vue';

describe('SidebarPanel', () => {
  it('renders inside the sidebar grid area element', () => {
    const wrapper = mount(SidebarPanel, {
      props: { loading: false },
    });
    expect(wrapper.find('.spatial-shell__sidebar').exists()).toBe(true);
  });

  it('shows SkeletonSidebar when loading is true', () => {
    const wrapper = mount(SidebarPanel, {
      props: { loading: true },
    });
    expect(wrapper.find('.skeleton-sidebar').exists()).toBe(true);
  });

  it('hides SkeletonSidebar when loading is false', () => {
    const wrapper = mount(SidebarPanel, {
      props: { loading: false },
    });
    expect(wrapper.find('.skeleton-sidebar').exists()).toBe(false);
  });

  it('renders slot content when not loading', () => {
    const wrapper = mount(SidebarPanel, {
      props: { loading: false },
      slots: {
        default: '<div class="test-slot-content">Session list</div>',
      },
    });
    expect(wrapper.find('.test-slot-content').exists()).toBe(true);
  });

  it('does not render slot content while loading', () => {
    const wrapper = mount(SidebarPanel, {
      props: { loading: true },
      slots: {
        default: '<div class="test-slot-content">Session list</div>',
      },
    });
    expect(wrapper.find('.test-slot-content').exists()).toBe(false);
  });

  it('defaults to not loading when prop is omitted', () => {
    const wrapper = mount(SidebarPanel);
    expect(wrapper.find('.skeleton-sidebar').exists()).toBe(false);
  });
});

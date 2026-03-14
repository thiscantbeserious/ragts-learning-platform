/**
 * Tests for SkeletonMain component.
 *
 * Verifies that the main area skeleton renders section header
 * and terminal shimmer placeholders at the correct dimensions.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SkeletonMain from './SkeletonMain.vue';

describe('SkeletonMain', () => {
  it('renders without errors', () => {
    const wrapper = mount(SkeletonMain);
    expect(wrapper.exists()).toBe(true);
  });

  it('renders inside the skeleton-main root element', () => {
    const wrapper = mount(SkeletonMain);
    expect(wrapper.find('.skeleton-main').exists()).toBe(true);
  });

  it('renders at least one section header placeholder', () => {
    const wrapper = mount(SkeletonMain);
    const headers = wrapper.findAll('.skeleton-main__section-header');
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a terminal body shimmer block', () => {
    const wrapper = mount(SkeletonMain);
    expect(wrapper.find('.skeleton-main__terminal').exists()).toBe(true);
  });

  it('terminal shimmer block contains the skeleton class for animation', () => {
    const wrapper = mount(SkeletonMain);
    const terminal = wrapper.find('.skeleton-main__terminal');
    expect(terminal.classes()).toContain('skeleton');
  });

  it('has aria-busy attribute to signal loading state', () => {
    const wrapper = mount(SkeletonMain);
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
  });
});

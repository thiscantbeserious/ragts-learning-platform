/**
 * Tests for SkeletonSidebar component.
 *
 * Verifies that the sidebar skeleton renders the correct number of shimmer
 * cards at session-card height, providing a CLS-safe loading placeholder.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SkeletonSidebar from './SkeletonSidebar.vue';

describe('SkeletonSidebar', () => {
  it('renders without errors', () => {
    const wrapper = mount(SkeletonSidebar);
    expect(wrapper.exists()).toBe(true);
  });

  it('renders between 3 and 5 skeleton cards', () => {
    const wrapper = mount(SkeletonSidebar);
    const cards = wrapper.findAll('.skeleton--card');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);
  });

  it('each skeleton card contains two skeleton shimmer rows', () => {
    const wrapper = mount(SkeletonSidebar);
    const cards = wrapper.findAll('.skeleton--card');
    for (const card of cards) {
      const shimmers = card.findAll('.skeleton');
      expect(shimmers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('renders inside the skeleton-sidebar root element', () => {
    const wrapper = mount(SkeletonSidebar);
    expect(wrapper.find('.skeleton-sidebar').exists()).toBe(true);
  });

  it('has aria-busy attribute to signal loading state', () => {
    const wrapper = mount(SkeletonSidebar);
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
  });
});

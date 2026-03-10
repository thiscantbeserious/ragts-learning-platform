/**
 * Unit tests for SkeletonCard component.
 * Exercises skeleton structure and variant-based width variations.
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SkeletonCard from './SkeletonCard.vue';

function mountCard(variant: 1 | 2 | 3) {
  return mount(SkeletonCard, { props: { variant } });
}

describe('SkeletonCard', () => {
  it('renders .landing__skeleton-card root', () => {
    const wrapper = mountCard(1);
    expect(wrapper.find('.landing__skeleton-card').exists()).toBe(true);
  });

  it('renders .landing__skeleton-preview section', () => {
    const wrapper = mountCard(1);
    expect(wrapper.find('.landing__skeleton-preview').exists()).toBe(true);
  });

  it('renders .landing__skeleton-body section', () => {
    const wrapper = mountCard(1);
    expect(wrapper.find('.landing__skeleton-body').exists()).toBe(true);
  });

  it('renders .landing__skeleton-footer section', () => {
    const wrapper = mountCard(1);
    expect(wrapper.find('.landing__skeleton-footer').exists()).toBe(true);
  });

  it('renders 4 preview skeleton bars with .skeleton--text class', () => {
    const wrapper = mountCard(1);
    const previewBars = wrapper.findAll('.landing__skeleton-preview .skeleton--text');
    expect(previewBars).toHaveLength(4);
  });

  it('renders body skeleton bar with .skeleton--text class', () => {
    const wrapper = mountCard(1);
    const bodyBars = wrapper.findAll('.landing__skeleton-body > .skeleton--text');
    expect(bodyBars).toHaveLength(1);
  });

  it('renders meta skeleton bars with .skeleton--text-sm class', () => {
    const wrapper = mountCard(1);
    const metaBars = wrapper.findAll('.skeleton--text-sm');
    expect(metaBars.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SkeletonCard — variant 1 widths', () => {
  it('preview bars have widths 60%, 80%, 45%, 70%', () => {
    const wrapper = mountCard(1);
    const bars = wrapper.findAll('.landing__skeleton-preview .skeleton--text');
    expect((bars[0]!.element as HTMLElement).style.width).toBe('60%');
    expect((bars[1]!.element as HTMLElement).style.width).toBe('80%');
    expect((bars[2]!.element as HTMLElement).style.width).toBe('45%');
    expect((bars[3]!.element as HTMLElement).style.width).toBe('70%');
  });

  it('body bar has width 75%', () => {
    const wrapper = mountCard(1);
    const bodyBar = wrapper.find('.landing__skeleton-body > .skeleton--text');
    expect((bodyBar.element as HTMLElement).style.width).toBe('75%');
  });

  it('meta bars have widths 70px and 80px', () => {
    const wrapper = mountCard(1);
    const metaBars = wrapper.findAll('.skeleton--text-sm');
    const footerBars = wrapper.findAll('.landing__skeleton-footer .skeleton--text-sm');
    // meta items (first two)
    const nonFooterMeta = metaBars.filter((el) => !footerBars.includes(el));
    expect((nonFooterMeta[0]!.element as HTMLElement).style.width).toBe('70px');
    expect((nonFooterMeta[1]!.element as HTMLElement).style.width).toBe('80px');
  });

  it('footer bars have widths 60px and 45px', () => {
    const wrapper = mountCard(1);
    const footerBars = wrapper.findAll('.landing__skeleton-footer .skeleton--text-sm');
    expect((footerBars[0]!.element as HTMLElement).style.width).toBe('60px');
    expect((footerBars[1]!.element as HTMLElement).style.width).toBe('45px');
  });
});

describe('SkeletonCard — variant 2 widths', () => {
  it('preview bars have widths 50%, 90%, 65%, 55%', () => {
    const wrapper = mountCard(2);
    const bars = wrapper.findAll('.landing__skeleton-preview .skeleton--text');
    expect((bars[0]!.element as HTMLElement).style.width).toBe('50%');
    expect((bars[1]!.element as HTMLElement).style.width).toBe('90%');
    expect((bars[2]!.element as HTMLElement).style.width).toBe('65%');
    expect((bars[3]!.element as HTMLElement).style.width).toBe('55%');
  });

  it('body bar has width 85%', () => {
    const wrapper = mountCard(2);
    const bodyBar = wrapper.find('.landing__skeleton-body > .skeleton--text');
    expect((bodyBar.element as HTMLElement).style.width).toBe('85%');
  });

  it('footer bars have widths 55px and 50px', () => {
    const wrapper = mountCard(2);
    const footerBars = wrapper.findAll('.landing__skeleton-footer .skeleton--text-sm');
    expect((footerBars[0]!.element as HTMLElement).style.width).toBe('55px');
    expect((footerBars[1]!.element as HTMLElement).style.width).toBe('50px');
  });
});

describe('SkeletonCard — variant 3 widths', () => {
  it('preview bars have widths 70%, 55%, 85%, 40%', () => {
    const wrapper = mountCard(3);
    const bars = wrapper.findAll('.landing__skeleton-preview .skeleton--text');
    expect((bars[0]!.element as HTMLElement).style.width).toBe('70%');
    expect((bars[1]!.element as HTMLElement).style.width).toBe('55%');
    expect((bars[2]!.element as HTMLElement).style.width).toBe('85%');
    expect((bars[3]!.element as HTMLElement).style.width).toBe('40%');
  });

  it('body bar has width 65%', () => {
    const wrapper = mountCard(3);
    const bodyBar = wrapper.find('.landing__skeleton-body > .skeleton--text');
    expect((bodyBar.element as HTMLElement).style.width).toBe('65%');
  });

  it('footer bars have widths 70px and 40px', () => {
    const wrapper = mountCard(3);
    const footerBars = wrapper.findAll('.landing__skeleton-footer .skeleton--text-sm');
    expect((footerBars[0]!.element as HTMLElement).style.width).toBe('70px');
    expect((footerBars[1]!.element as HTMLElement).style.width).toBe('40px');
  });
});

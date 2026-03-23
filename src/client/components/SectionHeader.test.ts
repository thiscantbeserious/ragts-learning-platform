/**
 * Tests for SectionHeader component.
 *
 * Covers: rendering with marker/detected types, collapsed/expanded chevron,
 * line range display (CLI vs TUI vs none), badge text, toggle event emission.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionHeader from './SectionHeader.vue';
import type { SectionMetadata } from '../../shared/types/api.js';

/** Minimal valid marker section. */
function makeMarkerSection(overrides: Partial<SectionMetadata> = {}): SectionMetadata {
  return {
    id: 'sec-1',
    type: 'marker',
    label: 'Introduction',
    startEvent: 0,
    endEvent: 10,
    startLine: null,
    endLine: null,
    lineCount: 0,
    preview: null,
    ...overrides,
  };
}

describe('SectionHeader', () => {
  describe('rendering', () => {
    it('renders as a button element', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: false, lineCount: 0 },
      });
      expect(wrapper.element.tagName).toBe('BUTTON');
    });

    it('displays the section label', () => {
      const wrapper = mount(SectionHeader, {
        props: {
          section: makeMarkerSection({ label: 'My Section' }),
          collapsed: false,
          lineCount: 0,
        },
      });
      expect(wrapper.find('.section-header__label').text()).toBe('My Section');
    });

    it('shows the down chevron when not collapsed', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: false, lineCount: 0 },
      });
      expect(wrapper.find('.icon-chevron-down').exists()).toBe(true);
      expect(wrapper.find('.icon-chevron-right').exists()).toBe(false);
    });

    it('shows the right chevron when collapsed', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: true, lineCount: 0 },
      });
      expect(wrapper.find('.icon-chevron-right').exists()).toBe(true);
      expect(wrapper.find('.icon-chevron-down').exists()).toBe(false);
    });

    it('applies the collapsed modifier class when collapsed is true', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: true, lineCount: 0 },
      });
      expect(wrapper.classes()).toContain('section-header--collapsed');
    });

    it('does not apply the collapsed modifier class when collapsed is false', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: false, lineCount: 0 },
      });
      expect(wrapper.classes()).not.toContain('section-header--collapsed');
    });
  });

  describe('section type styling', () => {
    it('applies marker modifier class for marker sections', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection({ type: 'marker' }), collapsed: false, lineCount: 0 },
      });
      expect(wrapper.classes()).toContain('section-header--marker');
    });

    it('applies detected modifier class for detected sections', () => {
      const wrapper = mount(SectionHeader, {
        props: {
          section: makeMarkerSection({ type: 'detected' }),
          collapsed: false,
          lineCount: 0,
        },
      });
      expect(wrapper.classes()).toContain('section-header--detected');
    });

    it('shows "Marker" badge text for marker sections', () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection({ type: 'marker' }), collapsed: false, lineCount: 0 },
      });
      expect(wrapper.find('.section-header__badge').text()).toBe('Marker');
    });

    it('shows "Detected" badge text for detected sections', () => {
      const wrapper = mount(SectionHeader, {
        props: {
          section: makeMarkerSection({ type: 'detected' }),
          collapsed: false,
          lineCount: 0,
        },
      });
      expect(wrapper.find('.section-header__badge').text()).toBe('Detected');
    });
  });

  describe('line range display', () => {
    it('shows CLI line range when startLine and endLine are set', () => {
      const wrapper = mount(SectionHeader, {
        props: {
          section: makeMarkerSection({ startLine: 4, endLine: 20 }),
          collapsed: false,
          lineCount: 16,
        },
      });
      const range = wrapper.find('.section-header__range');
      expect(range.exists()).toBe(true);
      expect(range.text()).toContain('L5');
      expect(range.text()).toContain('L20');
      expect(range.text()).toContain('16');
    });

    it('shows viewport line count when startLine is null but lineCount > 0', () => {
      const wrapper = mount(SectionHeader, {
        props: {
          section: makeMarkerSection({ startLine: null, endLine: null }),
          collapsed: false,
          lineCount: 24,
        },
      });
      const range = wrapper.find('.section-header__range');
      expect(range.exists()).toBe(true);
      expect(range.text()).toContain('24');
      expect(range.text()).toContain('viewport');
    });

    it('does not show line range when both startLine is null and lineCount is 0', () => {
      const wrapper = mount(SectionHeader, {
        props: {
          section: makeMarkerSection({ startLine: null, endLine: null }),
          collapsed: false,
          lineCount: 0,
        },
      });
      expect(wrapper.find('.section-header__range').exists()).toBe(false);
    });
  });

  describe('toggle event', () => {
    it('emits "toggle" event when the button is clicked', async () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: false, lineCount: 0 },
      });
      await wrapper.trigger('click');
      expect(wrapper.emitted('toggle')).toHaveLength(1);
    });

    it('emits "toggle" event each time the button is clicked', async () => {
      const wrapper = mount(SectionHeader, {
        props: { section: makeMarkerSection(), collapsed: false, lineCount: 0 },
      });
      await wrapper.trigger('click');
      await wrapper.trigger('click');
      await wrapper.trigger('click');
      expect(wrapper.emitted('toggle')).toHaveLength(3);
    });
  });
});

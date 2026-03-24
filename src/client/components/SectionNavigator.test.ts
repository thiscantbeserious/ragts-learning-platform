/**
 * Tests for SectionNavigator component.
 *
 * Covers: pill rendering, active state tracking, click-to-navigate,
 * keyboard navigation, ARIA attributes, hover prefetch, popover display.
 *
 * happy-dom environment — uses @vue/test-utils.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SectionNavigator from './SectionNavigator.vue';
import type { SectionMetadata } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSections(count: number): SectionMetadata[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sec-${i + 1}`,
    type: (i % 3 === 0 ? 'marker' : 'detected') as 'marker' | 'detected',
    label: `Section ${i + 1}`,
    startEvent: i * 10,
    endEvent: i * 10 + 9,
    startLine: i * 50,
    endLine: i * 50 + 49,
    lineCount: 50,
    preview: i === 0 ? '$ echo hello' : null,
  }));
}

/** All mounted wrappers for cleanup between tests. */
const mounted: VueWrapper[] = [];

function mountNavigator(
  sections: SectionMetadata[],
  activeId: string | null = null,
  overrides: Record<string, unknown> = {},
): VueWrapper {
  const scrollToSection = vi.fn();
  const onHoverSection = vi.fn();
  const wrapper = mount(SectionNavigator, {
    props: {
      sections,
      activeId,
      scrollToSection,
      onHoverSection,
      ...overrides,
    },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionNavigator', () => {
  afterEach(() => {
    // Unmount all wrappers to clean up Teleported DOM nodes
    for (const w of mounted) {
      w.unmount();
    }
    mounted.length = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Structure
  // ---------------------------------------------------------------------------

  describe('structure', () => {
    it('renders the aside element with navigation role', () => {
      const wrapper = mountNavigator(makeSections(3));
      const aside = wrapper.find('aside');
      expect(aside.exists()).toBe(true);
    });

    it('has aria-label "Section navigator"', () => {
      const wrapper = mountNavigator(makeSections(3));
      const nav = wrapper.find('[aria-label="Section navigator"]');
      expect(nav.exists()).toBe(true);
    });

    it('has role="navigation" on the root element', () => {
      const wrapper = mountNavigator(makeSections(3));
      const nav = wrapper.find('[role="navigation"]');
      expect(nav.exists()).toBe(true);
    });

    it('renders the section count header', () => {
      const sections = makeSections(7);
      const wrapper = mountNavigator(sections);
      const count = wrapper.find('.section-nav__count');
      expect(count.text()).toBe('7');
    });

    it('renders a trace line element', () => {
      const wrapper = mountNavigator(makeSections(3));
      expect(wrapper.find('.section-nav__trace').exists()).toBe(true);
    });

    it('renders a pointer element', () => {
      const wrapper = mountNavigator(makeSections(3));
      expect(wrapper.find('.section-nav__pointer').exists()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Pill rendering
  // ---------------------------------------------------------------------------

  describe('pill rendering', () => {
    it('renders one pill per section', () => {
      const wrapper = mountNavigator(makeSections(5));
      const pills = wrapper.findAll('.section-pill');
      expect(pills).toHaveLength(5);
    });

    it('renders pill numbers starting at 1', () => {
      const wrapper = mountNavigator(makeSections(3));
      const pills = wrapper.findAll('.section-pill');
      expect(pills[0]?.text()).toBe('1');
      expect(pills[1]?.text()).toBe('2');
      expect(pills[2]?.text()).toBe('3');
    });

    it('applies section-pill--marker class for marker sections', () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'marker',
          label: 'Marker Section',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 10,
          preview: null,
        },
      ];
      const wrapper = mountNavigator(sections);
      const pill = wrapper.find('.section-pill');
      expect(pill.classes()).toContain('section-pill--marker');
    });

    it('applies section-pill--detected class for detected sections', () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'detected',
          label: 'Detected Section',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 10,
          preview: null,
        },
      ];
      const wrapper = mountNavigator(sections);
      const pill = wrapper.find('.section-pill');
      expect(pill.classes()).toContain('section-pill--detected');
    });

    it('renders zero pills for an empty sections list', () => {
      const wrapper = mountNavigator([]);
      expect(wrapper.findAll('.section-pill')).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Active state
  // ---------------------------------------------------------------------------

  describe('active state', () => {
    it('applies section-pill--active to the pill matching activeId', () => {
      const wrapper = mountNavigator(makeSections(3), 'sec-2');
      const pills = wrapper.findAll('.section-pill');
      expect(pills[1]?.classes()).toContain('section-pill--active');
    });

    it('does not apply section-pill--active when activeId is null', () => {
      const wrapper = mountNavigator(makeSections(3), null);
      const activePills = wrapper.findAll('.section-pill--active');
      expect(activePills).toHaveLength(0);
    });

    it('marks the active pill with aria-current="true"', () => {
      const wrapper = mountNavigator(makeSections(3), 'sec-1');
      const pills = wrapper.findAll('.section-pill');
      expect(pills[0]?.attributes('aria-current')).toBe('true');
    });

    it('does not set aria-current on non-active pills', () => {
      const wrapper = mountNavigator(makeSections(3), 'sec-1');
      const pills = wrapper.findAll('.section-pill');
      expect(pills[1]?.attributes('aria-current')).not.toBe('true');
    });

    it('updates active pill when activeId prop changes', async () => {
      const wrapper = mountNavigator(makeSections(3), 'sec-1');
      expect(wrapper.findAll('.section-pill--active')[0]?.text()).toBe('1');

      await wrapper.setProps({ activeId: 'sec-3' });
      expect(wrapper.findAll('.section-pill--active')[0]?.text()).toBe('3');
    });
  });

  // ---------------------------------------------------------------------------
  // Click-to-navigate
  // ---------------------------------------------------------------------------

  describe('click-to-navigate', () => {
    it('calls scrollToSection with the section id when a pill is clicked', async () => {
      const scrollToSection = vi.fn();
      const wrapper = mountNavigator(makeSections(3), null, { scrollToSection });

      const pills = wrapper.findAll('.section-pill');
      await pills[1]?.trigger('click');
      expect(scrollToSection).toHaveBeenCalledWith('sec-2');
    });

    it('calls scrollToSection for the correct pill index', async () => {
      const scrollToSection = vi.fn();
      const wrapper = mountNavigator(makeSections(5), null, { scrollToSection });

      const pills = wrapper.findAll('.section-pill');
      await pills[4]?.trigger('click');
      expect(scrollToSection).toHaveBeenCalledWith('sec-5');
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------

  describe('keyboard navigation', () => {
    it('calls scrollToSection on click (Enter/Space natively fire click on buttons)', async () => {
      const scrollToSection = vi.fn();
      const wrapper = mountNavigator(makeSections(3), null, { scrollToSection });

      const pills = wrapper.findAll('.section-pill');
      await pills[0]?.trigger('click');
      expect(scrollToSection).toHaveBeenCalledWith('sec-1');
    });

    it('pills have tabindex="0" to be keyboard-focusable', () => {
      const wrapper = mountNavigator(makeSections(3));
      const pills = wrapper.findAll('.section-pill');
      for (const pill of pills) {
        expect(pill.attributes('tabindex')).toBe('0');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Hover prefetch
  // ---------------------------------------------------------------------------

  describe('hover prefetch', () => {
    it('calls onHoverSection when a pill receives mouseenter after 150ms debounce', async () => {
      vi.useFakeTimers();
      const onHoverSection = vi.fn();
      const wrapper = mountNavigator(makeSections(3), null, {
        scrollToSection: vi.fn(),
        onHoverSection,
      });

      const pills = wrapper.findAll('.section-pill');
      await pills[2]?.trigger('mouseenter');
      expect(onHoverSection).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);
      expect(onHoverSection).toHaveBeenCalledWith('sec-3');
    });
  });

  // ---------------------------------------------------------------------------
  // Popover
  // ---------------------------------------------------------------------------
  //
  // The popover is Teleported to document.body, so we query it via
  // document.querySelector() rather than wrapper.find().

  describe('popover', () => {
    it('shows popover when a pill is hovered', async () => {
      const wrapper = mountNavigator(makeSections(3));
      const pills = wrapper.findAll('.section-pill');
      await pills[0]?.trigger('mouseenter');
      await nextTick();
      expect(document.querySelector('.section-popover')).not.toBeNull();
    });

    it('hides popover when mouse leaves the pill', async () => {
      const wrapper = mountNavigator(makeSections(3));
      const pills = wrapper.findAll('.section-pill');
      await pills[0]?.trigger('mouseenter');
      await nextTick();
      await pills[0]?.trigger('mouseleave');
      await nextTick();
      expect(document.querySelector('.section-popover')).toBeNull();
    });

    it('displays section label in popover header', async () => {
      const wrapper = mountNavigator(makeSections(3));
      const pills = wrapper.findAll('.section-pill');
      await pills[0]?.trigger('mouseenter');
      await nextTick();
      const title = document.querySelector('.section-popover__title');
      expect(title?.textContent).toBe('Section 1');
    });

    it('displays section type badge in popover', async () => {
      const wrapper = mountNavigator(makeSections(3));
      const pills = wrapper.findAll('.section-pill');
      await pills[0]?.trigger('mouseenter');
      await nextTick();
      expect(document.querySelector('.section-popover__badge')).not.toBeNull();
    });

    it('applies section-popover--marker class for marker section popover', async () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'marker',
          label: 'Marker',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 10,
          preview: null,
        },
      ];
      const wrapper = mountNavigator(sections);
      await wrapper.find('.section-pill').trigger('mouseenter');
      await nextTick();
      const popover = document.querySelector('.section-popover');
      expect(popover?.classList.contains('section-popover--marker')).toBe(true);
    });

    it('applies section-popover--detected class for detected section popover', async () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'detected',
          label: 'Detected',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 10,
          preview: null,
        },
      ];
      const wrapper = mountNavigator(sections);
      await wrapper.find('.section-pill').trigger('mouseenter');
      await nextTick();
      const popover = document.querySelector('.section-popover');
      expect(popover?.classList.contains('section-popover--detected')).toBe(true);
    });

    it('shows preview text in popover when section has a preview', async () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'detected',
          label: 'With Preview',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 10,
          preview: '$ echo hello',
        },
      ];
      const wrapper = mountNavigator(sections);
      await wrapper.find('.section-pill').trigger('mouseenter');
      await nextTick();
      const preview = document.querySelector('.section-popover__preview');
      expect(preview).not.toBeNull();
      expect(preview?.textContent).toContain('$ echo hello');
    });

    it('does not render preview area when preview is null', async () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'detected',
          label: 'No Preview',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 10,
          preview: null,
        },
      ];
      const wrapper = mountNavigator(sections);
      await wrapper.find('.section-pill').trigger('mouseenter');
      await nextTick();
      expect(document.querySelector('.section-popover__preview')).toBeNull();
    });

    it('shows line count in popover meta', async () => {
      const sections: SectionMetadata[] = [
        {
          id: 'sec-1',
          type: 'detected',
          label: 'Sec',
          startEvent: 0,
          endEvent: 5,
          startLine: 0,
          endLine: 9,
          lineCount: 78,
          preview: null,
        },
      ];
      const wrapper = mountNavigator(sections);
      await wrapper.find('.section-pill').trigger('mouseenter');
      await nextTick();
      const meta = document.querySelector('.section-popover__meta');
      expect(meta?.textContent).toContain('78');
    });
  });
});

/**
 * Tests for OverlayScrollbar component.
 *
 * Covers: slot rendering, thumb visibility based on overflow state,
 * proportional thumb sizing, and thumb position updates on scroll.
 *
 * Note: jsdom/happy-dom do not implement scrollHeight/clientHeight layout,
 * so tests stub those properties directly on refs to exercise the
 * component's calculation logic.
 *
 * The track element uses v-if="hasOverflow", so it only appears in the DOM
 * after a scroll/resize triggers recalculate() with overflowing content.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import OverlayScrollbar from './OverlayScrollbar.vue';

/** Stubs layout properties that happy-dom cannot compute. */
function stubViewportLayout(
  el: HTMLElement,
  options: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): void {
  Object.defineProperty(el, 'scrollHeight', { value: options.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: options.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', {
    value: options.scrollTop ?? 0,
    configurable: true,
    writable: true,
  });
}

/** Stubs clientHeight for the track element. */
function stubTrackHeight(el: HTMLElement, height: number): void {
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

/** Helper: mount, stub overflow, trigger scroll, wait for track to appear, stub track height. */
async function mountWithOverflow(
  scrollHeight: number,
  clientHeight: number,
  scrollTop = 0,
  trackHeight = 200,
): Promise<VueWrapper> {
  const wrapper = mount(OverlayScrollbar, {
    slots: { default: '<p>content</p>' },
    attachTo: document.body,
  });

  const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
  stubViewportLayout(viewport, { scrollHeight, clientHeight, scrollTop });

  // Trigger scroll to set hasOverflow and recalculate
  await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
  await nextTick();

  // Track is now in DOM if content overflows
  const track = wrapper.find('.overlay-scrollbar__track');
  if (track.exists()) {
    stubTrackHeight(track.element as HTMLElement, trackHeight);
    // Re-trigger to pick up track height
    await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
    await nextTick();
  }

  return wrapper;
}

describe('OverlayScrollbar', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    wrapper?.unmount();
  });

  describe('slot rendering', () => {
    it('renders slot content', () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<ul><li>Item 1</li><li>Item 2</li></ul>' },
      });
      expect(wrapper.find('ul').exists()).toBe(true);
      expect(wrapper.findAll('li').length).toBe(2);
    });

    it('renders the viewport container', () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      expect(wrapper.find('.overlay-scrollbar__viewport').exists()).toBe(true);
    });
  });

  describe('root element', () => {
    it('has the overlay-scrollbar root class', () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      expect(wrapper.find('.overlay-scrollbar').exists()).toBe(true);
    });

    it('forwards extra classes to the root element', () => {
      wrapper = mount(OverlayScrollbar, {
        attrs: { class: 'sidebar__list-region' },
        slots: { default: '<p>content</p>' },
      });
      expect(wrapper.classes()).toContain('sidebar__list-region');
    });
  });

  describe('track visibility', () => {
    it('track is not in DOM when content fits (no overflow)', async () => {
      wrapper = await mountWithOverflow(100, 200);
      expect(wrapper.find('.overlay-scrollbar__track').exists()).toBe(false);
    });

    it('track appears when content overflows', async () => {
      wrapper = await mountWithOverflow(400, 200);
      expect(wrapper.find('.overlay-scrollbar__track').exists()).toBe(true);
    });

    it('applies scrolling class when scroll fires with overflow', async () => {
      wrapper = await mountWithOverflow(400, 200, 50);
      expect(wrapper.find('.overlay-scrollbar--scrolling').exists()).toBe(true);
    });
  });

  describe('thumb height calculation', () => {
    it('thumb height is proportional to visible ratio', async () => {
      wrapper = await mountWithOverflow(400, 200, 0, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      // Ratio = 200/400 = 0.5, trackHeight = 200, thumbHeight = 100
      expect(style).toContain('height: 100px');
    });

    it('thumb height is at least 24px (min-height)', async () => {
      wrapper = await mountWithOverflow(2000, 50, 0, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      expect(style).toContain('height: 24px');
    });
  });

  describe('thumb position on scroll', () => {
    it('sets thumb top to 0 when scrolled to top', async () => {
      wrapper = await mountWithOverflow(400, 200, 0, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      expect(style).toContain('top: 0px');
    });

    it('updates thumb top when scrolled partway down', async () => {
      wrapper = await mountWithOverflow(400, 200, 100, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      // maxScroll=200, ratio=100/200=0.5, thumbHeight=100, maxThumbTop=100, top=50
      expect(style).toContain('top: 50px');
    });
  });

  describe('props', () => {
    it('defaults showOnHover to true', () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      // Component should not have visible class initially (not hovered)
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
    });

    it('applies show-track class when showTrack is true', () => {
      wrapper = mount(OverlayScrollbar, {
        props: { showTrack: true },
        slots: { default: '<p>content</p>' },
      });
      expect(wrapper.find('.overlay-scrollbar--show-track').exists()).toBe(true);
    });
  });

  describe('hover visibility', () => {
    it('adds visible class on mouseenter when showOnHover is true', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      await wrapper.find('.overlay-scrollbar').trigger('mouseenter');
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);
    });

    it('removes visible class on mouseleave', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      await wrapper.find('.overlay-scrollbar').trigger('mouseenter');
      await wrapper.find('.overlay-scrollbar').trigger('mouseleave');
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
    });

    it('does not add visible class on mouseenter when showOnHover is false', async () => {
      wrapper = mount(OverlayScrollbar, {
        props: { showOnHover: false },
        slots: { default: '<p>content</p>' },
      });
      await wrapper.find('.overlay-scrollbar').trigger('mouseenter');
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
    });
  });

  describe('focus-within visibility', () => {
    it('adds visible class on focusin', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });
      await wrapper.find('.overlay-scrollbar').trigger('focusin');
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);
    });

    it('removes visible class on focusout when focus leaves the container', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });
      await wrapper.find('.overlay-scrollbar').trigger('focusin');
      // relatedTarget null means focus left entirely
      await wrapper.find('.overlay-scrollbar').trigger('focusout', { relatedTarget: null });
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
    });
  });

  describe('unmount cleanup', () => {
    it('unmounts without errors after a drag is started', async () => {
      wrapper = await mountWithOverflow(400, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      if (thumb.exists()) {
        await thumb.trigger('mousedown', { clientY: 50 });
      }
      // Should not throw
      expect(() => wrapper.unmount()).not.toThrow();
    });
  });
});

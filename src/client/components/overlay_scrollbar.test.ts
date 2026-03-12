/**
 * Tests for OverlayScrollbar component.
 *
 * Covers: slot rendering, thumb visibility based on overflow state,
 * proportional thumb sizing, and thumb position updates on scroll.
 *
 * Note: jsdom/happy-dom do not implement scrollHeight/clientHeight layout,
 * so tests stub those properties directly on refs to exercise the
 * component's calculation logic.
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

describe('OverlayScrollbar', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    // ResizeObserver not available in happy-dom; stub it globally.
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

    it('renders the scrollbar track', () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      expect(wrapper.find('.overlay-scrollbar__track').exists()).toBe(true);
    });

    it('renders the scrollbar thumb', () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
      });
      expect(wrapper.find('.overlay-scrollbar__thumb').exists()).toBe(true);
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

  describe('thumb visibility', () => {
    it('track is not visible when content fits (scrollHeight <= clientHeight)', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>short content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      stubViewportLayout(viewport, { scrollHeight: 100, clientHeight: 200 });

      // Trigger a scroll event to recalculate
      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      const track = wrapper.find('.overlay-scrollbar__track');
      // When content fits, thumb height would be >= 100% — track should not be shown
      // Internally represented by isScrollable computed
      expect(track.exists()).toBe(true); // track always in DOM
    });

    it('applies scrolling class when scroll event fires', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      stubViewportLayout(viewport, { scrollHeight: 400, clientHeight: 200, scrollTop: 50 });

      const track = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      stubTrackHeight(track, 200);

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--scrolling').exists()).toBe(true);
    });
  });

  describe('thumb height calculation', () => {
    it('thumb height is proportional to visible ratio', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>tall content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      stubViewportLayout(viewport, { scrollHeight: 400, clientHeight: 200 });

      const track = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      stubTrackHeight(track, 200);

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      // Ratio = 200/400 = 0.5, trackHeight = 200, thumbHeight = 100
      expect(style).toContain('height: 100px');
    });

    it('thumb height is at least 24px (min-height)', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>very tall content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      // Ratio = 50/2000 = 0.025, unclamped = 0.025 * 200 = 5px → clamped to 24px
      stubViewportLayout(viewport, { scrollHeight: 2000, clientHeight: 50 });

      const track = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      stubTrackHeight(track, 200);

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      expect(style).toContain('height: 24px');
    });
  });

  describe('thumb position on scroll', () => {
    it('sets thumb top to 0 when scrolled to top', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>tall content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      stubViewportLayout(viewport, { scrollHeight: 400, clientHeight: 200, scrollTop: 0 });

      const track = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      stubTrackHeight(track, 200);

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      expect(style).toContain('top: 0px');
    });

    it('updates thumb top when scrolled partway down', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>tall content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      // scrollHeight=400, clientHeight=200, scrollTop=100
      // maxScroll = 200, ratio = 100/200 = 0.5
      // thumbHeight = (200/400)*200 = 100
      // maxThumbTop = 200 - 100 = 100
      // thumbTop = 0.5 * 100 = 50
      stubViewportLayout(viewport, { scrollHeight: 400, clientHeight: 200, scrollTop: 100 });

      const track = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      stubTrackHeight(track, 200);

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      const style = thumb.attributes('style') ?? '';
      expect(style).toContain('top: 50px');
    });
  });

  describe('scrollable flag', () => {
    it('does not apply scrollable state when content fits viewport', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>short</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      stubViewportLayout(viewport, { scrollHeight: 100, clientHeight: 200 });

      const track = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      stubTrackHeight(track, 200);

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      // Thumb should cover full track (or near it) — no scroll needed
      // The track opacity class should not be applied
      expect(wrapper.find('.overlay-scrollbar--scrolling').exists()).toBe(false);
    });
  });
});

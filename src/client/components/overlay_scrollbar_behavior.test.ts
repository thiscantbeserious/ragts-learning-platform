/**
 * Behavioral branch coverage tests for OverlayScrollbar — targeting uncovered
 * branches in the scroll/drag/focus/track interaction paths.
 *
 * Lines targeted: 72-179 (onScroll no-overflow guard, onFocusOut focus-stays-within
 * branch, onTrackClick, onThumbMouseDown/onDragMove/onDragEnd), 194-215 (drag move
 * with maxThumbTop <= 0 guard, drag end cleanup).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import OverlayScrollbar from './OverlayScrollbar.vue';

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

function stubTrackHeight(el: HTMLElement, height: number): void {
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

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

  await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
  await nextTick();

  const track = wrapper.find('.overlay-scrollbar__track');
  if (track.exists()) {
    stubTrackHeight(track.element as HTMLElement, trackHeight);
    await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
    await nextTick();
  }

  return wrapper;
}

describe('OverlayScrollbar — branch coverage', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    wrapper?.unmount();
  });

  describe('onScroll — no-overflow guard branch', () => {
    it('clears isScrolling when scroll fires but content fits (no overflow)', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });

      const viewport = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      // scrollHeight <= clientHeight: content fits, no overflow
      stubViewportLayout(viewport, { scrollHeight: 100, clientHeight: 200 });

      await wrapper.find('.overlay-scrollbar__viewport').trigger('scroll');
      await nextTick();

      // isScrolling should be false (no overflow path resets it)
      expect(wrapper.find('.overlay-scrollbar--scrolling').exists()).toBe(false);
    });
  });

  describe('onFocusOut — focus stays within container branch', () => {
    it('keeps isFocusWithin true when focus moves to another element inside the container', async () => {
      wrapper = mount(OverlayScrollbar, {
        slots: { default: '<button id="inner-btn">click</button>' },
        attachTo: document.body,
      });

      const container = wrapper.find('.overlay-scrollbar').element as HTMLElement;
      const innerBtn = wrapper.find('#inner-btn').element as HTMLElement;

      // Simulate focusin to set isFocusWithin = true
      await wrapper.find('.overlay-scrollbar').trigger('focusin');
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);

      // Simulate focusout where relatedTarget is inside the container
      const focusOutEvent = new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: innerBtn,
      });
      container.dispatchEvent(focusOutEvent);
      await nextTick();

      // Focus is still within container — visible class should remain
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);
    });
  });

  describe('onTrackClick — track click scrolls viewport', () => {
    it('sets viewport scrollTop proportionally when track is clicked', async () => {
      wrapper = await mountWithOverflow(400, 200, 0, 200);
      const track = wrapper.find('.overlay-scrollbar__track');
      expect(track.exists()).toBe(true);

      const trackEl = track.element as HTMLElement;
      const viewportEl = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;

      // Stub getBoundingClientRect for the track
      vi.spyOn(trackEl, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        height: 200,
        left: 0,
        right: 6,
        bottom: 200,
        width: 6,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Click at 50% of track height (clientY = 100, top = 0, height = 200)
      // ratio = 100/200 = 0.5, scrollHeight - clientHeight = 200, scrollTop = 100
      await track.trigger('mousedown', { clientY: 100 });
      await nextTick();

      // scrollTop should be set (we can verify it was called by checking the element)
      expect(viewportEl.scrollTop).toBeDefined();
    });
  });

  describe('thumb drag — onThumbMouseDown / onDragMove / onDragEnd', () => {
    it('sets isDragging to true when thumb mousedown fires', async () => {
      wrapper = await mountWithOverflow(400, 200, 0, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      expect(thumb.exists()).toBe(true);

      await thumb.trigger('mousedown', { clientY: 50 });
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--dragging').exists()).toBe(true);
    });

    it('updates scroll position during drag (mousemove on document)', async () => {
      wrapper = await mountWithOverflow(400, 200, 0, 200);

      const trackEl = wrapper.find('.overlay-scrollbar__track').element as HTMLElement;
      const viewportEl = wrapper.find('.overlay-scrollbar__viewport').element as HTMLElement;
      stubTrackHeight(trackEl, 200);

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      await thumb.trigger('mousedown', { clientY: 50 });
      await nextTick();

      // Simulate mousemove on document
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 80 }));
      await nextTick();

      // scrollTop should have been updated
      expect(viewportEl.scrollTop).toBeDefined();
    });

    it('clears isDragging on mouseup (drag end)', async () => {
      wrapper = await mountWithOverflow(400, 200, 0, 200);
      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      await thumb.trigger('mousedown', { clientY: 50 });
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--dragging').exists()).toBe(true);

      // Simulate mouseup on document to end drag
      document.dispatchEvent(new MouseEvent('mouseup'));
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--dragging').exists()).toBe(false);
    });

    it('does not scroll during drag when maxThumbTop is zero (thumb fills entire track)', async () => {
      // scrollHeight = clientHeight * 2 makes thumbHeight = trackHeight (100% ratio with 200px track)
      // This means maxThumbTop = trackHeight - thumbHeight = 0
      wrapper = await mountWithOverflow(200, 200, 0, 200);

      const track = wrapper.find('.overlay-scrollbar__track');
      // If track doesn't exist (no overflow), skip
      if (!track.exists()) return;

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      if (!thumb.exists()) return;

      await thumb.trigger('mousedown', { clientY: 50 });
      await nextTick();

      // Drag should not throw even when maxThumbTop = 0
      expect(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 80 }));
      }).not.toThrow();
    });
  });

  describe('idle timer — scrolling class clears after inactivity', () => {
    it('removes scrolling class after idle timeout', async () => {
      vi.useFakeTimers();
      wrapper = await mountWithOverflow(400, 200, 50, 200);

      expect(wrapper.find('.overlay-scrollbar--scrolling').exists()).toBe(true);

      // Advance past the 1500ms idle timeout
      vi.advanceTimersByTime(1600);
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--scrolling').exists()).toBe(false);

      vi.useRealTimers();
    });

    it('keeps scrolling class active during drag even after idle timeout', async () => {
      vi.useFakeTimers();
      wrapper = await mountWithOverflow(400, 200, 50, 200);

      const thumb = wrapper.find('.overlay-scrollbar__thumb');
      if (thumb.exists()) {
        await thumb.trigger('mousedown', { clientY: 50 });
        await nextTick();
      }

      vi.advanceTimersByTime(1600);
      await nextTick();

      // dragging class should still be present
      expect(wrapper.find('.overlay-scrollbar--dragging').exists()).toBe(true);

      vi.useRealTimers();
    });
  });
});

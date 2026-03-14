/**
 * Branch coverage tests for OverlayScrollbar — prop variant branches.
 *
 * Lines targeted:
 *   72-179 — onContainerEnter: showOnHover=false branch (isHovered not set, recalculate skipped)
 *   194-215 — showTrack prop: adds --show-track modifier class when true
 *
 * These target the conditional paths for the showOnHover and showTrack props.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import OverlayScrollbar from './OverlayScrollbar.vue';

function setupGlobals() {
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
}

describe('OverlayScrollbar — showOnHover prop variants', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    setupGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    wrapper?.unmount();
  });

  describe('showOnHover=true (default)', () => {
    it('adds --visible class when mouse enters container with showOnHover=true', async () => {
      wrapper = mount(OverlayScrollbar, {
        props: { showOnHover: true },
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });

      await wrapper.find('.overlay-scrollbar').trigger('mouseenter');
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);
    });

    it('removes --visible class when mouse leaves with showOnHover=true', async () => {
      wrapper = mount(OverlayScrollbar, {
        props: { showOnHover: true },
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });

      await wrapper.find('.overlay-scrollbar').trigger('mouseenter');
      await nextTick();
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);

      await wrapper.find('.overlay-scrollbar').trigger('mouseleave');
      await nextTick();
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
    });
  });

  describe('showOnHover=false', () => {
    it('does NOT add --visible class when mouse enters container with showOnHover=false', async () => {
      wrapper = mount(OverlayScrollbar, {
        props: { showOnHover: false },
        slots: { default: '<p>content</p>' },
        attachTo: document.body,
      });

      // The container has no hover or focus, so --visible should be absent
      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);

      // Trigger mouseenter — with showOnHover=false, isHovered should remain false
      await wrapper.find('.overlay-scrollbar').trigger('mouseenter');
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
    });

    it('still shows --visible class via focusin even when showOnHover=false', async () => {
      wrapper = mount(OverlayScrollbar, {
        props: { showOnHover: false },
        slots: { default: '<button>focusable</button>' },
        attachTo: document.body,
      });

      // Focus within should still show scrollbar even with showOnHover=false
      await wrapper.find('.overlay-scrollbar').trigger('focusin');
      await nextTick();

      expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);
    });
  });
});

describe('OverlayScrollbar — showTrack prop', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    setupGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    wrapper?.unmount();
  });

  it('does NOT apply --show-track class when showTrack is false (default)', () => {
    wrapper = mount(OverlayScrollbar, {
      props: { showTrack: false },
      slots: { default: '<p>content</p>' },
      attachTo: document.body,
    });
    expect(wrapper.find('.overlay-scrollbar--show-track').exists()).toBe(false);
  });

  it('applies --show-track class when showTrack is true', () => {
    wrapper = mount(OverlayScrollbar, {
      props: { showTrack: true },
      slots: { default: '<p>content</p>' },
      attachTo: document.body,
    });
    expect(wrapper.find('.overlay-scrollbar--show-track').exists()).toBe(true);
  });
});

describe('OverlayScrollbar — onFocusOut: focus leaves container entirely', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    setupGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    wrapper?.unmount();
  });

  it('clears isFocusWithin when focus moves outside the container', async () => {
    wrapper = mount(OverlayScrollbar, {
      slots: { default: '<button id="inner">click</button>' },
      attachTo: document.body,
    });

    const container = wrapper.find('.overlay-scrollbar').element as HTMLElement;

    // Set focus within
    await wrapper.find('.overlay-scrollbar').trigger('focusin');
    expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);

    // Focus out to an element outside the container (relatedTarget = null)
    const focusOutEvent = new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: null,
    });
    container.dispatchEvent(focusOutEvent);
    await nextTick();

    // Focus has left the container — visible class should be removed
    expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);
  });

  it('clears isFocusWithin when relatedTarget is outside container', async () => {
    // Create an external button outside the component
    const externalBtn = document.createElement('button');
    externalBtn.textContent = 'External';
    document.body.appendChild(externalBtn);

    wrapper = mount(OverlayScrollbar, {
      slots: { default: '<button>inner</button>' },
      attachTo: document.body,
    });

    const container = wrapper.find('.overlay-scrollbar').element as HTMLElement;

    await wrapper.find('.overlay-scrollbar').trigger('focusin');
    expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(true);

    // Focus moves to external button — relatedTarget is outside container
    const focusOutEvent = new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: externalBtn,
    });
    container.dispatchEvent(focusOutEvent);
    await nextTick();

    expect(wrapper.find('.overlay-scrollbar--visible').exists()).toBe(false);

    externalBtn.remove();
  });
});

/**
 * Tests for useActiveSection composable.
 *
 * Covers:
 * - IntersectionObserver mode (small/flat sessions): initial state, entering/leaving
 *   viewport, multiple sections, element list reactivity, cleanup.
 * - Scroll-position mode (large/virtual sessions): derives active section from
 *   scroll position + item offsets, updates on scroll, cleans up scroll listener.
 *
 * IntersectionObserver is not available in happy-dom so we stub it globally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useActiveSection } from './useActiveSection.js';
import type { SectionOffset } from './useActiveSection.js';

// ---------------------------------------------------------------------------
// IntersectionObserver mock
// ---------------------------------------------------------------------------

type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

interface MockObserver {
  callback: IntersectionCallback;
  elements: Set<Element>;
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

let observers: MockObserver[] = [];

function makeMockObserver(callback: IntersectionCallback): MockObserver {
  const elements = new Set<Element>();
  const mock: MockObserver = {
    callback,
    elements,
    observe: vi.fn((el: Element) => elements.add(el)),
    unobserve: vi.fn((el: Element) => elements.delete(el)),
    disconnect: vi.fn(() => elements.clear()),
  };
  observers.push(mock);
  return mock;
}

function stubIntersectionObserver(): void {
  // Must use a regular function (not arrow) so it can be called with `new`.
  const MockCtor = function (this: unknown, callback: IntersectionCallback) {
    const mock = makeMockObserver(callback);
    (this as Record<string, unknown>)['observe'] = mock.observe;
    (this as Record<string, unknown>)['unobserve'] = mock.unobserve;
    (this as Record<string, unknown>)['disconnect'] = mock.disconnect;
  };
  vi.stubGlobal('IntersectionObserver', MockCtor);
}

/** Simulate an element entering or leaving the viewport. */
function triggerIntersection(observer: MockObserver, el: Element, isIntersecting: boolean): void {
  observer.callback([
    {
      target: el,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry,
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-section-id', id);
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActiveSection', () => {
  beforeEach(() => {
    observers = [];
    stubIntersectionObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with activeId as null when no elements are provided', () => {
      const { activeId } = useActiveSection(ref([]));
      expect(activeId.value).toBeNull();
    });

    it('starts with activeId as null before any intersection fires', () => {
      const el = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el }]);
      const { activeId } = useActiveSection(elements);
      expect(activeId.value).toBeNull();
    });
  });

  describe('intersection tracking', () => {
    it('sets activeId when a section element enters the viewport', async () => {
      const el = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el }]);
      const { activeId } = useActiveSection(elements);

      await nextTick();
      const observer = observers[0];
      expect(observer).toBeDefined();
      triggerIntersection(observer!, el, true);

      expect(activeId.value).toBe('sec-1');
    });

    it('clears activeId when a section element leaves the viewport', async () => {
      const el = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el }]);
      const { activeId } = useActiveSection(elements);

      await nextTick();
      const observer = observers[0];
      triggerIntersection(observer!, el, true);
      expect(activeId.value).toBe('sec-1');

      triggerIntersection(observer!, el, false);
      expect(activeId.value).toBeNull();
    });

    it('switches activeId when a second section enters and the first leaves', async () => {
      const el1 = makeElement('sec-1');
      const el2 = makeElement('sec-2');
      const elements = ref([
        { id: 'sec-1', el: el1 },
        { id: 'sec-2', el: el2 },
      ]);
      const { activeId } = useActiveSection(elements);

      await nextTick();
      const observer = observers[0];
      triggerIntersection(observer!, el1, true);
      expect(activeId.value).toBe('sec-1');

      triggerIntersection(observer!, el2, true);
      triggerIntersection(observer!, el1, false);
      expect(activeId.value).toBe('sec-2');
    });

    it('retains first active section when multiple sections are intersecting simultaneously', async () => {
      const el1 = makeElement('sec-1');
      const el2 = makeElement('sec-2');
      const elements = ref([
        { id: 'sec-1', el: el1 },
        { id: 'sec-2', el: el2 },
      ]);
      const { activeId } = useActiveSection(elements);

      await nextTick();
      const observer = observers[0];
      triggerIntersection(observer!, el1, true);
      triggerIntersection(observer!, el2, true);

      // sec-1 was first to intersect — it stays active until it leaves
      expect(activeId.value).toBe('sec-1');
    });
  });

  describe('element list reactivity', () => {
    it('observes all initial elements', async () => {
      const el1 = makeElement('sec-1');
      const el2 = makeElement('sec-2');
      const elements = ref([
        { id: 'sec-1', el: el1 },
        { id: 'sec-2', el: el2 },
      ]);
      useActiveSection(elements);

      await nextTick();
      const observer = observers[0];
      expect(observer?.observe).toHaveBeenCalledWith(el1);
      expect(observer?.observe).toHaveBeenCalledWith(el2);
    });

    it('observes newly added elements after the list changes', async () => {
      const el1 = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el: el1 }]);
      useActiveSection(elements);

      await nextTick();
      const firstObserver = observers[0];
      expect(firstObserver?.observe).toHaveBeenCalledWith(el1);

      const el2 = makeElement('sec-2');
      elements.value = [{ id: 'sec-1', el: el1 }, { id: 'sec-2', el: el2 }];
      await nextTick();

      // A new observer is created when the list changes
      const secondObserver = observers[1];
      expect(secondObserver?.observe).toHaveBeenCalledWith(el1);
      expect(secondObserver?.observe).toHaveBeenCalledWith(el2);
    });

    it('disconnects the old observer when the list changes', async () => {
      const el1 = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el: el1 }]);
      useActiveSection(elements);

      await nextTick();
      const firstObserver = observers[0];

      elements.value = [];
      await nextTick();

      expect(firstObserver?.disconnect).toHaveBeenCalled();
    });

    it('clears visible set when the list changes', async () => {
      const el = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el }]);
      const { activeId } = useActiveSection(elements);

      await nextTick();
      const firstObserver = observers[0];
      triggerIntersection(firstObserver!, el, true);
      expect(activeId.value).toBe('sec-1');

      // Replace list — visible set should be cleared, activeId reset
      elements.value = [];
      await nextTick();

      expect(activeId.value).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('exposes a cleanup function that disconnects the observer', async () => {
      const el = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el }]);
      const { cleanup } = useActiveSection(elements);

      await nextTick();
      const observer = observers[0];

      cleanup();
      expect(observer?.disconnect).toHaveBeenCalled();
    });

    it('cleanup sets activeId back to null', async () => {
      const el = makeElement('sec-1');
      const elements = ref([{ id: 'sec-1', el }]);
      const { activeId, cleanup } = useActiveSection(elements);

      await nextTick();
      const observer = observers[0];
      triggerIntersection(observer!, el, true);
      expect(activeId.value).toBe('sec-1');

      cleanup();
      expect(activeId.value).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Scroll-position mode tests
// ---------------------------------------------------------------------------

/**
 * Creates a minimal HTMLElement mock that supports scroll events and scrollTop.
 * Used to simulate scroll container behaviour without a real DOM.
 */
function makeScrollContainer(initialScrollTop = 0): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', {
    writable: true,
    value: initialScrollTop,
  });
  return el;
}

/** Build a simple ordered list of section offsets (non-overlapping). */
function makeOffsets(ids: string[], sectionHeight = 500): SectionOffset[] {
  return ids.map((id, i) => ({
    id,
    start: i * sectionHeight,
    end: (i + 1) * sectionHeight,
  }));
}

describe('useActiveSection — scroll-position mode', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets activeId to the first section when scrollTop is 0', async () => {
    const scrollEl = makeScrollContainer(0);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const offsets = makeOffsets(['a', 'b', 'c']);
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    expect(activeId.value).toBe('a');
  });

  it('sets activeId to the section whose start is <= scrollTop', async () => {
    const scrollEl = makeScrollContainer(600);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const offsets = makeOffsets(['a', 'b', 'c']);
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    // Section b starts at 500, c starts at 1000 — scrollTop 600 is in b
    expect(activeId.value).toBe('b');
  });

  it('updates activeId when scroll event fires', async () => {
    const scrollEl = makeScrollContainer(0);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const offsets = makeOffsets(['a', 'b', 'c']);
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    expect(activeId.value).toBe('a');

    // Simulate scrolling to section c (start = 1000)
    (scrollEl as unknown as Record<string, number>)['scrollTop'] = 1050;
    scrollEl.dispatchEvent(new Event('scroll'));

    expect(activeId.value).toBe('c');
  });

  it('returns first section id when scrollTop is above all section starts', async () => {
    const scrollEl = makeScrollContainer(0);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const offsets: SectionOffset[] = [
      { id: 'x', start: 100, end: 600 },
      { id: 'y', start: 600, end: 1200 },
    ];
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    // scrollTop 0 is above section x start (100) — falls back to first
    expect(activeId.value).toBe('x');
  });

  it('returns null when offsets list is empty', async () => {
    const scrollEl = makeScrollContainer(0);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => [],
    });

    await nextTick();
    expect(activeId.value).toBeNull();
  });

  it('attaches scroll listener when scrollElement becomes non-null', async () => {
    const scrollElement = ref<HTMLElement | null>(null);
    const offsets = makeOffsets(['a', 'b']);
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    // No element yet — activeId not yet set
    expect(activeId.value).toBeNull();

    const scrollEl = makeScrollContainer(500);
    scrollElement.value = scrollEl;
    await nextTick();

    // After element assigned, initial computation runs
    expect(activeId.value).toBe('b');
  });

  it('cleanup removes scroll listener and resets activeId', async () => {
    const scrollEl = makeScrollContainer(500);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const offsets = makeOffsets(['a', 'b', 'c']);
    const { activeId, cleanup } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    expect(activeId.value).toBe('b');

    cleanup();
    expect(activeId.value).toBeNull();

    // Scroll event after cleanup should not update activeId
    (scrollEl as unknown as Record<string, number>)['scrollTop'] = 1050;
    scrollEl.dispatchEvent(new Event('scroll'));
    expect(activeId.value).toBeNull();
  });

  it('uses last section when scrollTop exceeds all section starts', async () => {
    const scrollEl = makeScrollContainer(9999);
    const scrollElement = ref<HTMLElement | null>(scrollEl);
    const offsets = makeOffsets(['a', 'b', 'c']);
    const { activeId } = useActiveSection(ref([]), {
      scrollElement,
      getItemOffsets: () => offsets,
    });

    await nextTick();
    expect(activeId.value).toBe('c');
  });
});

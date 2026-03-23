/**
 * useActiveSection — scrollspy composable for session sections.
 *
 * Supports two detection modes:
 *
 * 1. **Scroll-position mode** (for large/virtual sessions):
 *    Pass `scrollElement` and `getItemOffsets` to derive the active section
 *    from scroll position against known item offsets. This is reliable with
 *    TanStack Virtual because it doesn't depend on DOM element presence.
 *
 * 2. **IntersectionObserver mode** (for small/flat sessions):
 *    Omit `scrollElement` / `getItemOffsets`. Observes registered `SectionEntry`
 *    elements relative to the document viewport and picks the topmost visible one.
 *
 * Call `cleanup()` (or rely on automatic `onUnmounted`) to stop observation.
 */

import { ref, watch, onUnmounted, getCurrentInstance, type Ref } from 'vue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A section entry pairing a section id with its DOM element. */
export interface SectionEntry {
  id: string;
  el: Element;
}

/** A section's start/end pixel offsets within the scroll container. */
export interface SectionOffset {
  id: string;
  start: number;
  end: number;
}

/** Shape returned by useActiveSection. */
export interface ActiveSectionState {
  /** The id of the currently visible section, or null if none. */
  activeId: Ref<string | null>;
  /** Disconnect the observer and reset activeId. */
  cleanup: () => void;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export interface ActiveSectionOptions {
  /**
   * The scroll container element (OverlayScrollbar viewport).
   * When provided together with getItemOffsets, enables scroll-position mode.
   */
  scrollElement?: Ref<HTMLElement | null>;
  /**
   * Returns the ordered list of section offsets from the virtualizer.
   * Required in scroll-position mode.
   */
  getItemOffsets?: () => SectionOffset[];
}

/**
 * Tracks the active section for scrollspy.
 *
 * In scroll-position mode (scrollElement + getItemOffsets provided):
 *   Listens to scroll events and derives the active section from scrollTop
 *   vs item start offsets. Works with virtual DOM — no stale element risk.
 *
 * In IntersectionObserver mode (no scroll options):
 *   Observes registered section elements and picks the topmost visible one.
 */
export function useActiveSection(
  elements: Ref<SectionEntry[]>,
  options: ActiveSectionOptions = {}
): ActiveSectionState {
  const activeId = ref<string | null>(null);

  const { scrollElement, getItemOffsets } = options;

  const useScrollPositionMode = !!(scrollElement && getItemOffsets);

  if (useScrollPositionMode) {
    return setupScrollPositionMode(elements, activeId, scrollElement!, getItemOffsets!);
  }

  return setupIntersectionMode(elements, activeId);
}

// ---------------------------------------------------------------------------
// Scroll-position mode
// ---------------------------------------------------------------------------

/**
 * Derives active section from scroll position vs virtualizer item offsets.
 * Attaches/detaches a scroll listener when the scroll element changes.
 */
function setupScrollPositionMode(
  elements: Ref<SectionEntry[]>,
  activeId: Ref<string | null>,
  scrollElement: Ref<HTMLElement | null>,
  getItemOffsets: () => SectionOffset[]
): ActiveSectionState {
  let currentEl: HTMLElement | null = null;

  function onScroll(): void {
    const el = scrollElement.value;
    if (!el) return;
    activeId.value = findActiveSectionByScroll(el.scrollTop, getItemOffsets());
  }

  function attach(el: HTMLElement | null): void {
    if (currentEl) {
      currentEl.removeEventListener('scroll', onScroll);
    }
    currentEl = el;
    if (el) {
      el.addEventListener('scroll', onScroll, { passive: true });
      // Compute initial active section.
      onScroll();
    }
  }

  watch(scrollElement, (el) => { attach(el); }, { immediate: true });

  // Re-evaluate when elements list changes (session change resets entries).
  watch(elements, () => { onScroll(); });

  function cleanup(): void {
    if (currentEl) {
      currentEl.removeEventListener('scroll', onScroll);
      currentEl = null;
    }
    activeId.value = null;
  }

  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return { activeId, cleanup };
}

/**
 * Given scrollTop and an ordered list of section offsets, returns the id of
 * the section whose start is <= scrollTop and is closest to the scroll top.
 * Falls back to the first section if scrollTop is above all sections.
 */
function findActiveSectionByScroll(
  scrollTop: number,
  offsets: SectionOffset[]
): string | null {
  if (offsets.length === 0) return null;

  let active: SectionOffset | null = null;
  for (const offset of offsets) {
    if (offset.start <= scrollTop) {
      active = offset;
    } else {
      break;
    }
  }

  // If scrolled above all sections, pick the first one.
  return active?.id ?? offsets[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// IntersectionObserver mode
// ---------------------------------------------------------------------------

/**
 * Observes section elements via IntersectionObserver and picks the topmost
 * visible section as the active one. Suitable for small (non-virtual) sessions.
 */
function setupIntersectionMode(
  elements: Ref<SectionEntry[]>,
  activeId: Ref<string | null>
): ActiveSectionState {
  /** Set of section ids currently intersecting the viewport. */
  const visibleIds = new Set<string>();

  let observer: IntersectionObserver | null = null;

  /** Recompute activeId from the current visible set and element order. */
  function recomputeActive(): void {
    const ordered = elements.value;
    for (const entry of ordered) {
      if (visibleIds.has(entry.id)) {
        activeId.value = entry.id;
        return;
      }
    }
    activeId.value = null;
  }

  /** Handle IntersectionObserver callback entries. */
  function handleEntries(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const id = findIdForElement(entry.target);
      if (id === null) continue;
      if (entry.isIntersecting) {
        visibleIds.add(id);
      } else {
        visibleIds.delete(id);
      }
    }
    recomputeActive();
  }

  /** Look up the section id for a given element. */
  function findIdForElement(target: Element): string | null {
    const entry = elements.value.find((e) => e.el === target);
    return entry?.id ?? null;
  }

  function disconnectObserver(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function connectObserver(): void {
    disconnectObserver();
    visibleIds.clear();
    activeId.value = null;

    const entries = elements.value;
    if (entries.length === 0) return;

    observer = new IntersectionObserver(handleEntries, { threshold: 0 });
    for (const entry of entries) {
      observer.observe(entry.el);
    }
  }

  watch(elements, () => { connectObserver(); }, { immediate: true });

  function cleanup(): void {
    disconnectObserver();
    visibleIds.clear();
    activeId.value = null;
  }

  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return { activeId, cleanup };
}

/**
 * useSectionVirtualizer — TanStack Virtual wrapper for section-level virtualization.
 *
 * Virtualizes a flat list of sections using the OverlayScrollbar viewport as the
 * scroll element. Each virtual item corresponds to one full section (header + content).
 *
 * estimateSize uses lineCount to provide a close initial height estimate,
 * minimizing scroll-height jumps when TanStack measures real heights via measureElement.
 *
 * overscan is set to 3 — three extra sections above and below the viewport are
 * kept in the DOM for smooth scrolling without render gaps.
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/vue-virtual';
import type { SectionMetadata } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Constants (exported for test assertions)
// ---------------------------------------------------------------------------

/**
 * Height of a section header row in pixels.
 * Measured from rendered DOM: button with padding var(--rhythm-half) = 9px top/bottom,
 * line-height var(--lh-base) = 18px, plus 2px border = 9 + 18 + 9 + 2 + 4 = 42px.
 */
export const SECTION_HEADER_HEIGHT = 42;

/**
 * Approximate height of a single terminal line in pixels.
 * Based on font-size 14px × line-height 1.5 = 21px.
 */
export const LINE_HEIGHT = 21;

/**
 * Top + bottom padding of .terminal-snapshot in pixels (var(--space-3) = 12px each side).
 * Added to estimate when a section has content lines.
 */
export const SNAPSHOT_PADDING = 24;

/** Number of extra sections to render above/below the visible viewport. */
const OVERSCAN = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by useSectionVirtualizer. */
export interface SectionVirtualizerState {
  /** The underlying TanStack Virtualizer instance (reactive ref). */
  virtualizer: Ref<Virtualizer<Element, Element>>;
  /** The current list of virtual items to render (derived from virtualizer). */
  virtualItems: ComputedRef<VirtualItem[]>;
  /** Scroll the viewport to the section with the given id. */
  scrollToSection: (sectionId: string) => void;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Wraps useVirtualizer for section-level virtual scrolling.
 *
 * @param sections - Reactive array of section metadata (source of count + estimateSize).
 * @param scrollElement - Ref to the OverlayScrollbar viewport element (scroll container).
 */
export function useSectionVirtualizer(
  sections: Ref<SectionMetadata[]>,
  scrollElement: Ref<HTMLElement | null>,
): SectionVirtualizerState {
  const virtualizer = useVirtualizer(
    computed(() => ({
      count: sections.value.length,
      getScrollElement: () => scrollElement.value as Element | null,
      estimateSize: (index: number) => estimateSectionHeight(sections.value, index),
      overscan: OVERSCAN,
    }))
  );

  const virtualItems: ComputedRef<VirtualItem[]> = computed(
    () => virtualizer.value.getVirtualItems()
  );

  /**
   * Track whether a programmatic scroll is in progress to suppress
   * the virtualizer's scroll correction loop for bottom items.
   */
  let scrollLockTimer: ReturnType<typeof setTimeout> | null = null;

  function scrollToSection(sectionId: string): void {
    const index = sections.value.findIndex((s) => s.id === sectionId);
    if (index < 0) return;

    const el = scrollElement.value;

    // For items in the last ~10, use manual scrollTop to avoid oscillation.
    // scrollToIndex causes measure → height change → scroll correction loops
    // for items near the end that can't be scrolled to 'start' position.
    const totalItems = sections.value.length;
    if (el && index > totalItems - 10) {
      const offset = virtualizer.value.getOffsetForIndex(index, 'start')?.[0] ?? 0;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.min(offset, maxScroll);
      // Debounce to prevent rapid re-scrolls during virtualizer measurement
      if (scrollLockTimer) clearTimeout(scrollLockTimer);
      scrollLockTimer = setTimeout(() => { scrollLockTimer = null; }, 500);
      return;
    }

    virtualizer.value.scrollToIndex(index, { align: 'start' });
  }

  return { virtualizer, virtualItems, scrollToSection };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Minimum height for sections with lineCount=0 or unknown.
 * Measured from real DOM: collapsed section with loaded empty content renders ~149px.
 * Using the actual measured value prevents scrollHeight oscillation when these
 * sections enter/leave the virtualizer's overscan window.
 */
export const MIN_SECTION_HEIGHT = 149;

/**
 * Estimates the pixel height of a section by its line count.
 * Accounts for header, terminal-snapshot container padding, and per-line height.
 * Uses a measured minimum for sections with unknown/zero line count.
 */
function estimateSectionHeight(sections: SectionMetadata[], index: number): number {
  const section = sections[index];
  if (!section) return MIN_SECTION_HEIGHT;
  if (section.lineCount <= 0) return MIN_SECTION_HEIGHT;
  return SECTION_HEADER_HEIGHT + SNAPSHOT_PADDING + section.lineCount * LINE_HEIGHT;
}

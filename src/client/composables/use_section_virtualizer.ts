/**
 * useSectionVirtualizer — TanStack Virtual wrapper for section-level virtualization.
 *
 * Virtualizes a flat list of sections using the OverlayScrollbar viewport as the
 * scroll element. Each virtual item corresponds to one full section (header + content).
 *
 * Layer 1 performance: CSS `content-visibility: auto` on section content containers.
 * Layer 2 performance: This composable — TanStack Virtual virtualizes at section granularity.
 *
 * estimateSize uses lineCount to provide a generous initial height estimate,
 * minimizing upward scroll jumps during dynamic measurement.
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

/** Height of a section header row in pixels. */
export const SECTION_HEADER_HEIGHT = 48;

/**
 * Approximate height of a single terminal line in pixels.
 * Based on 21px line-height with a small buffer.
 */
export const LINE_HEIGHT = 21;

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
    () => virtualizer.value.getVirtualItems() as VirtualItem[]
  );

  function scrollToSection(sectionId: string): void {
    const index = sections.value.findIndex((s) => s.id === sectionId);
    if (index < 0) return;
    virtualizer.value.scrollToIndex(index, { align: 'start' });
  }

  return { virtualizer, virtualItems, scrollToSection };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Estimates the pixel height of a section by its line count.
 * Uses a generous overestimate to reduce upward scroll jump artifacts.
 * Returns at minimum the header height for empty or unknown sections.
 */
function estimateSectionHeight(sections: SectionMetadata[], index: number): number {
  const section = sections[index];
  if (!section) return SECTION_HEADER_HEIGHT;
  return SECTION_HEADER_HEIGHT + section.lineCount * LINE_HEIGHT;
}

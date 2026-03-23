/**
 * useActiveSection — IntersectionObserver-based scrollspy for session sections.
 *
 * Watches a reactive list of `{ id, el }` entries and sets `activeId` to the
 * id of the section element that is currently most visible in the viewport.
 * When the list changes the observer is recreated to reflect new elements.
 * Call `cleanup()` (or rely on automatic `onUnmounted` registration) to
 * disconnect the observer and reset state.
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

/**
 * Observes a reactive list of section elements and tracks which one is
 * currently intersecting the viewport. Only one section is active at a time;
 * the first-entered section wins until it leaves.
 */
export function useActiveSection(
  elements: Ref<SectionEntry[]>
): ActiveSectionState {
  const activeId = ref<string | null>(null);
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

  /** Disconnect the current observer if one exists. */
  function disconnectObserver(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /** Create a fresh observer and observe all current elements. */
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

  // Recreate observer whenever the elements list changes.
  watch(elements, () => { connectObserver(); }, { immediate: true });

  /** Disconnect observer and reset reactive state. */
  function cleanup(): void {
    disconnectObserver();
    visibleIds.clear();
    activeId.value = null;
  }

  // Auto-cleanup on component unmount when called inside a setup context.
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return { activeId, cleanup };
}

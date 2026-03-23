<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import SessionContent from '../components/SessionContent.vue';
import SectionNavigator from '../components/SectionNavigator.vue';
import SkeletonMain from '../components/SkeletonMain.vue';
import { useSessionV2 } from '../composables/use_session.js';
import { useActiveSection, type SectionEntry } from '../composables/useActiveSection.js';
import { useSectionVirtualizer } from '../composables/use_section_virtualizer.js';
import { SMALL_SESSION_THRESHOLD } from '../../shared/constants.js';
import type { SectionOffset } from '../composables/useActiveSection.js';

/**
 * SessionDetailView renders a session's content in the spatial shell main area.
 *
 * For large sessions (sectionCount > SMALL_SESSION_THRESHOLD):
 *   - Activates useSectionVirtualizer for section-level DOM virtualization.
 *   - Shows SectionNavigator in an aside column with scrollspy tracking.
 *   - Wires prefetch via fetchSectionContent on navigator pill hover.
 *
 * For small sessions:
 *   - Renders all sections directly via SessionContent (no virtualizer/navigator).
 *
 * useSessionV2 provides metadata-first loading: section metadata arrives first,
 * then content is fetched per-section on demand (cache-backed).
 */

const route = useRoute();
const sessionId = computed(() => route.params['id'] as string);

const { sections, loading, error, detectionStatus, fetchSectionContent } =
  useSessionV2(sessionId);

/** True when this session requires the large-session treatment. */
const isLargeSession = computed(() => sections.value.length > SMALL_SESSION_THRESHOLD);

// ---------------------------------------------------------------------------
// Virtualizer — active only for large sessions
// ---------------------------------------------------------------------------

const sessionContentRef = ref<InstanceType<typeof SessionContent> | null>(null);

/**
 * Scroll viewport ref for the virtualizer scroll element.
 * Updated reactively when sessionContentRef resolves.
 * A plain ref is used so useSectionVirtualizer receives the expected Ref type.
 */
const scrollViewport = ref<HTMLElement | null>(null);

watch(sessionContentRef, (content) => {
  scrollViewport.value = content?.scrollViewport ?? null;
}, { immediate: true });

const { virtualizer, virtualItems, scrollToSection } = useSectionVirtualizer(
  sections,
  scrollViewport as Ref<HTMLElement | null>
);

const totalHeight = computed(() =>
  isLargeSession.value ? virtualizer.value.getTotalSize() : 0
);

/**
 * measureElement bound to the virtualizer instance.
 * Passed to SessionContent so each SectionItem's root div is observed
 * for size changes — this makes collapse/expand reflow other sections.
 */
const measureElement = computed(() =>
  isLargeSession.value
    ? (el: Element | null) => { if (el) virtualizer.value.measureElement(el); }
    : null
);

// ---------------------------------------------------------------------------
// Scrollspy — active only for large sessions
// ---------------------------------------------------------------------------

const sectionEntries = ref<SectionEntry[]>([]);

/**
 * Returns ordered section offsets from the virtualizer measurement cache.
 * Used by useActiveSection in scroll-position mode to derive the active section.
 */
function getItemOffsets(): SectionOffset[] {
  const measurements = virtualizer.value.measurementsCache;
  return sections.value.map((section, index) => {
    const m = measurements[index];
    return {
      id: section.id,
      start: m?.start ?? 0,
      end: m?.end ?? 0,
    };
  });
}

const { activeId } = useActiveSection(sectionEntries, {
  scrollElement: scrollViewport as Ref<HTMLElement | null>,
  getItemOffsets,
});

/**
 * Called by SectionItem on mount (or re-mount after virtual scroll) to register
 * the section element. Always updates the entry to avoid stale element refs
 * caused by TanStack Virtual unmounting and remounting DOM nodes.
 */
function onRegisterSection(id: string, el: Element): void {
  if (!isLargeSession.value) return;
  const existingIndex = sectionEntries.value.findIndex((e) => e.id === id);
  if (existingIndex >= 0) {
    const updated = [...sectionEntries.value];
    updated[existingIndex] = { id, el };
    sectionEntries.value = updated;
  } else {
    sectionEntries.value = [...sectionEntries.value, { id, el }];
  }
}

// Reset section entries when session changes.
watch(sessionId, () => {
  sectionEntries.value = [];
});

// ---------------------------------------------------------------------------
// Prefetch on hover
// ---------------------------------------------------------------------------

/** Prefetch section content on navigator pill hover (after 150ms debounce in navigator). */
function onHoverSection(id: string): void {
  void fetchSectionContent(id);
}
</script>

<template>
  <div
    class="session-detail-view"
    :class="{ 'session-detail-view--with-nav': isLargeSession }"
  >
    <SkeletonMain v-if="loading" />
    <div
      v-else-if="error"
      role="alert"
      class="session-detail-view__state session-detail-view__state--error"
    >
      {{ error }}
    </div>
    <template v-else>
      <SessionContent
        ref="sessionContentRef"
        class="session-detail-view__content"
        :sections="sections"
        :fetch-section-content="fetchSectionContent"
        :detection-status="detectionStatus"
        :virtual-items="isLargeSession ? virtualItems : undefined"
        :total-height="isLargeSession ? totalHeight : undefined"
        :measure-element="measureElement"
        @register-section="onRegisterSection"
      />
      <SectionNavigator
        v-if="isLargeSession"
        class="session-detail-view__nav"
        :sections="sections"
        :active-id="activeId"
        :scroll-to-section="scrollToSection"
        :on-hover-section="onHoverSection"
      />
    </template>
  </div>
</template>

<style scoped>
/**
 * SessionDetailView fills the spatial-shell main grid area directly.
 * When the navigator is active, the layout becomes a two-column flex row:
 *   [content area | 48px navigator aside].
 */
.session-detail-view {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-6);
}

/* Large session: side-by-side content + navigator */
.session-detail-view--with-nav {
  flex-direction: row;
  /* Zero out vertical padding so navigator fills full height flush to edges.
     Left padding is preserved to keep the content area inset from the shell edge.
     Right padding is zero — navigator sits flush on the right. */
  padding-top: 0;
  padding-bottom: 0;
  padding-left: var(--space-6);
  padding-right: 0;
  gap: 0;
  overflow: hidden;
}

.session-detail-view__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* In the with-nav layout the container has no vertical padding,
   so we add it back to the content area only — the navigator fills flush. */
.session-detail-view--with-nav .session-detail-view__content {
  padding-top: var(--space-6);
  padding-bottom: var(--space-6);
}

.session-detail-view__nav {
  flex-shrink: 0;
  width: 48px;
  height: 100%;
}

.session-detail-view__state {
  text-align: center;
  padding: var(--space-12);
  color: var(--text-muted);
}

.session-detail-view__state--error {
  color: var(--status-error);
}
</style>

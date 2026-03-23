<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import type { SectionMetadata, SectionContentPage } from '../../shared/types/api.js';
import type { VirtualItem } from '@tanstack/vue-virtual';
import type { DetectionStatus } from '../../shared/types/pipeline.js';
import type { TerminalSnapshot } from '#vt-wasm/types';
import SectionItem from './SectionItem.vue';
import SectionHeader from './SectionHeader.vue';
import OverlayScrollbar from './OverlayScrollbar.vue';
import TerminalSnapshotComponent from './TerminalSnapshot.vue';

/**
 * SessionContent renders the terminal content area for a session.
 *
 * Supports two rendering paths:
 * - Small sessions (no virtualItems): renders all sections directly.
 * - Large sessions (virtualItems provided): renders only virtual items in a
 *   positioned container sized to totalHeight for smooth virtual scrolling.
 *
 * Section content is loaded lazily via fetchSectionContent.
 * Exposes scrollViewport for parent virtualizer wiring.
 */

const props = withDefaults(defineProps<{
  /** Ordered list of section metadata — drives section rendering. */
  sections: SectionMetadata[];
  /** Callback to load terminal lines for a section by id (cache-backed). */
  fetchSectionContent: (id: string) => Promise<SectionContentPage>;
  /** Pipeline detection status — used to render in-progress/empty states. */
  detectionStatus?: DetectionStatus;
  /**
   * Session-level terminal snapshot — populated for 0-section sessions.
   * Used to display full terminal content when section detection found no boundaries.
   */
  snapshot?: TerminalSnapshot | null;
  /**
   * Optional error detail string — shown in the error banner detail block
   * when the pipeline failed (e.g. last error message from the status endpoint).
   */
  errorDetail?: string | null;
  /**
   * Virtual items from useSectionVirtualizer — when provided, enables virtual
   * rendering. Only these items are rendered (large session path).
   */
  virtualItems?: VirtualItem[];
  /**
   * Total scrollable height in pixels from the virtualizer.
   * Required when virtualItems is provided.
   */
  totalHeight?: number;
  /**
   * TanStack Virtual measureElement callback — passed to each SectionItem's root
   * div so the virtualizer tracks real heights via ResizeObserver.
   * Required when virtualItems is provided.
   */
  measureElement?: ((el: Element | null) => void) | null;
  /**
   * The id of the currently active (visible) section — used to render the
   * sticky overlay header in virtual mode. Provided by the parent scrollspy.
   */
  activeSectionId?: string | null;
}>(), {
  detectionStatus: 'completed',
  snapshot: null,
  errorDetail: null,
  virtualItems: undefined,
  totalHeight: undefined,
  measureElement: null,
  activeSectionId: null,
});

const emit = defineEmits<{
  /** Fired when a section mounts, for scrollspy wiring in the parent. */
  (e: 'register-section', id: string, el: Element): void;
}>();

const overlayScrollbarRef = ref<InstanceType<typeof OverlayScrollbar> | null>(null);
const stickyHeaderRef = ref<InstanceType<typeof SectionHeader> | null>(null);

/** True when large-session virtual mode is active. */
const isVirtualized = computed(() => props.virtualItems !== undefined);

/** True when status is a terminal error (failed or interrupted). */
const isTerminalError = computed(() =>
  props.detectionStatus === 'failed' || props.detectionStatus === 'interrupted'
);

/** Sections to render in flat (non-virtualized) mode. */
const sectionsToRender = computed((): SectionMetadata[] => {
  if (!isVirtualized.value) return props.sections;
  return [];
});

/**
 * The section whose header should appear in the sticky overlay.
 * This is the last section whose start offset is ABOVE scrollTop —
 * meaning its real header has scrolled under the sticky position.
 * Computed on scroll, independent of the scrollspy activeId.
 */
const stickySection = ref<SectionMetadata | null>(null);
const showStickyHeader = ref(false);

function onContentScroll(): void {
  const viewport = overlayScrollbarRef.value?.viewport;
  if (!viewport || !isVirtualized.value || !props.virtualItems) {
    showStickyHeader.value = false;
    stickySection.value = null;
    return;
  }

  const scrollTop = viewport.scrollTop;

  // Find the last section whose start is above scrollTop.
  // That section's real header has scrolled past the top — show it in the sticky.
  let found: SectionMetadata | null = null;
  for (const item of props.virtualItems) {
    const section = props.sections[item.index];
    if (!section) continue;
    if (item.start <= scrollTop) {
      found = section;
    } else {
      break;
    }
  }

  // Only show sticky if we found a section AND its header is actually above the viewport
  // (not just barely at the top — check that scrollTop is past the section start)
  if (found && scrollTop > 0) {
    // Check: is the found section's real header still visible?
    // It's visible if its virtual item start is within [scrollTop, scrollTop + viewportHeight]
    const foundItem = props.virtualItems.find((_item, i) => props.sections[i]?.id === found!.id);
    if (foundItem && foundItem.start >= scrollTop) {
      // Real header is still on screen — don't show sticky for this section
      showStickyHeader.value = false;
      stickySection.value = null;
    } else {
      showStickyHeader.value = true;
      stickySection.value = found;
    }
  } else {
    showStickyHeader.value = false;
    stickySection.value = null;
  }
}

/** Sections to render in virtualized mode (mapped from virtualItems). */
const virtualSections = computed((): Array<{ item: VirtualItem; section: SectionMetadata }> => {
  if (!isVirtualized.value || !props.virtualItems) return [];
  return props.virtualItems.flatMap((item) => {
    const section = props.sections[item.index];
    if (!section) return [];
    return [{ item, section }];
  });
});

function onSectionRegister(id: string, el: Element): void {
  emit('register-section', id, el);
}

/** Expose the scroll viewport so SessionDetailView can wire useSectionVirtualizer. */
defineExpose({
  scrollViewport: computed(() => overlayScrollbarRef.value?.viewport ?? null),
  stickyHeaderEl: computed(() => stickyHeaderRef.value?.$el as HTMLElement | null ?? null),
});

// Wire scroll listener for sticky header visibility
let scrollListenerEl: HTMLElement | null = null;
watch(
  () => overlayScrollbarRef.value?.viewport,
  (el) => {
    if (scrollListenerEl) scrollListenerEl.removeEventListener('scroll', onContentScroll);
    scrollListenerEl = el ?? null;
    if (el) el.addEventListener('scroll', onContentScroll, { passive: true });
  },
  { immediate: true }
);
onUnmounted(() => {
  if (scrollListenerEl) scrollListenerEl.removeEventListener('scroll', onContentScroll);
});
</script>

<template>
  <div class="terminal-chrome">
    <OverlayScrollbar
      v-if="sections.length > 0"
      ref="overlayScrollbarRef"
      class="terminal-scroll"
    >
      <!-- Error banner for failed sessions that have partial sections -->
      <div
        v-if="isTerminalError"
        class="fallback-banner fallback-banner--error"
      >
        <svg class="fallback-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="fallback-banner__body">
          <div class="fallback-banner__title">Session processing failed</div>
          <div class="fallback-banner__text">
            The pipeline encountered an error. Showing recovered terminal content below.
          </div>
        </div>
      </div>

      <!-- Sticky overlay header: shows when the current section's real header has scrolled above -->
      <SectionHeader
        v-if="showStickyHeader && stickySection"
        ref="stickyHeaderRef"
        class="section-sticky-overlay"
        :section="stickySection"
        :collapsed="false"
        :line-count="stickySection.lineCount"
        @toggle="() => {}"
      />

      <!-- Virtual mode: absolutely positioned items within a sized container -->
      <div
        v-if="isVirtualized"
        class="section-virtual-container"
        :style="{ height: `${totalHeight}px`, position: 'relative' }"
      >
        <SectionItem
          v-for="{ item, section } in virtualSections"
          :key="section.id"
          :section="section"
          :fetch-content="fetchSectionContent"
          :measure-el="measureElement"
          :data-index="item.index"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${item.start}px)`,
          }"
          @register="onSectionRegister"
        />
      </div>

      <!-- Flat mode: render all sections directly -->
      <template v-else>
        <SectionItem
          v-for="section in sectionsToRender"
          :key="section.id"
          :section="section"
          :fetch-content="fetchSectionContent"
          @register="onSectionRegister"
        />
      </template>
    </OverlayScrollbar>

    <!-- State 1: Processing failed + no content -->
    <template v-else-if="isTerminalError && !snapshot">
      <div class="fallback-banner fallback-banner--error">
        <svg class="fallback-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="fallback-banner__body">
          <div class="fallback-banner__title">Session processing failed</div>
          <div class="fallback-banner__text">
            The pipeline encountered an error while analyzing this recording.
            No terminal content could be recovered.
          </div>
          <div v-if="errorDetail" class="fallback-banner__detail">{{ errorDetail }}</div>
        </div>
      </div>
      <div class="terminal-empty-state terminal-empty-state--error">
        <svg class="terminal-empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <div class="terminal-empty-state__label">No terminal output available</div>
      </div>
    </template>

    <!-- State 2: Processing failed + partial content (snapshot) -->
    <template v-else-if="isTerminalError && snapshot">
      <div class="fallback-banner fallback-banner--error">
        <svg class="fallback-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="fallback-banner__body">
          <div class="fallback-banner__title">Session processing failed</div>
          <div class="fallback-banner__text">
            The pipeline encountered an error. Showing recovered terminal content below.
          </div>
        </div>
      </div>
      <OverlayScrollbar class="terminal-scroll">
        <TerminalSnapshotComponent
          :lines="snapshot.lines"
          :start-line-number="1"
        />
      </OverlayScrollbar>
    </template>

    <!-- State 3: No sections detected + content exists -->
    <template v-else-if="detectionStatus === 'completed' && snapshot">
      <div class="fallback-banner fallback-banner--info">
        <svg class="fallback-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div class="fallback-banner__body">
          <div class="fallback-banner__title">No sections detected</div>
          <div class="fallback-banner__text">
            Session completed successfully, but no section boundaries were found.
            Showing raw terminal output as a single block.
          </div>
        </div>
      </div>
      <OverlayScrollbar class="terminal-scroll">
        <TerminalSnapshotComponent
          :lines="snapshot.lines"
          :start-line-number="1"
        />
      </OverlayScrollbar>
    </template>

    <!-- State 4: Completed + no content -->
    <template v-else-if="detectionStatus === 'completed'">
      <div class="fallback-banner fallback-banner--info">
        <svg class="fallback-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <div class="fallback-banner__body">
          <div class="fallback-banner__title">No sections detected</div>
          <div class="fallback-banner__text">
            Session completed successfully, but no section boundaries or terminal content were found.
          </div>
        </div>
      </div>
      <div class="terminal-empty-state">
        <svg class="terminal-empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <div class="terminal-empty-state__label">No terminal output available</div>
      </div>
    </template>

    <!-- Non-terminal status: session is still being processed -->
    <div
      v-else
      class="terminal-empty"
    >
      Session is being processed&hellip;
    </div>
  </div>
</template>

<style scoped>
/* .terminal-chrome base styles come from design/styles/components.css */
.terminal-chrome {
  font-family: var(--font-mono);
  border-radius: var(--radius-lg);
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.terminal-scroll {
  flex: 1;
  min-height: 0;
}

.section-virtual-container {
  position: relative;
}

/**
 * Sticky overlay header sits at the top of the scroll viewport in virtual mode.
 * Rendered directly inside the OverlayScrollbar viewport (not inside the absolute
 * virtual container) so position: sticky works against the scroll container.
 */
.section-sticky-overlay {
  position: sticky;
  top: 0;
  z-index: 10;
}

.terminal-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--text-disabled);
  font-style: italic;
}

/* ================================================================
   FALLBACK BANNER — shared base (extracted from design/mockups/session-fallbacks/fallback-states.html)
   ================================================================ */
.fallback-banner {
  position: relative;
  padding: var(--rhythm-1) var(--space-4);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
  overflow: hidden;
}

/* Scanline texture overlay */
.fallback-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.06) 2px,
    rgba(0, 0, 0, 0.06) 4px
  );
  pointer-events: none;
  z-index: 1;
}

.fallback-banner__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: -1px;
  position: relative;
  z-index: 2;
}

.fallback-banner__body {
  flex: 1;
  position: relative;
  z-index: 2;
}

.fallback-banner__title {
  font-weight: var(--weight-semibold);
  font-size: var(--text-base);
  line-height: var(--lh-base);
  margin-bottom: var(--space-1);
}

.fallback-banner__text {
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}

.fallback-banner__detail {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  color: var(--text-muted);
  word-break: break-all;
}

/* ================================================================
   ERROR VARIANT
   ================================================================ */
.fallback-banner--error {
  background:
    linear-gradient(135deg, rgba(215, 69, 123, 0.12) 0%, rgba(215, 69, 123, 0.04) 100%);
  border-bottom: 1px solid rgba(215, 69, 123, 0.25);
}

.fallback-banner--error .fallback-banner__title {
  color: var(--status-error);
}

.fallback-banner--error .fallback-banner__icon {
  color: var(--status-error);
  filter: drop-shadow(0 0 6px rgba(215, 69, 123, 0.5));
}

.fallback-banner--error .fallback-banner__detail {
  background: rgba(215, 69, 123, 0.06);
  border: 1px solid rgba(215, 69, 123, 0.15);
}

/* Left edge glow */
.fallback-banner--error::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--status-error);
  box-shadow: 0 0 12px rgba(215, 69, 123, 0.6),
              0 0 4px rgba(215, 69, 123, 0.4);
  z-index: 2;
}

/* ================================================================
   INFO VARIANT
   ================================================================ */
.fallback-banner--info {
  background:
    linear-gradient(135deg, rgba(143, 218, 252, 0.1) 0%, rgba(143, 218, 252, 0.03) 100%);
  border-bottom: 1px solid rgba(143, 218, 252, 0.2);
}

.fallback-banner--info .fallback-banner__title {
  color: var(--status-info);
}

.fallback-banner--info .fallback-banner__icon {
  color: var(--status-info);
  filter: drop-shadow(0 0 6px rgba(143, 218, 252, 0.4));
}

/* Left edge glow */
.fallback-banner--info::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--status-info);
  box-shadow: 0 0 12px rgba(143, 218, 252, 0.5),
              0 0 4px rgba(143, 218, 252, 0.3);
  z-index: 2;
}

/* ================================================================
   EMPTY TERMINAL AREA — for no-content states
   ================================================================ */
.terminal-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--rhythm-1);
  padding: var(--rhythm-4) var(--space-6);
  text-align: center;
}

.terminal-empty-state__icon {
  width: 48px;
  height: 48px;
  opacity: 0.3;
  color: var(--text-disabled);
}

.terminal-empty-state--error .terminal-empty-state__icon {
  color: var(--status-error);
  opacity: 0.25;
  filter: drop-shadow(0 0 20px rgba(215, 69, 123, 0.3));
}

.terminal-empty-state__label {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-disabled);
  letter-spacing: var(--tracking-wide);
}

.terminal-empty-state--error .terminal-empty-state__label {
  color: color-mix(in srgb, var(--status-error) 50%, var(--text-disabled));
}
</style>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { SectionMetadata, SectionContentPage } from '../../shared/types/api.js';
import type { VirtualItem } from '@tanstack/vue-virtual';
import type { DetectionStatus } from '../../shared/types/pipeline.js';
import SectionItem from './SectionItem.vue';
import OverlayScrollbar from './OverlayScrollbar.vue';

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
}>(), {
  detectionStatus: 'completed',
  virtualItems: undefined,
  totalHeight: undefined,
  measureElement: null,
});

const emit = defineEmits<{
  /** Fired when a section mounts, for scrollspy wiring in the parent. */
  (e: 'register-section', id: string, el: Element): void;
}>();

const overlayScrollbarRef = ref<InstanceType<typeof OverlayScrollbar> | null>(null);

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
        class="session-content-banner session-content-banner--error"
      >
        Session processing encountered an error. Showing available content.
      </div>

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

    <!-- State A: completed + 0 sections → info banner -->
    <div
      v-else-if="detectionStatus === 'completed'"
      class="terminal-empty"
    >
      <div class="session-content-banner session-content-banner--info">
        Section boundaries were not detected for this session.
      </div>
      No content available for this session.
    </div>

    <!-- State B (failed/interrupted + 0 sections): error-only state -->
    <div
      v-else-if="isTerminalError"
      class="terminal-empty terminal-empty--error"
    >
      Session processing failed and no content is available.
    </div>

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

.section-virtual-item {
  /* Each virtual item is absolutely placed by the virtualizer */
}

.terminal-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--text-disabled);
  font-style: italic;
}

.session-content-banner {
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  line-height: var(--lh-sm);
}

.session-content-banner--info {
  background: var(--status-info-subtle, rgba(0, 150, 255, 0.08));
  color: var(--status-info, #4da6ff);
  border-bottom: 1px solid var(--status-info-subtle, rgba(0, 150, 255, 0.12));
}

.session-content-banner--error {
  background: var(--status-error-subtle, rgba(255, 77, 106, 0.08));
  color: var(--status-error, #ff4d6a);
  border-bottom: 1px solid var(--status-error-subtle, rgba(255, 77, 106, 0.12));
}

.terminal-empty--error {
  color: var(--status-error, #ff4d6a);
}
</style>

<script setup lang="ts">
import { ref, onMounted, type ComponentPublicInstance } from 'vue';
import type { SectionMetadata, SectionContentPage } from '../../shared/types/api.js';
import TerminalSnapshotComponent from './TerminalSnapshot.vue';
import SectionHeader from './SectionHeader.vue';

/**
 * SectionItem renders a single section: sticky header + lazy-loaded content.
 *
 * On mount it calls fetchContent to load terminal lines for this section.
 * Accepts a measureElement callback from the virtualizer so TanStack Virtual
 * can observe real DOM height changes via ResizeObserver (used in virtual mode).
 * Emits register events so the parent can wire up the scrollspy.
 */

const props = withDefaults(defineProps<{
  section: SectionMetadata;
  fetchContent: (id: string) => Promise<SectionContentPage>;
  defaultCollapsed?: boolean;
  /** TanStack Virtual measureElement ref callback — pass virtualizer.measureElement here. */
  measureEl?: ((el: Element | null) => void) | null;
  /** data-index value for TanStack Virtual measurement (virtual item index). */
  dataIndex?: number;
}>(), {
  defaultCollapsed: false,
  measureEl: null,
  dataIndex: undefined,
});

const emit = defineEmits<{
  /** Fired after mount with the section id and root element for scrollspy wiring. */
  (e: 'register', id: string, el: Element): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const collapsed = ref(props.defaultCollapsed);
const lines = ref<SectionContentPage['lines']>([]);
const startLineNumber = ref(1);
const loadError = ref<string | null>(null);

function toggle(): void {
  collapsed.value = !collapsed.value;
}

function getLineCount(): number {
  return props.section.lineCount;
}

async function loadContent(): Promise<void> {
  try {
    const page = await props.fetchContent(props.section.id);
    lines.value = page.lines;
    startLineNumber.value = (page.offset ?? 0) + 1;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load section';
  }
}

/**
 * Vue ref callback for the root element.
 * Wires both the local rootRef and the virtualizer's measureElement callback.
 */
function setRootRef(el: Element | ComponentPublicInstance | null): void {
  const htmlEl = el instanceof HTMLElement ? el : null;
  rootRef.value = htmlEl;
  if (props.measureEl) {
    props.measureEl(htmlEl);
  }
}

onMounted(() => {
  void loadContent();
  if (rootRef.value) {
    emit('register', props.section.id, rootRef.value);
  }
});
</script>

<template>
  <div
    :ref="setRootRef"
    class="section-item"
    :data-index="dataIndex"
  >
    <SectionHeader
      :section="section"
      :collapsed="collapsed"
      :line-count="getLineCount()"
      @toggle="toggle"
    />
    <div
      v-if="!collapsed"
      class="section-content"
    >
      <div
        v-if="loadError"
        class="section-content-error"
      >
        {{ loadError }}
      </div>
      <TerminalSnapshotComponent
        v-else-if="lines.length > 0"
        :lines="lines"
        :start-line-number="startLineNumber"
      />
      <div
        v-else
        class="section-empty"
      >
        No content captured
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-item {
  /* content-visibility: auto lets the browser skip off-screen paint/layout */
  content-visibility: auto;
  /* contain-intrinsic-size provides a size hint so layout doesn't collapse */
  contain-intrinsic-size: auto 400px;
}

.section-content {
  /* No extra padding — TerminalSnapshot handles its own */
}

.section-empty {
  padding: var(--space-4);
  color: var(--text-muted);
  font-style: italic;
  font-size: var(--text-sm);
}

.section-content-error {
  padding: var(--space-4);
  color: var(--status-error, #ff4d6a);
  font-size: var(--text-sm);
}
</style>

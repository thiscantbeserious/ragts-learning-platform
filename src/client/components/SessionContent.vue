<script setup lang="ts">
import { reactive, computed } from 'vue';
import type { TerminalSnapshot } from '#vt-wasm/types';
import type { Section } from '../composables/useSession';
import TerminalSnapshotComponent from './TerminalSnapshot.vue';
import SectionHeader from './SectionHeader.vue';
import OverlayScrollbar from './OverlayScrollbar.vue';

const props = withDefaults(defineProps<{
  snapshot: TerminalSnapshot | null;
  sections: Section[];
  defaultCollapsed?: boolean;
}>(), {
  defaultCollapsed: false,
});

const foldState = reactive<Record<string, boolean>>({});

function isCollapsed(sectionId: string): boolean {
  return foldState[sectionId] ?? props.defaultCollapsed;
}

function toggleFold(sectionId: string) {
  foldState[sectionId] = !isCollapsed(sectionId);
}

function getSectionLineCount(section: Section): number {
  if (section.startLine != null && section.endLine != null) {
    return section.endLine - section.startLine;
  }
  if (section.snapshot) {
    return section.snapshot.lines.length;
  }
  return 0;
}

// Lines before the first section (if first section doesn't start at line 0)
const preambleLines = computed(() => {
  if (!props.snapshot || props.sections.length === 0) return [];
  const firstSection = props.sections[0];
  if (firstSection.startLine != null && firstSection.startLine > 0) {
    return props.snapshot.lines.slice(0, firstSection.startLine);
  }
  return [];
});
</script>

<template>
  <div class="terminal-chrome">
    <OverlayScrollbar
      v-if="snapshot || sections.length > 0"
      class="terminal-scroll"
    >
      <!-- Lines before first section -->
      <TerminalSnapshotComponent
        v-if="preambleLines.length > 0"
        :lines="preambleLines"
        :start-line-number="1"
      />

      <!-- Each section: sticky header + content -->
      <template
        v-for="section in sections"
        :key="section.id"
      >
        <SectionHeader
          :section="section"
          :collapsed="isCollapsed(section.id)"
          :line-count="getSectionLineCount(section)"
          @toggle="toggleFold(section.id)"
        />
        <div
          v-if="!isCollapsed(section.id)"
          class="section-content"
        >
          <!-- CLI section: slice from session snapshot -->
          <TerminalSnapshotComponent
            v-if="section.startLine != null && section.endLine != null && snapshot"
            :lines="snapshot.lines.slice(section.startLine, section.endLine)"
            :start-line-number="section.startLine + 1"
          />
          <!-- TUI/overflow section: inline viewport snapshot -->
          <TerminalSnapshotComponent
            v-else-if="section.snapshot"
            :lines="section.snapshot.lines"
            :start-line-number="1"
          />
          <!-- Empty section -->
          <div
            v-else
            class="section-empty"
          >
            No content captured
          </div>
        </div>
      </template>
    </OverlayScrollbar>

    <!-- Loading / empty states -->
    <div
      v-else
      class="terminal-empty"
    >
      No content available
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

.section-content {
  /* No extra padding — TerminalSnapshot handles its own */
}

.section-empty {
  padding: var(--space-4);
  color: var(--text-muted);
  font-style: italic;
  font-size: var(--text-sm);
}

.terminal-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--text-disabled);
  font-style: italic;
}
</style>

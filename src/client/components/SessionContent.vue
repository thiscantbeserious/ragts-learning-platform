<script setup lang="ts">
import { reactive, computed } from 'vue';
import type { TerminalSnapshot } from '#vt-wasm/types';
import type { Section } from '../composables/useSession';
import type { DetectionStatus } from '../../shared/types/pipeline.js';
import TerminalSnapshotComponent from './TerminalSnapshot.vue';
import SectionHeader from './SectionHeader.vue';
import OverlayScrollbar from './OverlayScrollbar.vue';

const props = withDefaults(defineProps<{
  snapshot: TerminalSnapshot | null;
  sections: Section[];
  defaultCollapsed?: boolean;
  /** Pipeline detection status — used in Stage 3 to render in-progress/empty states. */
  detectionStatus?: DetectionStatus;
}>(), {
  defaultCollapsed: false,
  detectionStatus: 'completed',
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

/** True when status is a terminal error (failed or interrupted). */
const isTerminalError = computed(() =>
  props.detectionStatus === 'failed' || props.detectionStatus === 'interrupted'
);
</script>

<template>
  <div class="terminal-chrome">
    <OverlayScrollbar
      v-if="sections.length > 0"
      class="terminal-scroll"
    >
      <!-- Error banner for failed sessions that have partial sections -->
      <div
        v-if="isTerminalError"
        class="session-content-banner session-content-banner--error"
      >
        Session processing encountered an error. Showing available content.
      </div>

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

    <!-- State A: completed + 0 sections + snapshot exists → full snapshot with info banner -->
    <template v-else-if="detectionStatus === 'completed' && snapshot">
      <div class="session-content-banner session-content-banner--info">
        Section boundaries were not detected for this session.
      </div>
      <OverlayScrollbar class="terminal-scroll">
        <TerminalSnapshotComponent
          :lines="snapshot.lines"
          :start-line-number="1"
        />
      </OverlayScrollbar>
    </template>

    <!-- State A (no snapshot): completed + 0 sections + no snapshot -->
    <div
      v-else-if="detectionStatus === 'completed'"
      class="terminal-empty"
    >
      No content available for this session.
    </div>

    <!-- State B (failed/interrupted + snapshot): show error banner + full snapshot -->
    <template v-else-if="isTerminalError && snapshot">
      <div class="session-content-banner session-content-banner--error">
        Session processing encountered an error. Showing available content.
      </div>
      <OverlayScrollbar class="terminal-scroll">
        <TerminalSnapshotComponent
          :lines="snapshot.lines"
          :start-line-number="1"
        />
      </OverlayScrollbar>
    </template>

    <!-- State B (failed/interrupted + no snapshot): error-only state -->
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
      Session is being processed…
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

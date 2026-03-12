<script setup lang="ts">
import type { Section } from '../composables/useSession';

defineProps<{
  section: Section;
  collapsed: boolean;
  lineCount: number;
}>();

defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <button
    class="section-header"
    :class="{
      'section-header--collapsed': collapsed,
      'section-header--marker': section.type === 'marker',
      'section-header--detected': section.type === 'detected',
    }"
    @click="$emit('toggle')"
  >
    <div class="section-header__chevron">
      <span
        v-if="collapsed"
        class="icon icon--sm icon-chevron-right"
      />
      <span
        v-else
        class="icon icon--sm icon-chevron-down"
      />
    </div>
    <span class="section-header__label">{{ section.label }}</span>
    <span
      v-if="section.startLine != null && section.endLine != null"
      class="section-header__range"
    >L{{ section.startLine + 1 }}&ndash;L{{ section.endLine }} ({{ lineCount }}&nbsp;lines)</span>
    <span
      v-else-if="lineCount > 0"
      class="section-header__range"
    >{{ lineCount }}&nbsp;lines (viewport)</span>
    <span
      class="badge badge--sm section-header__badge"
      :class="section.type === 'marker' ? 'badge--secondary' : 'badge--accent'"
    >
      {{ section.type === 'marker' ? 'Marker' : 'Detected' }}
    </span>
  </button>
</template>

<style scoped>
/* Base structure and modifier styles come from design/styles/components.css */
/* display: flex set explicitly so scoped styles control layout regardless of global CSS. */
.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  border: none;
  width: 100%;
  transition: background-color var(--duration-fast) var(--easing-default);
}

/* Label takes all remaining space, pushing right-side content to the edge. */
.section-header__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Range: fixed-width right-aligned slot */
.section-header__range {
  flex-shrink: 0;
  min-width: 18ch;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

/* Badge pinned to far right edge */
.section-header__badge {
  margin-left: auto;
  flex-shrink: 0;
}
</style>

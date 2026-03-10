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
      class="badge badge--sm"
      :class="section.type === 'marker' ? 'badge--secondary' : 'badge--accent'"
    >
      {{ section.type === 'marker' ? 'Marker' : 'Detected' }}
    </span>
    <span
      v-if="section.startLine != null && section.endLine != null"
      class="section-header__range"
    >
      L{{ section.startLine + 1 }}&ndash;L{{ section.endLine }} ({{ lineCount }} lines)
    </span>
    <span
      v-else-if="lineCount > 0"
      class="section-header__range"
    >{{ lineCount }} lines (viewport)</span>
  </button>
</template>

<style scoped>
/* Base structure and modifier styles come from design/styles/components.css */
/* Override button defaults to match design system expectations */
.section-header {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  border: none;
  width: 100%;
  transition: background-color var(--duration-fast) var(--easing-default);
  position: sticky;
  top: 0;
  z-index: 10;
}
</style>

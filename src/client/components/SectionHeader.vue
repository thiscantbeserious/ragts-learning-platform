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
    :class="{ 'section-header--collapsed': collapsed }"
    @click="$emit('toggle')"
  >
    <span class="section-header__chevron">{{ collapsed ? '▸' : '▾' }}</span>
    <span class="section-header__label">{{ section.label }}</span>
    <span class="section-header__badge">{{ section.type === 'marker' ? 'Marker' : 'Detected' }}</span>
    <span class="section-header__meta" v-if="section.startLine != null && section.endLine != null">
      L{{ section.startLine + 1 }}&ndash;L{{ section.endLine }} ({{ lineCount }} lines)
    </span>
    <span class="section-header__meta" v-else-if="lineCount > 0">{{ lineCount }} lines (viewport)</span>
  </button>
</template>

<style scoped>
.section-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.25rem 1rem;
  background: #1a1a1a;
  border: none;
  border-top: 1px solid #2a2a2a;
  border-bottom: 1px solid #2a2a2a;
  font-family: inherit;
  font-size: 0.75rem;
  color: #888;
  cursor: pointer;
  transition: background-color 0.15s ease;
  text-align: left;
}
.section-header:hover { background: #222; }
.section-header--collapsed { opacity: 0.7; }
.section-header__chevron { font-size: 0.65rem; width: 1em; }
.section-header__label { color: #4a9eff; font-weight: 600; }
.section-header__badge {
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: #333;
  color: #aaa;
  font-size: 0.65rem;
  text-transform: uppercase;
}
.section-header__meta { margin-left: auto; color: #666; }
</style>

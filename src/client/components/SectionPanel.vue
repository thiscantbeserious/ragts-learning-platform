<script setup lang="ts">
import { ref } from 'vue';
import TerminalSnapshot from './TerminalSnapshot.vue';
import type { Section } from '../composables/useSession';

const props = defineProps<{
  section: Section;
  defaultCollapsed?: boolean;
}>();

const collapsed = ref(props.defaultCollapsed ?? true);

function toggle(): void {
  collapsed.value = !collapsed.value;
}

function getSectionIcon(type: 'marker' | 'detected'): string {
  return type === 'marker' ? '📍' : '🔍';
}

function getSectionTypeBadge(type: 'marker' | 'detected'): string {
  return type === 'marker' ? 'Marker' : 'Detected';
}
</script>

<template>
  <div class="section-panel" :class="{ 'section-panel--collapsed': collapsed }">
    <button class="section-panel__header" @click="toggle">
      <span class="section-panel__chevron">{{ collapsed ? '▸' : '▾' }}</span>
      <span class="section-panel__icon">{{ getSectionIcon(section.type) }}</span>
      <span class="section-panel__label">{{ section.label }}</span>
      <span class="section-panel__badge" :class="`section-panel__badge--${section.type}`">
        {{ getSectionTypeBadge(section.type) }}
      </span>
      <span v-if="section.snapshot" class="section-panel__meta">
        {{ section.snapshot.lines.length }} line{{ section.snapshot.lines.length !== 1 ? 's' : '' }}
      </span>
    </button>
    <div v-if="!collapsed" class="section-panel__content">
      <TerminalSnapshot v-if="section.snapshot" :snapshot="section.snapshot" />
      <div v-else class="section-panel__empty">
        No snapshot available for this section
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-panel {
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.section-panel__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 1rem;
  background: #1a1a1a;
  border: none;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 0.9rem;
  text-align: left;
  transition: background-color 0.15s;
}

.section-panel__header:hover {
  background: #222;
}

.section-panel__chevron {
  color: #4a9eff;
  font-size: 0.85rem;
  width: 1em;
  flex-shrink: 0;
}

.section-panel__icon {
  font-size: 0.9rem;
  flex-shrink: 0;
}

.section-panel__label {
  flex: 1;
  font-weight: 500;
  color: #4a9eff;
}

.section-panel__badge {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.section-panel__badge--marker {
  background: #2a4a7a;
  color: #7ab8ff;
}

.section-panel__badge--detected {
  background: #3a5a2a;
  color: #8aff7a;
}

.section-panel__meta {
  font-size: 0.75rem;
  color: #666;
  flex-shrink: 0;
}

.section-panel__content {
  border-top: 1px solid #2a2a2a;
  padding: 0;
}

.section-panel__content .terminal-snapshot {
  border-radius: 0;
}

.section-panel__empty {
  padding: 0.75rem 1rem;
  color: #555;
  font-size: 0.85rem;
  font-style: italic;
}
</style>

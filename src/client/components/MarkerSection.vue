<script setup lang="ts">
import { ref } from 'vue';
import TerminalOutput from './TerminalOutput.vue';

const props = defineProps<{
  label: string;
  lines: string[];
  defaultCollapsed?: boolean;
}>();

const collapsed = ref(props.defaultCollapsed ?? true);

function toggle(): void {
  collapsed.value = !collapsed.value;
}

function formatTime(seconds?: number): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
</script>

<template>
  <div class="marker-section" :class="{ 'marker-section--collapsed': collapsed }">
    <button class="marker-section__header" @click="toggle">
      <span class="marker-section__chevron">{{ collapsed ? '▸' : '▾' }}</span>
      <span class="marker-section__label">{{ label }}</span>
      <span v-if="lines.length > 0" class="marker-section__count">
        {{ lines.length }} line{{ lines.length !== 1 ? 's' : '' }}
      </span>
    </button>
    <div v-if="!collapsed && lines.length > 0" class="marker-section__content">
      <TerminalOutput :lines="lines" />
    </div>
    <div v-if="!collapsed && lines.length === 0" class="marker-section__empty">
      No output in this section
    </div>
  </div>
</template>

<style scoped>
.marker-section {
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.marker-section__header {
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

.marker-section__header:hover {
  background: #222;
}

.marker-section__chevron {
  color: #4a9eff;
  font-size: 0.85rem;
  width: 1em;
  flex-shrink: 0;
}

.marker-section__label {
  flex: 1;
  font-weight: 500;
  color: #4a9eff;
}

.marker-section__count {
  font-size: 0.75rem;
  color: #666;
  flex-shrink: 0;
}

.marker-section__content {
  border-top: 1px solid #2a2a2a;
}

.marker-section__content .terminal-output {
  border-radius: 0;
}

.marker-section__empty {
  padding: 0.75rem 1rem;
  color: #555;
  font-size: 0.85rem;
  font-style: italic;
  border-top: 1px solid #2a2a2a;
}
</style>

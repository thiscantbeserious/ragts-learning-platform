<script setup lang="ts">
import TerminalOutput from './TerminalOutput.vue';
import MarkerSection from './MarkerSection.vue';
import type { Section } from '../composables/useSession';

defineProps<{
  sections: Section[];
}>();
</script>

<template>
  <div class="session-content">
    <template v-for="(section, index) in sections" :key="index">
      <!-- Preamble: always expanded, no fold UI -->
      <div v-if="section.type === 'preamble'" class="session-content__preamble">
        <TerminalOutput :lines="section.lines" />
      </div>

      <!-- Marker section: collapsible, default collapsed -->
      <MarkerSection
        v-else
        :label="section.label ?? 'Unnamed section'"
        :lines="section.lines"
        :default-collapsed="true"
      />
    </template>
  </div>
</template>

<style scoped>
.session-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>

<script setup lang="ts">
import SectionPanel from './SectionPanel.vue';
import type { Section } from '../composables/useSession';

defineProps<{
  sections: Section[];
}>();
</script>

<template>
  <div class="session-content">
    <SectionPanel
      v-for="section in sections"
      :key="section.id"
      :section="section"
      :default-collapsed="true"
    />
  </div>
</template>

<style scoped>
.session-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>

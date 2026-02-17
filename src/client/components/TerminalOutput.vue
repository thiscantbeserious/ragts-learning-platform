<script setup lang="ts">
import AnsiLine from './AnsiLine.vue';

defineProps<{
  lines: string[];
}>();
</script>

<template>
  <div class="terminal-output">
    <div v-for="(line, index) in lines" :key="index" class="terminal-output__line">
      <AnsiLine :line="line" />
    </div>
  </div>
</template>

<style scoped>
.terminal-output {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.4;
  background: #0a0a0a;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  overflow-x: auto;
}

.terminal-output__line {
  min-height: 1.4em;
}
</style>

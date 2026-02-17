<script setup lang="ts">
import AnsiLine from './AnsiLine.vue';

/**
 * Demo component to visually test AnsiLine rendering.
 * Shows various ANSI escape code combinations.
 */
const demoLines = [
  { label: 'Plain text', line: 'Hello World - plain text with no formatting' },
  { label: 'Red text', line: '\x1b[31mRed Text\x1b[0m back to normal' },
  { label: 'Green background', line: 'Normal \x1b[42mGreen Background\x1b[0m normal' },
  { label: 'Bold', line: '\x1b[1mBold Text\x1b[0m normal' },
  { label: 'Underline', line: '\x1b[4mUnderlined Text\x1b[0m normal' },
  { label: 'Bold + Red', line: '\x1b[1;31mBold Red Text\x1b[0m normal' },
  { label: 'Bold + Underline + Red', line: '\x1b[1;4;31mBold Underline Red\x1b[0m normal' },
  { label: '256-color orange', line: '\x1b[38;5;208mOrange (256-color)\x1b[0m normal' },
  { label: '256-color bg', line: '\x1b[48;5;27mBlue background (256)\x1b[0m normal' },
  { label: 'Mixed segments', line: 'Plain \x1b[32mgreen\x1b[0m plain \x1b[1;33mbold yellow\x1b[0m plain' },
  { label: 'All 16 standard', line: '\x1b[30mBlk\x1b[31mRed\x1b[32mGrn\x1b[33mYel\x1b[34mBlu\x1b[35mMag\x1b[36mCyn\x1b[37mWht\x1b[0m \x1b[90mBBlk\x1b[91mBRed\x1b[92mBGrn\x1b[93mBYel\x1b[94mBBlu\x1b[95mBMag\x1b[96mBCyn\x1b[97mBWht\x1b[0m' },
  { label: 'Empty line', line: '' },
];
</script>

<template>
  <div class="ansi-demo">
    <h2>AnsiLine Component Demo</h2>
    <p>Visual test of ANSI escape code rendering</p>

    <div class="demo-container">
      <div
        v-for="(demo, index) in demoLines"
        :key="index"
        class="demo-line"
      >
        <div class="demo-label">{{ demo.label }}:</div>
        <div class="demo-output">
          <AnsiLine :line="demo.line" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ansi-demo {
  padding: 2rem;
  max-width: 800px;
}

h2 {
  color: #eeeeec;
  margin-bottom: 0.5rem;
}

p {
  color: #d3d7cf;
  margin-bottom: 2rem;
}

.demo-container {
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  padding: 1rem;
}

.demo-line {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.5rem;
  border-bottom: 1px solid #2e2e2e;
}

.demo-line:last-child {
  border-bottom: none;
}

.demo-label {
  flex: 0 0 180px;
  color: #8a8a8a;
  font-size: 0.875rem;
  font-family: monospace;
}

.demo-output {
  flex: 1;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  font-size: 0.875rem;
  background: #0a0a0a;
  padding: 0.25rem 0.5rem;
  border-radius: 2px;
}
</style>

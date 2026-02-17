<script setup lang="ts">
import type { SnapshotLine } from '../../../packages/vt-wasm/types';
import './terminal-colors.css';

const props = withDefaults(defineProps<{
  lines: SnapshotLine[];
  startLineNumber?: number;
}>(), {
  startLineNumber: 1,
});

/**
 * Convert a palette color index (0-255) to RGB color string.
 * 0-15: Standard ANSI colors (handled via CSS variables)
 * 16-231: 6×6×6 RGB cube
 * 232-255: Grayscale ramp
 */
function paletteToRgb(index: number): string {
  // Standard ANSI colors (0-15) are handled via CSS variables
  if (index < 16) {
    return `var(--term-color-${index})`;
  }

  // 216-color RGB cube (16-231)
  if (index >= 16 && index <= 231) {
    const cubeIndex = index - 16;
    const r = Math.floor(cubeIndex / 36);
    const g = Math.floor((cubeIndex % 36) / 6);
    const b = cubeIndex % 6;

    // Map 0-5 to 0, 95, 135, 175, 215, 255
    const toRgbValue = (v: number) => v === 0 ? 0 : 55 + v * 40;

    return `rgb(${toRgbValue(r)}, ${toRgbValue(g)}, ${toRgbValue(b)})`;
  }

  // Grayscale ramp (232-255)
  if (index >= 232 && index <= 255) {
    const gray = 8 + (index - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
  }

  // Fallback for out of range
  return 'inherit';
}

/**
 * Get foreground color style from span fg property.
 */
function getFgColor(fg?: string | number): string | undefined {
  if (fg === undefined) return undefined;
  if (typeof fg === 'string') return fg; // True color #RRGGBB
  return paletteToRgb(fg); // Palette index
}

/**
 * Get background color style from span bg property.
 */
function getBgColor(bg?: string | number): string | undefined {
  if (bg === undefined) return undefined;
  if (typeof bg === 'string') return bg; // True color #RRGGBB
  return paletteToRgb(bg); // Palette index
}

/**
 * Get CSS classes for a span based on text attributes.
 */
function getSpanClasses(span: { bold?: boolean; faint?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; blink?: boolean; inverse?: boolean }): string[] {
  const classes: string[] = ['terminal-span'];
  if (span.bold) classes.push('terminal-span--bold');
  if (span.faint) classes.push('terminal-span--faint');
  if (span.italic) classes.push('terminal-span--italic');
  if (span.underline) classes.push('terminal-span--underline');
  if (span.strikethrough) classes.push('terminal-span--strikethrough');
  if (span.blink) classes.push('terminal-span--blink');
  if (span.inverse) classes.push('terminal-span--inverse');
  return classes;
}

/**
 * Get inline styles for a span.
 */
function getSpanStyle(span: { fg?: string | number; bg?: string | number }): Record<string, string> {
  const style: Record<string, string> = {};
  const fgColor = getFgColor(span.fg);
  const bgColor = getBgColor(span.bg);
  if (fgColor) style.color = fgColor;
  if (bgColor) style.backgroundColor = bgColor;
  return style;
}
</script>

<template>
  <div class="terminal-snapshot">
    <div
      v-for="(line, lineIndex) in lines"
      :key="lineIndex"
      class="terminal-line"
    >
      <span class="terminal-line__number">{{ startLineNumber + lineIndex }}</span>
      <span class="terminal-line__content"><span
        v-for="(span, spanIndex) in line.spans"
        :key="spanIndex"
        :class="getSpanClasses(span)"
        :style="getSpanStyle(span)"
      >{{ span.text }}</span></span>
    </div>
  </div>
</template>

<style scoped>
.terminal-snapshot {
  font-size: 0.875rem;
  line-height: 1.4;
  padding: 0.75rem 0;
  white-space: pre;
}

.terminal-line {
  display: flex;
  min-height: 1.4em; /* Preserve empty lines */
}

.terminal-line__number {
  display: inline-block;
  width: 5ch;
  min-width: 5ch;
  text-align: right;
  padding-right: 1ch;
  color: #444;
  user-select: none;
  flex-shrink: 0;
  border-right: 1px solid #222;
  margin-right: 1ch;
}

.terminal-line__content {
  white-space: pre;
  flex: 1;
}

.terminal-span {
  white-space: pre;
}

/* Text attributes */
.terminal-span--bold {
  font-weight: 700;
}

.terminal-span--faint {
  opacity: 0.5;
}

.terminal-span--italic {
  font-style: italic;
}

.terminal-span--underline {
  text-decoration: underline;
}

.terminal-span--strikethrough {
  text-decoration: line-through;
}

.terminal-span--blink {
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.terminal-span--inverse {
  /* Swap foreground and background colors */
  /* This is a simplified implementation - true inverse would swap actual colors */
  filter: invert(1) hue-rotate(180deg);
}
</style>

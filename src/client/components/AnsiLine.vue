<script setup lang="ts">
import { computed } from 'vue';
import anser from 'anser';

/**
 * Renders a single terminal line with ANSI color codes and text styles.
 * Uses anser library to parse ANSI codes into structured data, then maps
 * to span elements with CSS classes. Safe by design - no v-html.
 */
const props = defineProps<{
  /** Raw terminal line with ANSI escape codes */
  line: string;
}>();

interface AnserSpan {
  content: string;
  fg?: string;
  bg?: string;
  decorations: string[];
}

/**
 * Parse ANSI codes into structured spans with styles.
 * Strips non-ANSI control sequences (cursor movement, etc.) for MVP.
 */
const spans = computed<AnserSpan[]>(() => {
  // Strip non-ANSI CSI sequences that aren't SGR (ending with 'm').
  // CSI = \x1b[ followed by params, then a final byte in 0x40-0x7E range.
  // We keep SGR (m) and remove everything else (cursor, erase, scroll, etc.)
  const cleanedLine = props.line.replace(/\x1b\[[\d;]*[A-LNS-Zf-l]/g, '');

  const parsed = anser.ansiToJson(cleanedLine, {
    use_classes: true,
    json: true,
    remove_empty: false
  });

  if (parsed.length === 0) {
    return [{ content: '', decorations: [] }];
  }

  return parsed.map((segment: any) => ({
    content: segment.content || '',
    fg: segment.fg,
    bg: segment.bg,
    decorations: segment.decorations || []
  }));
});

/**
 * Build CSS class string for a span based on its styles.
 */
function getSpanClasses(span: AnserSpan): string {
  const classes: string[] = [];

  if (span.fg) {
    classes.push(`ansi-fg-${span.fg}`);
  }

  if (span.bg) {
    classes.push(`ansi-bg-${span.bg}`);
  }

  for (const dec of span.decorations) {
    if (dec) {
      classes.push(`ansi-${dec}`);
    }
  }

  return classes.join(' ');
}
</script>

<template>
  <span class="ansi-line">
    <span
      v-for="(span, index) in spans"
      :key="index"
      :class="getSpanClasses(span)"
    >{{ span.content }}</span>
  </span>
</template>

<style scoped>
.ansi-line {
  display: inline-block;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>

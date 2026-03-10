<script setup lang="ts">
/**
 * Skeleton placeholder card shown during initial session load.
 * Bar widths vary by variant (1/2/3) to avoid identical-looking placeholders.
 */

const props = defineProps<{
  variant: 1 | 2 | 3;
}>();

/** Width configs keyed by variant for preview bars. */
const PREVIEW_WIDTHS: Record<1 | 2 | 3, string[]> = {
  1: ['60%', '80%', '45%', '70%'],
  2: ['50%', '90%', '65%', '55%'],
  3: ['70%', '55%', '85%', '40%'],
};

/** Body bar width by variant. */
const BODY_WIDTH: Record<1 | 2 | 3, string> = {
  1: '75%',
  2: '85%',
  3: '65%',
};

/** Meta bar widths (first two skeleton--text-sm items) by variant. */
const META_WIDTHS: Record<1 | 2 | 3, [string, string]> = {
  1: ['70px', '80px'],
  2: ['65px', '90px'],
  3: ['75px', '85px'],
};

/** Footer bar widths by variant. */
const FOOTER_WIDTHS: Record<1 | 2 | 3, [string, string]> = {
  1: ['60px', '45px'],
  2: ['55px', '50px'],
  3: ['70px', '40px'],
};
</script>

<template>
  <div class="landing__skeleton-card">
    <div class="landing__skeleton-preview">
      <div
        v-for="(width, i) in PREVIEW_WIDTHS[props.variant]"
        :key="i"
        class="skeleton skeleton--text"
        :style="{ width }"
      />
    </div>
    <div class="landing__skeleton-body">
      <div
        class="skeleton skeleton--text"
        :style="{ width: BODY_WIDTH[props.variant] }"
      />
      <div style="display: flex; gap: var(--space-3);">
        <div
          class="skeleton skeleton--text-sm"
          :style="{ width: META_WIDTHS[props.variant][0] }"
        />
        <div
          class="skeleton skeleton--text-sm"
          :style="{ width: META_WIDTHS[props.variant][1] }"
        />
      </div>
      <div class="landing__skeleton-footer">
        <div
          class="skeleton skeleton--text-sm"
          :style="{ width: FOOTER_WIDTHS[props.variant][0] }"
        />
        <div
          class="skeleton skeleton--text-sm"
          :style="{ width: FOOTER_WIDTHS[props.variant][1] }"
        />
      </div>
    </div>
  </div>
</template>

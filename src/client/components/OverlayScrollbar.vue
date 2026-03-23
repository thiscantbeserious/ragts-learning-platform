<template>
  <div
    class="overlay-scrollbar"
    :class="{
      'overlay-scrollbar--scrolling': isScrolling,
      'overlay-scrollbar--dragging': isDragging,
      'overlay-scrollbar--visible': isHovered || isFocusWithin,
      'overlay-scrollbar--show-track': showTrack,
    }"
    @mouseenter="onContainerEnter"
    @mouseleave="onContainerLeave"
    @focusin="isFocusWithin = true"
    @focusout="onFocusOut"
  >
    <div
      ref="viewportRef"
      class="overlay-scrollbar__viewport"
      @scroll="onScroll"
    >
      <slot />
    </div>
    <div
      v-if="hasOverflow"
      ref="trackRef"
      class="overlay-scrollbar__track"
      @mousedown="onTrackClick"
    >
      <div
        class="overlay-scrollbar__thumb"
        :style="thumbStyle"
        @mousedown.stop="onThumbMouseDown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

/**
 * OverlayScrollbar wraps scrollable content and renders a custom
 * TRON-themed scrollbar overlay that works across all browsers,
 * including Safari which does not support CSS scrollbar styling.
 *
 * Props:
 *   showTrack   — render a visible track background (default false)
 *   showOnHover — show scrollbar when hovering the container (default true)
 *
 * The scrollbar also shows on:
 *   - Active scrolling (fades after 1.5s idle)
 *   - Container hover (when showOnHover is true)
 *   - Focus within the container (keyboard navigation)
 *   - Thumb drag
 */

const props = withDefaults(defineProps<{
  showTrack?: boolean;
  showOnHover?: boolean;
}>(), {
  showTrack: false,
  showOnHover: true,
});

const MIN_THUMB_HEIGHT = 24;
const SCROLL_IDLE_MS = 1500;

const viewportRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);

const thumbHeight = ref(0);
const thumbTop = ref(0);
const isScrolling = ref(false);
const isDragging = ref(false);
const isHovered = ref(false);
const isFocusWithin = ref(false);
const hasOverflow = ref(false);

let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let overflowWatchRafId: number | null = null;

// Drag state
let dragStartY = 0;
let dragStartScrollTop = 0;

/** Thumb style as inline CSS for position and size. */
const thumbStyle = computed(() => ({
  height: `${thumbHeight.value}px`,
  top: `${thumbTop.value}px`,
}));

/** Recalculates thumb size and position from current viewport state. */
function recalculate(): void {
  const viewport = viewportRef.value;
  const track = trackRef.value;
  if (!viewport) return;

  const { scrollHeight, clientHeight, scrollTop } = viewport;

  hasOverflow.value = scrollHeight > clientHeight;

  if (!hasOverflow.value) {
    thumbHeight.value = 0;
    thumbTop.value = 0;
    return;
  }

  // Track may not be in DOM yet if hasOverflow just became true
  if (!track) return;

  const trackHeight = track.clientHeight;
  if (trackHeight === 0) return;

  const ratio = clientHeight / scrollHeight;
  const rawThumbHeight = ratio * trackHeight;
  const clampedThumbHeight = Math.max(MIN_THUMB_HEIGHT, rawThumbHeight);
  thumbHeight.value = clampedThumbHeight;

  const maxScroll = scrollHeight - clientHeight;
  const maxThumbTop = trackHeight - clampedThumbHeight;
  thumbTop.value = maxScroll > 0 ? (scrollTop / maxScroll) * maxThumbTop : 0;
}

/** Handles native scroll events: recalculate position and show scrollbar. */
function onScroll(): void {
  const viewport = viewportRef.value;
  if (!viewport) return;

  const { scrollHeight, clientHeight } = viewport;
  if (scrollHeight <= clientHeight) {
    isScrolling.value = false;
    return;
  }

  recalculate();
  isScrolling.value = true;
  resetIdleTimer();
}

/** Resets the idle timer that hides the scrollbar after inactivity. */
function resetIdleTimer(): void {
  if (scrollIdleTimer !== null) clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    if (!isDragging.value) isScrolling.value = false;
  }, SCROLL_IDLE_MS);
}

/** Shows scrollbar on container hover. */
function onContainerEnter(): void {
  if (props.showOnHover) {
    isHovered.value = true;
    recalculate();
  }
}

/** Hides scrollbar when mouse leaves container. */
function onContainerLeave(): void {
  isHovered.value = false;
}

/** Hides scrollbar when focus leaves the container entirely. */
function onFocusOut(event: FocusEvent): void {
  const container = (event.currentTarget as HTMLElement);
  const relatedTarget = event.relatedTarget as Node | null;
  if (!relatedTarget || !container.contains(relatedTarget)) {
    isFocusWithin.value = false;
  }
}

/** Handles a click on the track: scrolls to the clicked position. */
function onTrackClick(event: MouseEvent): void {
  const viewport = viewportRef.value;
  const track = trackRef.value;
  if (!viewport || !track) return;

  const trackRect = track.getBoundingClientRect();
  const clickRatio = (event.clientY - trackRect.top) / trackRect.height;
  const { scrollHeight, clientHeight } = viewport;
  viewport.scrollTop = clickRatio * (scrollHeight - clientHeight);
}

/** Starts thumb drag: captures mouse position and attaches document listeners. */
function onThumbMouseDown(event: MouseEvent): void {
  event.preventDefault();
  isDragging.value = true;
  dragStartY = event.clientY;
  dragStartScrollTop = viewportRef.value?.scrollTop ?? 0;
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

/** Updates scroll position while dragging the thumb. */
function onDragMove(event: MouseEvent): void {
  const viewport = viewportRef.value;
  const track = trackRef.value;
  if (!viewport || !track) return;

  const deltaY = event.clientY - dragStartY;
  const { scrollHeight, clientHeight } = viewport;
  const trackHeight = track.clientHeight;

  const maxScroll = scrollHeight - clientHeight;
  const maxThumbTop = trackHeight - thumbHeight.value;
  if (maxThumbTop <= 0) return;

  const scrollDelta = (deltaY / maxThumbTop) * maxScroll;
  viewport.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScrollTop + scrollDelta));
}

/** Ends thumb drag and cleans up document listeners. */
function onDragEnd(): void {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  resetIdleTimer();
}

// Recalculate when hasOverflow changes (track enters/leaves DOM)
watch(hasOverflow, () => {
  overflowWatchRafId = requestAnimationFrame(() => recalculate());
});

onMounted(() => {
  const viewport = viewportRef.value;
  if (!viewport) return;

  resizeObserver = new ResizeObserver(() => recalculate());
  resizeObserver.observe(viewport);

  // Watch for child list changes (e.g. slot content replaced at runtime)
  // so recalculate() runs even without a scroll or resize event.
  mutationObserver = new MutationObserver(() => recalculate());
  mutationObserver.observe(viewport, { childList: true, subtree: true });

  recalculate();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  if (scrollIdleTimer !== null) clearTimeout(scrollIdleTimer);
  if (overflowWatchRafId !== null) cancelAnimationFrame(overflowWatchRafId);
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
});

/**
 * Expose the viewport element ref so parent components (e.g. a virtualizer)
 * can use it as the TanStack Virtual scroll element.
 * Also exposes MutationObserver control so callers can pause DOM mutation
 * tracking while a virtualizer manages section DOM nodes, then resume it.
 */
defineExpose({
  viewport: viewportRef,
  pauseMutationObserver: () => mutationObserver?.disconnect(),
  resumeMutationObserver: () => {
    const vp = viewportRef.value;
    if (!vp || !mutationObserver) return;
    mutationObserver.observe(vp, { childList: true, subtree: true });
  },
});
</script>

<style scoped>
.overlay-scrollbar {
  position: relative;
  overflow: hidden;
}

.overlay-scrollbar__viewport {
  height: 100%;
  overflow-y: scroll;
  /* Hide native scrollbar across all browsers */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge legacy */
}

.overlay-scrollbar__viewport::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Edge */
}

/* Track — positioned along right edge */
.overlay-scrollbar__track {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  z-index: 10;
  opacity: 0;
  transition: opacity 150ms ease-out;
}

/* Track background — only shown when showTrack prop is true */
.overlay-scrollbar--show-track .overlay-scrollbar__track {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

/* Show track on: scrolling, dragging, container hover, focus-within */
.overlay-scrollbar--scrolling .overlay-scrollbar__track,
.overlay-scrollbar--dragging .overlay-scrollbar__track,
.overlay-scrollbar--visible .overlay-scrollbar__track,
.overlay-scrollbar__track:hover {
  opacity: 1;
}

/* Rider animation: Knight Rider style — light bounces up and down the thumb.
   Uses alternate direction so ease-in-out applies to each sweep individually. */
@keyframes thumb-rider {
  0%   { transform: translateY(-50%); }
  100% { transform: translateY(250%); }
}

/* Thumb */
.overlay-scrollbar__thumb {
  position: absolute;
  right: 0;
  width: 6px;
  min-height: 24px;
  background: var(--accent-primary-glow);
  border-radius: 9999px;
  overflow: hidden;
  transition: background 150ms ease-out;
  cursor: pointer;
}

/* Rider highlight band — hidden by default */
.overlay-scrollbar__thumb::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in srgb, var(--accent-primary) 80%, transparent),
    transparent
  );
  transform: translateY(-100%);
  animation: none;
  border-radius: inherit;
}

/* Hover: brighten + activate rider */
.overlay-scrollbar__thumb:hover {
  background: color-mix(in srgb, var(--accent-primary) 60%, transparent);
}

.overlay-scrollbar__thumb:hover::before {
  animation: thumb-rider 2.4s ease-in-out infinite alternate;
}

/* Active/dragging: brightest + rider */
.overlay-scrollbar__thumb:active,
.overlay-scrollbar--dragging .overlay-scrollbar__thumb {
  background: var(--accent-primary-glow-strong);
}

.overlay-scrollbar__thumb:active::before {
  animation: thumb-rider 2.4s ease-in-out infinite alternate;
}

.overlay-scrollbar--dragging .overlay-scrollbar__thumb::before {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .overlay-scrollbar__track {
    transition: none;
  }
  .overlay-scrollbar__thumb {
    transition: none;
  }
  .overlay-scrollbar__thumb::before {
    animation: none;
  }
}
</style>

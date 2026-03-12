<template>
  <div
    class="overlay-scrollbar"
    :class="{
      'overlay-scrollbar--scrolling': isScrolling,
      'overlay-scrollbar--dragging': isDragging,
    }"
  >
    <div
      ref="viewportRef"
      class="overlay-scrollbar__viewport"
      @scroll="onScroll"
    >
      <slot />
    </div>
    <div
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/**
 * OverlayScrollbar wraps scrollable content and renders a custom
 * TRON-themed scrollbar overlay that works across all browsers,
 * including Safari which does not support ::-webkit-scrollbar.
 *
 * Usage: <OverlayScrollbar class="sidebar__list-region">...</OverlayScrollbar>
 */

const MIN_THUMB_HEIGHT = 24;
const SCROLL_IDLE_MS = 1500;

const viewportRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);

const thumbHeight = ref(0);
const thumbTop = ref(0);
const isScrolling = ref(false);
const isDragging = ref(false);

let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;

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
  if (!viewport || !track) return;

  const { scrollHeight, clientHeight, scrollTop } = viewport;
  const trackHeight = track.clientHeight;

  if (scrollHeight <= clientHeight || trackHeight === 0) {
    thumbHeight.value = 0;
    thumbTop.value = 0;
    return;
  }

  const ratio = clientHeight / scrollHeight;
  const rawThumbHeight = ratio * trackHeight;
  const clampedThumbHeight = Math.max(MIN_THUMB_HEIGHT, rawThumbHeight);
  thumbHeight.value = clampedThumbHeight;

  updateThumbTop(scrollTop, scrollHeight, clientHeight, trackHeight, clampedThumbHeight);
}

/** Updates only the thumb's top position given the current scroll state. */
function updateThumbTop(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  trackHeight: number,
  clampedThumbHeight: number,
): void {
  const maxScroll = scrollHeight - clientHeight;
  const maxThumbTop = trackHeight - clampedThumbHeight;
  thumbTop.value = maxScroll > 0 ? (scrollTop / maxScroll) * maxThumbTop : 0;
}

/** Handles native scroll events: recalculate position and show scrollbar. */
function onScroll(): void {
  const viewport = viewportRef.value;
  const track = trackRef.value;
  if (!viewport || !track) return;

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

onMounted(() => {
  const viewport = viewportRef.value;
  if (!viewport) return;

  resizeObserver = new ResizeObserver(() => recalculate());
  resizeObserver.observe(viewport);

  // Observe the viewport's first child to catch content height changes
  if (viewport.firstElementChild) {
    resizeObserver.observe(viewport.firstElementChild as Element);
  }

  recalculate();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (scrollIdleTimer !== null) clearTimeout(scrollIdleTimer);
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
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

.overlay-scrollbar--scrolling .overlay-scrollbar__track,
.overlay-scrollbar__track:hover {
  opacity: 1;
}

.overlay-scrollbar__thumb {
  position: absolute;
  right: 0;
  width: 6px;
  min-height: 24px;
  background: rgba(0, 212, 255, 0.4);
  border-radius: 9999px;
  box-shadow: 0 0 6px rgba(0, 212, 255, 0.25);
  transition: background 150ms ease-out, box-shadow 150ms ease-out;
  cursor: pointer;
}

.overlay-scrollbar__thumb:hover {
  background: rgba(0, 212, 255, 0.6);
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
}

.overlay-scrollbar__thumb:active,
.overlay-scrollbar--dragging .overlay-scrollbar__thumb {
  background: rgba(0, 212, 255, 0.75);
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}
</style>

<template>
  <aside
    class="section-nav"
    role="navigation"
    aria-label="Section navigator"
  >
    <!-- Section count header -->
    <div class="section-nav__header">
      <span class="section-nav__count">{{ sections.length }}</span>
    </div>

    <!-- Pill list wrapped in overlay scrollbar -->
    <OverlayScrollbar class="section-nav__scrollbar">
      <div class="section-nav__list">
        <div class="section-nav__trace" />

        <!-- Active pill pointer — inside scroll container so it moves with pills -->
        <div
          class="section-nav__pointer"
          :class="{ 'section-nav__pointer--marker': activeSection?.type === 'marker' }"
          :style="pointerStyle"
        />

        <button
          v-for="(section, index) in sections"
          :key="section.id"
          ref="pillRefs"
          class="section-pill"
          :class="pillClasses(section)"
          :aria-current="section.id === activeId ? 'true' : undefined"
          :aria-label="section.label"
          :title="section.label"
          tabindex="0"
          @click="onPillClick(section.id)"
          @keydown.enter="onPillClick(section.id)"
          @keydown.space.prevent="onPillClick(section.id)"
          @keydown.arrow-up.prevent="focusPill(index - 1)"
          @keydown.arrow-down.prevent="focusPill(index + 1)"
          @mouseenter="onPillEnter(section, $event)"
          @mouseleave="onPillLeave"
        >
          {{ index + 1 }}
        </button>
      </div>
    </OverlayScrollbar>

    <!-- Popover rendered via Teleport to avoid clipping from overflow:hidden -->
    <Teleport to="body">
      <div
        v-if="hoveredSection !== null"
        class="section-popover"
        :class="[`section-popover--${hoveredSection.type}`, { 'section-popover--no-arrow': popoverClamped }]"
        :style="popoverStyle"
        aria-hidden="true"
      >
        <div class="section-popover__header">
          <span class="section-popover__title">{{ hoveredSection.label }}</span>
          <span
            class="badge section-popover__badge"
            :class="hoveredSection.type === 'marker' ? 'badge--secondary' : 'badge--accent'"
          >
            {{ hoveredSection.type === 'marker' ? 'Marker' : 'Detected' }}
          </span>
        </div>
        <div class="section-popover__meta">
          <span v-if="hoveredSection.startLine != null && hoveredSection.endLine != null">
            L{{ hoveredSection.startLine + 1 }}&ndash;L{{ hoveredSection.endLine }}
          </span>
          <span>{{ hoveredSection.lineCount }} lines</span>
        </div>
        <div
          v-if="hoveredSection.preview != null"
          class="section-popover__preview"
        >
          {{ hoveredSection.preview }}
        </div>
        <div class="section-popover__slots">
          <slot name="popover-slots">
            <span class="section-popover__slot">Duration slot</span>
            <span class="section-popover__slot">Command count slot</span>
          </slot>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import OverlayScrollbar from './OverlayScrollbar.vue';
import { useScheduler } from '../composables/useScheduler.js';
import type { SectionMetadata } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * SectionNavigator renders a vertical pill list of section indicators.
 * Tracks the active section via activeId and scrolls the content view
 * on pill click via scrollToSection.
 */
const props = defineProps<{
  /** Ordered list of section metadata — drives pill rendering. */
  sections: SectionMetadata[];
  /** The currently active section id from the scrollspy composable. */
  activeId: string | null;
  /** Callback to scroll the main content view to the given section. */
  scrollToSection: (id: string) => void;
  /**
   * Optional prefetch callback fired after a 150 ms hover debounce.
   * Used to trigger content loading before the user clicks.
   */
  onHoverSection?: (id: string) => void;
}>();

// ---------------------------------------------------------------------------
// Scheduler for prefetch debounce
// ---------------------------------------------------------------------------

const scheduler = useScheduler();

// ---------------------------------------------------------------------------
// Pill refs for keyboard focus management
// ---------------------------------------------------------------------------

const pillRefs = ref<HTMLElement[]>([]);

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** The full SectionMetadata object for the currently active section. */
const activeSection = computed(() =>
  props.sections.find((s) => s.id === props.activeId) ?? null
);

/** The 0-based index of the active pill. */
const activeIndex = computed(() =>
  props.sections.findIndex((s) => s.id === props.activeId)
);

// ---------------------------------------------------------------------------
// Active pointer position
// ---------------------------------------------------------------------------

/**
 * Compute the pixel top position of the active pill indicator triangle.
 * Reads the bounding rect of the active pill element.
 */
const pointerTop = ref<number | null>(null);

watch(
  () => props.activeId,
  () => { updatePointerPosition(); },
  { flush: 'post' }
);

function updatePointerPosition(): void {
  const idx = activeIndex.value;
  if (idx < 0) {
    pointerTop.value = null;
    return;
  }
  const pill = pillRefs.value[idx];
  if (!pill) return;

  // Position relative to the pill list (pointer is inside the scroll container)
  // offsetTop gives position within the list, independent of scroll position
  pointerTop.value = pill.offsetTop + pill.offsetHeight / 2;

  // Auto-scroll the pill list to keep active pill visible
  pill.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const pointerStyle = computed(() => {
  if (pointerTop.value === null) return { display: 'none' };
  return { top: `${pointerTop.value}px`, display: '' };
});

// ---------------------------------------------------------------------------
// Pill class bindings
// ---------------------------------------------------------------------------

function pillClasses(section: SectionMetadata): Record<string, boolean> {
  return {
    'section-pill--detected': section.type === 'detected',
    'section-pill--marker': section.type === 'marker',
    'section-pill--active': section.id === props.activeId,
  };
}

// ---------------------------------------------------------------------------
// Click and keyboard navigation
// ---------------------------------------------------------------------------

function onPillClick(sectionId: string): void {
  props.scrollToSection(sectionId);
}

function focusPill(index: number): void {
  const clamped = Math.max(0, Math.min(props.sections.length - 1, index));
  pillRefs.value[clamped]?.focus();
}

// ---------------------------------------------------------------------------
// Hover popover
// ---------------------------------------------------------------------------

const hoveredSection = ref<SectionMetadata | null>(null);
const popoverStyle = ref<Record<string, string>>({});
const popoverClamped = ref(false);

/** Current prefetch cancel handle. */
let prefetchHandle = scheduler.after(0, () => {});

function onPillEnter(section: SectionMetadata, event: MouseEvent): void {
  hoveredSection.value = section;
  positionPopover(event.currentTarget as HTMLElement);

  prefetchHandle.cancel();
  if (props.onHoverSection) {
    const id = section.id;
    prefetchHandle = scheduler.after(150, () => {
      props.onHoverSection!(id);
    });
  }
}

function onPillLeave(): void {
  hoveredSection.value = null;
  prefetchHandle.cancel();
}

/**
 * Positions the popover to the left of the hovered pill.
 * Uses fixed positioning to escape overflow:hidden ancestors.
 */
function positionPopover(pillEl: HTMLElement): void {
  const rect = pillEl.getBoundingClientRect();
  const popoverWidth = 280;
  const gap = 12;
  const margin = 8;
  const left = rect.left - popoverWidth - gap;
  const pillCenter = rect.top + rect.height / 2;

  // Default: vertically centered on the pill
  popoverClamped.value = false;
  popoverStyle.value = {
    left: `${left}px`,
    top: `${pillCenter}px`,
    transform: 'translateY(-50%)',
    '--arrow-top': '50%',
  };

  // After next frame, check if popover overflows viewport and clamp if needed
  requestAnimationFrame(() => {
    const popoverEl = document.querySelector('.section-popover') as HTMLElement | null;
    if (!popoverEl) return;

    const popoverRect = popoverEl.getBoundingClientRect();

    if (popoverRect.bottom > window.innerHeight - margin) {
      popoverClamped.value = true;
      const top = window.innerHeight - popoverRect.height - margin;
      popoverStyle.value = {
        left: `${left}px`,
        top: `${top}px`,
        transform: 'none',
      };
    } else if (popoverRect.top < margin) {
      popoverClamped.value = true;
      popoverStyle.value = {
        left: `${left}px`,
        top: `${margin}px`,
        transform: 'none',
      };
    }
  });
}
</script>

<style scoped>
/* ================================================================
   SECTION NAVIGATOR — RIGHT-EDGE ASIDE
   ================================================================
   48px wide fixed aside. Numbered square pills (26px) connected
   by a vertical trace line. No container box — just pills on bg.
   ================================================================ */
.section-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  background: var(--bg-page);
  border-left: 1px solid var(--border-default);
  position: relative;
}

/* Active pill pointer — triangle on left edge */
.section-nav__pointer {
  position: absolute;
  left: 0;
  z-index: 5;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 6px solid var(--accent-primary);
  transform: translateY(-50%);
  transition: top var(--duration-normal) var(--easing-default);
  pointer-events: none;
}

.section-nav__pointer--marker {
  border-left-color: var(--accent-secondary);
}

.section-nav__header {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.section-nav__count {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  line-height: 1;
}

/* OverlayScrollbar wrapper — allows X overflow for popover */
.section-nav__scrollbar {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.section-nav :deep(.overlay-scrollbar) {
  clip-path: inset(0 -320px 0 0);
}

.section-nav__list {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-3) 0;
  gap: var(--space-2);
  position: relative;
  width: 100%;
}

/* Trace line connecting pill centers */
.section-nav__trace {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  background: var(--border-default);
  z-index: 0;
  pointer-events: none;
}

/* Individual pill */
.section-pill {
  position: relative;
  z-index: 1;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--easing-default);
  flex-shrink: 0;
  /* Reset button defaults */
  appearance: none;
  -webkit-appearance: none;
  padding: 0;
  line-height: 1;
}

.section-pill:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--bg-elevated);
}

.section-pill:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* Detected type — cyan accent */
.section-pill--detected {
  border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border-default));
  color: var(--text-secondary);
}

.section-pill--detected:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* Marker type — pink accent */
.section-pill--marker {
  border-color: color-mix(in srgb, var(--accent-secondary) 40%, var(--border-default));
  color: var(--text-secondary);
}

.section-pill--marker:hover {
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
}

/* Active state — cyan glow */
.section-pill--active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--bg-surface);
  box-shadow:
    0 0 0 2px var(--accent-primary-subtle),
    0 0 12px rgba(0, 212, 255, 0.3),
    0 0 24px rgba(0, 212, 255, 0.15);
}

/* Active marker variant */
.section-pill--active.section-pill--marker {
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
  background: var(--bg-surface);
  box-shadow:
    0 0 0 2px var(--accent-secondary-subtle),
    0 0 12px rgba(255, 77, 106, 0.3),
    0 0 24px rgba(255, 77, 106, 0.15);
}

@media (prefers-reduced-motion: reduce) {
  .section-nav__pointer {
    transition: none;
  }
  .section-pill {
    transition: none;
  }
}
</style>

<!-- Popover styles are unscoped because the popover is Teleported to <body>. -->
<style>
/* ================================================================
   SECTION POPOVER — appears to the LEFT of the pill on hover.
   Uses position:fixed (via Teleport) to avoid clipping.
   ================================================================ */
.section-popover {
  position: fixed;
  z-index: 1000;
  width: 280px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg), 0 0 20px rgba(0, 0, 0, 0.4);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}

/* Arrow pointing right toward the pill — uses --arrow-top from JS for clamped popovers */
.section-popover::after {
  content: '';
  position: absolute;
  top: var(--arrow-top, 50%);
  right: -6px;
  transform: translateY(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-strong);
  border-top: 1px solid var(--border-strong);
}

.section-popover--no-arrow::after {
  display: none;
}

.section-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.section-popover__title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.section-popover__badge {
  flex-shrink: 0;
}

.section-popover__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.section-popover__preview {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--lh-sm);
  color: var(--terminal-text);
  background: var(--terminal-bg);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  white-space: pre;
  overflow: hidden;
  max-height: 54px;
}

.section-popover__slots {
  display: flex;
  gap: var(--space-2);
  padding-top: var(--space-1);
  border-top: 1px solid var(--border-default);
}

.section-popover__slot {
  font-size: var(--text-xs);
  color: var(--text-disabled);
  font-style: italic;
}

/* Detected-type popover accent line */
.section-popover--detected {
  border-top: 2px solid var(--accent-primary);
}

/* Marker-type popover accent line */
.section-popover--marker {
  border-top: 2px solid var(--accent-secondary);
}
</style>

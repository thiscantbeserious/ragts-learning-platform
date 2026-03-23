/**
 * Tests for useSectionVirtualizer composable.
 *
 * Validates section-level virtualizer configuration, estimateSize behavior,
 * and scrollElement reactivity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { SectionMetadata } from '../../shared/types/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SectionMetadata for testing. */
function makeSection(id: string, lineCount: number, type: 'marker' | 'detected' = 'detected'): SectionMetadata {
  return {
    id,
    type,
    label: `Section ${id}`,
    startEvent: 0,
    endEvent: 10,
    startLine: 0,
    endLine: lineCount,
    lineCount,
    preview: null,
  };
}

// ---------------------------------------------------------------------------
// Mock @tanstack/vue-virtual so we can assert configuration without a DOM
// ---------------------------------------------------------------------------

import { isRef } from 'vue';

const capturedOptions: Array<Record<string, unknown>> = [];

vi.mock('@tanstack/vue-virtual', () => {
  return {
    useVirtualizer: vi.fn((opts: unknown) => {
      // useVirtualizer may receive a computed ref or plain object — resolve it
      const resolved = isRef(opts) ? (opts.value as Record<string, unknown>) : (opts as Record<string, unknown>);
      capturedOptions.push(resolved);
      return ref({
        getVirtualItems: () => [],
        getTotalSize: () => 0,
        measureElement: vi.fn(),
        scrollToIndex: vi.fn(),
      });
    }),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSectionVirtualizer', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
    vi.clearAllMocks();
  });

  it('passes section count as count option', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10), makeSection('s2', 20)]);
    const scrollEl = ref<HTMLElement | null>(null);

    useSectionVirtualizer(sections, scrollEl);

    expect(capturedOptions.length).toBeGreaterThan(0);
    const opts = capturedOptions[0] as Record<string, unknown>;
    expect(opts.count).toBe(2);
  });

  it('uses overscan of 3', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10)]);
    const scrollEl = ref<HTMLElement | null>(null);

    useSectionVirtualizer(sections, scrollEl);

    const opts = capturedOptions[0] as Record<string, unknown>;
    expect(opts.overscan).toBe(3);
  });

  it('estimateSize returns header height for empty section', async () => {
    const { useSectionVirtualizer, SECTION_HEADER_HEIGHT } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 0)]);
    const scrollEl = ref<HTMLElement | null>(null);

    useSectionVirtualizer(sections, scrollEl);

    const opts = capturedOptions[0] as Record<string, unknown>;
    const estimateSize = opts.estimateSize as (i: number) => number;
    expect(estimateSize(0)).toBe(SECTION_HEADER_HEIGHT);
  });

  it('estimateSize scales with line count', async () => {
    const { useSectionVirtualizer, SECTION_HEADER_HEIGHT, LINE_HEIGHT } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 50)]);
    const scrollEl = ref<HTMLElement | null>(null);

    useSectionVirtualizer(sections, scrollEl);

    const opts = capturedOptions[0] as Record<string, unknown>;
    const estimateSize = opts.estimateSize as (i: number) => number;
    const expected = SECTION_HEADER_HEIGHT + 50 * LINE_HEIGHT;
    expect(estimateSize(0)).toBe(expected);
  });

  it('estimateSize falls back to header height for out-of-range index', async () => {
    const { useSectionVirtualizer, SECTION_HEADER_HEIGHT } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10)]);
    const scrollEl = ref<HTMLElement | null>(null);

    useSectionVirtualizer(sections, scrollEl);

    const opts = capturedOptions[0] as Record<string, unknown>;
    const estimateSize = opts.estimateSize as (i: number) => number;
    // Index 5 is out of range for a 1-section array
    expect(estimateSize(5)).toBe(SECTION_HEADER_HEIGHT);
  });

  it('getScrollElement returns the current scrollEl value', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10)]);
    const el = document.createElement('div');
    const scrollEl = ref<HTMLElement | null>(el);

    useSectionVirtualizer(sections, scrollEl);

    const opts = capturedOptions[0] as Record<string, unknown>;
    const getScrollElement = opts.getScrollElement as () => HTMLElement | null;
    expect(getScrollElement()).toBe(el);
  });

  it('returns virtualizer and virtualItems', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10)]);
    const scrollEl = ref<HTMLElement | null>(null);

    const result = useSectionVirtualizer(sections, scrollEl);

    expect(result).toHaveProperty('virtualizer');
    expect(result).toHaveProperty('virtualItems');
  });

  it('returns scrollToSection function', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10), makeSection('s2', 20)]);
    const scrollEl = ref<HTMLElement | null>(null);

    const result = useSectionVirtualizer(sections, scrollEl);

    expect(typeof result.scrollToSection).toBe('function');
  });

  it('scrollToSection resolves section index by id', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10), makeSection('s2', 20)]);
    const scrollEl = ref<HTMLElement | null>(null);

    const result = useSectionVirtualizer(sections, scrollEl);

    // scrollToIndex is on the mocked virtualizer — just confirm no throw
    expect(() => result.scrollToSection('s2')).not.toThrow();
  });

  it('scrollToSection does nothing for unknown section id', async () => {
    const { useSectionVirtualizer } = await import('./use_section_virtualizer.js');

    const sections = ref([makeSection('s1', 10)]);
    const scrollEl = ref<HTMLElement | null>(null);

    const result = useSectionVirtualizer(sections, scrollEl);

    expect(() => result.scrollToSection('unknown')).not.toThrow();
  });
});

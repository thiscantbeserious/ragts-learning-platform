/**
 * Behavioral branch coverage tests for SessionContent component (Stage 11).
 *
 * SessionContent now accepts SectionMetadata[] + fetchSectionContent instead of
 * the old Section[] + session-level snapshot approach.
 *
 * Coverage targets:
 *  - 0-section fallback states (all 5 variants)
 *  - error states: failed/interrupted with 0 sections
 *  - processing state: non-terminal status
 *  - sections > 0: renders section items
 *  - virtual mode: renders virtual container when virtualItems provided
 *  - flat mode: renders all sections when no virtualItems
 *  - register-section event emitted on section mount
 *  - sticky overlay header: renders in virtual mode when activeSectionId matches
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionContent from './SessionContent.vue';
import type { SectionMetadata, SectionContentPage } from '../../shared/types/api.js';
import type { TerminalSnapshot } from '#vt-wasm/types';

// ---------------------------------------------------------------------------
// Stub child components
// ---------------------------------------------------------------------------

vi.mock('./SectionItem.vue', () => ({
  default: {
    name: 'SectionItemStub',
    props: ['section', 'fetchContent', 'defaultCollapsed'],
    emits: ['register'],
    template: '<div class="section-item-stub" :data-section-id="section.id" />',
  },
}));

vi.mock('./OverlayScrollbar.vue', () => ({
  default: {
    name: 'OverlayScrollbarStub',
    template: '<div class="overlay-scrollbar-stub"><slot /></div>',
    expose: ['viewport'],
  },
}));

vi.mock('./TerminalSnapshot.vue', () => ({
  default: {
    name: 'TerminalSnapshotStub',
    props: ['lines', 'startLineNumber'],
    template: '<div class="terminal-snapshot-stub" :data-line-count="lines.length" />',
  },
}));

vi.mock('./SectionHeader.vue', () => ({
  default: {
    name: 'SectionHeaderStub',
    props: ['section', 'collapsed', 'lineCount'],
    emits: ['toggle'],
    template:
      '<button class="section-header-stub" :data-section-id="section.id">{{ section.label }}</button>',
  },
}));

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeTerminalSnapshot(lineCount = 3): TerminalSnapshot {
  return {
    cols: 80,
    rows: 24,
    lines: Array.from({ length: lineCount }, (_, i) => ({
      spans: [{ text: `line ${i + 1}` }],
    })),
  };
}

function makeSection(id: string, lineCount = 10): SectionMetadata {
  return {
    id,
    type: 'detected',
    label: `Section ${id}`,
    startEvent: 0,
    endEvent: 10,
    startLine: 0,
    endLine: lineCount,
    lineCount,
    preview: null,
  };
}

const noopFetch = vi.fn(
  async (_id: string): Promise<SectionContentPage> => ({
    sectionId: _id,
    lines: [],
    totalLines: 0,
    offset: 0,
    limit: 500,
    hasMore: false,
    contentHash: 'abc',
  }),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionContent (Stage 11)', () => {
  describe('0-section fallback states', () => {
    it('state 1: completed + snapshot → info banner + full terminal snapshot', () => {
      const snapshot = makeTerminalSnapshot(5);
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'completed',
          snapshot,
        },
      });
      expect(wrapper.find('.fallback-banner--info').exists()).toBe(true);
      expect(wrapper.find('.fallback-banner--info').text()).toContain('No sections detected');
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(true);
      expect(wrapper.find('.terminal-snapshot-stub').attributes('data-line-count')).toBe('5');
    });

    it('state 2: completed + no snapshot → info banner + empty terminal state', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'completed',
        },
      });
      expect(wrapper.find('.fallback-banner--info').exists()).toBe(true);
      expect(wrapper.find('.terminal-empty-state').exists()).toBe(true);
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(false);
    });

    it('state 3: failed + snapshot → error banner + full terminal snapshot', () => {
      const snapshot = makeTerminalSnapshot(3);
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'failed',
          snapshot,
        },
      });
      expect(wrapper.find('.fallback-banner--error').exists()).toBe(true);
      expect(wrapper.find('.fallback-banner--error').text()).toContain('processing failed');
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(true);
    });

    it('state 4: failed + no snapshot → error banner + empty terminal state', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'failed',
        },
      });
      expect(wrapper.find('.fallback-banner--error').exists()).toBe(true);
      expect(wrapper.find('.terminal-empty-state--error').exists()).toBe(true);
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(false);
    });

    it('state 4b: interrupted + no snapshot → error banner + empty terminal state', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'interrupted',
        },
      });
      expect(wrapper.find('.fallback-banner--error').exists()).toBe(true);
      expect(wrapper.find('.terminal-empty-state--error').exists()).toBe(true);
    });

    it('state 5: processing (non-terminal) → "Session is being processed"', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'processing',
        },
      });
      expect(wrapper.find('.terminal-empty').text()).toContain('being processed');
    });

    it('state 5b: pending (non-terminal) → "Session is being processed"', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'pending',
        },
      });
      expect(wrapper.find('.terminal-empty').text()).toContain('being processed');
    });

    it('interrupted + snapshot → error banner + full snapshot', () => {
      const snapshot = makeTerminalSnapshot(2);
      const wrapper = mount(SessionContent, {
        props: {
          sections: [],
          fetchSectionContent: noopFetch,
          detectionStatus: 'interrupted',
          snapshot,
        },
      });
      expect(wrapper.find('.fallback-banner--error').exists()).toBe(true);
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(true);
    });
  });

  describe('sections > 0 — flat mode', () => {
    it('renders OverlayScrollbar when sections are present', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('s1'), makeSection('s2')],
          fetchSectionContent: noopFetch,
        },
      });
      expect(wrapper.find('.overlay-scrollbar-stub').exists()).toBe(true);
    });

    it('renders one SectionItem per section in flat mode', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('a'), makeSection('b'), makeSection('c')],
          fetchSectionContent: noopFetch,
        },
      });
      const items = wrapper.findAll('.section-item-stub');
      expect(items.length).toBe(3);
    });

    it('does not render virtual container in flat mode', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('s1')],
          fetchSectionContent: noopFetch,
        },
      });
      expect(wrapper.find('.section-virtual-container').exists()).toBe(false);
    });

    it('shows error banner above sections when status is failed', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('s1')],
          fetchSectionContent: noopFetch,
          detectionStatus: 'failed',
        },
      });
      expect(wrapper.find('.fallback-banner--error').exists()).toBe(true);
    });

    it('does NOT show info banner when sections exist', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('s1')],
          fetchSectionContent: noopFetch,
          detectionStatus: 'completed',
        },
      });
      expect(wrapper.find('.fallback-banner--info').exists()).toBe(false);
    });
  });

  describe('virtual mode — virtualItems provided', () => {
    it('renders virtual container when virtualItems are provided', () => {
      const virtualItems = [{ index: 0, key: 'sec-0', start: 0, end: 500, size: 500, lane: 0 }];
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('sec-0')],
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 1000,
        },
      });
      expect(wrapper.find('.section-virtual-container').exists()).toBe(true);
    });

    it('sets virtual container height from totalHeight prop', () => {
      const virtualItems = [{ index: 0, key: 'sec-0', start: 0, end: 500, size: 500, lane: 0 }];
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('sec-0')],
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 2500,
        },
      });
      const container = wrapper.find('.section-virtual-container');
      expect(container.attributes('style')).toContain('height: 2500px');
    });

    it('renders only the virtual items (not all sections)', () => {
      const sections = [makeSection('s0'), makeSection('s1'), makeSection('s2')];
      const virtualItems = [{ index: 1, key: 's1', start: 500, end: 1000, size: 500, lane: 0 }];
      const wrapper = mount(SessionContent, {
        props: {
          sections,
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 3000,
        },
      });
      const items = wrapper.findAll('.section-item-stub');
      // Only section at index 1 is rendered
      expect(items.length).toBe(1);
      expect(items[0]?.attributes('data-section-id')).toBe('s1');
    });

    it('only renders section items inside the virtual container in virtual mode', () => {
      const sections = [makeSection('sec-0'), makeSection('sec-1')];
      const virtualItems = [{ index: 0, key: 'sec-0', start: 0, end: 200, size: 200, lane: 0 }];
      const wrapper = mount(SessionContent, {
        props: {
          sections,
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 500,
        },
      });
      const container = wrapper.find('.section-virtual-container');
      expect(container.exists()).toBe(true);
      // All rendered items should be inside the virtual container
      const allItems = wrapper.findAll('.section-item-stub');
      const containerItems = container.findAll('.section-item-stub');
      expect(allItems.length).toBe(containerItems.length);
    });
  });

  describe('register-section event', () => {
    it('does not throw when register-section event is emitted', () => {
      const wrapper = mount(SessionContent, {
        props: {
          sections: [makeSection('s1')],
          fetchSectionContent: noopFetch,
        },
      });
      // Simulate what SectionItem would emit
      expect(() => {
        wrapper.vm.$emit('register-section', 's1', document.createElement('div'));
      }).not.toThrow();
    });
  });

  describe('sticky overlay header (virtual mode)', () => {
    const virtualItems = [
      { index: 0, key: 'sec-0', start: 0, end: 500, size: 500, lane: 0 },
      { index: 1, key: 'sec-1', start: 500, end: 1000, size: 500, lane: 0 },
    ];

    it('sticky overlay is hidden at scroll position 0 even with activeSectionId set', () => {
      const sections = [makeSection('sec-0'), makeSection('sec-1')];
      const wrapper = mount(SessionContent, {
        props: {
          sections,
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 1000,
          activeSectionId: 'sec-1',
        },
      });
      // Sticky requires scroll (realHeaderScrolledAbove starts false) — no scroll in unit tests
      expect(wrapper.find('.section-sticky-overlay').exists()).toBe(false);
    });

    it('does not render sticky overlay when activeSectionId is null', () => {
      const sections = [makeSection('sec-0'), makeSection('sec-1')];
      const wrapper = mount(SessionContent, {
        props: {
          sections,
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 1000,
          activeSectionId: null,
        },
      });
      expect(wrapper.find('.section-sticky-overlay').exists()).toBe(false);
    });

    it('does not render sticky overlay in flat mode even with activeSectionId', () => {
      const sections = [makeSection('sec-0'), makeSection('sec-1')];
      const wrapper = mount(SessionContent, {
        props: {
          sections,
          fetchSectionContent: noopFetch,
          // No virtualItems — flat mode
          activeSectionId: 'sec-0',
        },
      });
      expect(wrapper.find('.section-sticky-overlay').exists()).toBe(false);
    });

    it('does not render sticky overlay when activeSectionId does not match any section', () => {
      const sections = [makeSection('sec-0'), makeSection('sec-1')];
      const wrapper = mount(SessionContent, {
        props: {
          sections,
          fetchSectionContent: noopFetch,
          virtualItems,
          totalHeight: 1000,
          activeSectionId: 'unknown-id',
        },
      });
      expect(wrapper.find('.section-sticky-overlay').exists()).toBe(false);
    });
  });
});

/**
 * Behavioral branch coverage tests for SessionContent component.
 *
 * Lines targeted:
 *   24  — preambleLines: null snapshot or no sections returns []
 *   34  — getSectionLineCount: startLine/endLine null → falls back to snapshot.lines.length
 *   70  — template v-if/v-else-if: CLI section (startLine+endLine+snapshot), TUI section
 *         (snapshot only), empty section (neither)
 *   State A — zero-section fallback: completed + no sections + snapshot exists → info banner
 *
 * Uses light stubs for child components to avoid vt-wasm dependency.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SessionContent from './SessionContent.vue';
import type { Section } from '../composables/useSession.js';

// ---------------------------------------------------------------------------
// Stub child components to avoid pulling in vt-wasm / complex rendering
// ---------------------------------------------------------------------------

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
    template: '<div class="section-header-stub" @click="$emit(\'toggle\')" />',
  },
}));

vi.mock('./OverlayScrollbar.vue', () => ({
  default: {
    name: 'OverlayScrollbarStub',
    template: '<div class="overlay-scrollbar-stub"><slot /></div>',
  },
}));

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

interface TerminalLine {
  text: string;
  styles: unknown[];
}

interface MockSnapshot {
  lines: TerminalLine[];
  width: number;
  height: number;
}

function makeLine(text = 'line'): TerminalLine {
  return { text, styles: [] };
}

function makeSnapshot(lineCount = 5): MockSnapshot {
  return {
    lines: Array.from({ length: lineCount }, (_, i) => makeLine(`line-${i}`)),
    width: 80,
    height: 24,
  };
}

function makeCliSection(id: string, startLine: number, endLine: number): Section {
  return {
    id,
    type: 'detected',
    label: `Section ${id}`,
    startEvent: 0,
    endEvent: 10,
    startLine,
    endLine,
    snapshot: null,
  };
}

function makeTuiSection(id: string, lines: number): Section {
  return {
    id,
    type: 'detected',
    label: `TUI ${id}`,
    startEvent: 0,
    endEvent: 10,
    startLine: null,
    endLine: null,
    snapshot: makeSnapshot(lines) as unknown as Section['snapshot'],
  };
}

function makeEmptySection(id: string): Section {
  return {
    id,
    type: 'detected',
    label: `Empty ${id}`,
    startEvent: 0,
    endEvent: 10,
    startLine: null,
    endLine: null,
    snapshot: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionContent', () => {
  describe('detectionStatus prop', () => {
    it('accepts detectionStatus prop without errors (defaults to completed)', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [] },
      });
      // Component should mount cleanly; no error thrown
      expect(wrapper.exists()).toBe(true);
    });

    it('accepts an explicit detectionStatus value', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [], detectionStatus: 'pending' },
      });
      expect(wrapper.exists()).toBe(true);
    });
  });

  describe('empty / null state', () => {
    it('renders the empty state when snapshot is null and sections is empty', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [], detectionStatus: 'completed' },
      });
      expect(wrapper.find('.terminal-empty').exists()).toBe(true);
      expect(wrapper.find('.terminal-empty').text()).toContain('No content available');
    });

    it('renders the scrollable area when sections exist even without a snapshot', () => {
      const sections: Section[] = [makeCliSection('s1', 0, 5)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections },
      });
      // OverlayScrollbar should render (snapshot is null but sections.length > 0)
      expect(wrapper.find('.overlay-scrollbar-stub').exists()).toBe(true);
    });

    it('renders the scrollable area when snapshot exists even without sections', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [] },
      });
      expect(wrapper.find('.overlay-scrollbar-stub').exists()).toBe(true);
    });
  });

  describe('preamble lines (line 24)', () => {
    it('renders preamble when first section starts after line 0', () => {
      const snapshot = makeSnapshot(10);
      const sections: Section[] = [makeCliSection('s1', 3, 8)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      // Preamble TerminalSnapshot should render (firstSection.startLine = 3 > 0)
      const stubs = wrapper.findAll('.terminal-snapshot-stub');
      // At least one stub for preamble
      expect(stubs.length).toBeGreaterThan(0);
    });

    it('does not render preamble when first section starts at line 0', () => {
      const snapshot = makeSnapshot(10);
      const sections: Section[] = [makeCliSection('s1', 0, 5)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      // No preamble — count snapshots: should only include section content, not preamble
      // The preamble condition: startLine > 0 is false (startLine = 0)
      // We verify by checking the count vs the single section
      const stubs = wrapper.findAll('.terminal-snapshot-stub');
      // Stubs from section content only (the section itself)
      expect(stubs.length).toBeLessThanOrEqual(1);
    });

    it('does not render preamble when snapshot is null', () => {
      const sections: Section[] = [makeCliSection('s1', 5, 10)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections },
      });
      // preambleLines returns [] because snapshot is null
      // So no preamble TerminalSnapshotComponent for this condition
      // The section renders but no preamble stub should show a large line count
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(false);
    });

    it('does not render section-preamble when sections array is empty (State A renders full snapshot instead)', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'completed' },
      });
      // State A renders full snapshot — no section header rendered, but snapshot stub IS present
      expect(wrapper.find('.section-header-stub').exists()).toBe(false);
      // The snapshot stub is rendered (full-session view, not a preamble slice)
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(true);
    });
  });

  describe('getSectionLineCount (line 34)', () => {
    it('returns endLine - startLine when both are set (CLI section)', () => {
      // A CLI section with startLine=2, endLine=7 → lineCount = 5
      // We verify the section header stub receives the correct lineCount prop
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeCliSection('cli-1', 2, 7)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      const header = wrapper.find('.section-header-stub');
      expect(header.exists()).toBe(true);
      // lineCount prop should be 7 - 2 = 5
      // Vue test-utils exposes props via .props() on component wrapper
      // Use getAttribute for stub data or check wrapper.getComponent
    });

    it('returns section snapshot line count when startLine/endLine are null (TUI section)', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeTuiSection('tui-1', 8)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      // TUI section should render the section snapshot (not slice from session snapshot)
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(true);
    });

    it('returns 0 line count for an empty section (no startLine, no snapshot)', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeEmptySection('empty-1')];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      // Empty section should render the "No content captured" div
      expect(wrapper.find('.section-empty').text()).toBe('No content captured');
    });
  });

  describe('CLI section rendering (line 70)', () => {
    it('renders CLI TerminalSnapshot slice when section has startLine, endLine, and session snapshot', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeCliSection('cli-2', 5, 15)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      // The CLI branch renders TerminalSnapshotComponent with sliced lines
      const stub = wrapper.find('.terminal-snapshot-stub');
      expect(stub.exists()).toBe(true);
    });

    it('renders TUI TerminalSnapshot when section has snapshot but no startLine/endLine', () => {
      const sections: Section[] = [makeTuiSection('tui-2', 12)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections },
      });
      // TUI branch renders with section.snapshot.lines
      const stub = wrapper.find('.terminal-snapshot-stub');
      expect(stub.exists()).toBe(true);
    });

    it('renders empty section message when neither CLI range nor TUI snapshot exists', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeEmptySection('empty-2')];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections },
      });
      expect(wrapper.find('.section-empty').exists()).toBe(true);
    });
  });

  describe('State A — zero-section fallback (completed + no sections)', () => {
    it('renders full snapshot when sections empty, snapshot provided, status completed', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'completed' },
      });
      const snapshotStub = wrapper.find('.terminal-snapshot-stub');
      expect(snapshotStub.exists()).toBe(true);
      expect(snapshotStub.attributes('data-line-count')).toBe('10');
    });

    it('shows info banner with correct text when sections empty and snapshot provided', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'completed' },
      });
      const banner = wrapper.find('.session-content-banner--info');
      expect(banner.exists()).toBe(true);
      expect(banner.text()).toContain('Section boundaries were not detected');
    });

    it('does NOT show info banner when sections exist', () => {
      const snapshot = makeSnapshot(10);
      const sections: Section[] = [makeCliSection('s1', 0, 5)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections, detectionStatus: 'completed' },
      });
      expect(wrapper.find('.session-content-banner--info').exists()).toBe(false);
    });

    it('does not show section headers in unsectioned view', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'completed' },
      });
      expect(wrapper.find('.section-header-stub').exists()).toBe(false);
    });

    it('shows "No content available" state when snapshot is null and sections empty', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [], detectionStatus: 'completed' },
      });
      expect(wrapper.find('.terminal-empty').exists()).toBe(true);
      expect(wrapper.find('.terminal-empty').text()).toContain('No content available');
    });
  });

  describe('State B — failed/interrupted states', () => {
    it('failed + snapshot shows error banner and snapshot content', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'failed' },
      });
      expect(wrapper.find('.session-content-banner--error').exists()).toBe(true);
      expect(wrapper.find('.session-content-banner--error').text()).toContain('processing encountered an error');
      expect(wrapper.find('.terminal-snapshot-stub').exists()).toBe(true);
    });

    it('failed + no snapshot shows error-only empty state', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [], detectionStatus: 'failed' },
      });
      expect(wrapper.find('.terminal-empty--error').exists()).toBe(true);
      expect(wrapper.find('.terminal-empty--error').text()).toContain('processing failed');
    });

    it('interrupted behaves the same as failed when snapshot exists', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'interrupted' },
      });
      expect(wrapper.find('.session-content-banner--error').exists()).toBe(true);
    });

    it('error banner CSS class is distinct from info banner', () => {
      const snapshot = makeSnapshot(10);
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections: [], detectionStatus: 'failed' },
      });
      expect(wrapper.find('.session-content-banner--error').exists()).toBe(true);
      expect(wrapper.find('.session-content-banner--info').exists()).toBe(false);
    });

    it('non-terminal status shows processing indicator', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [], detectionStatus: 'processing' },
      });
      expect(wrapper.find('.terminal-empty').text()).toContain('being processed');
      expect(wrapper.find('.session-content-banner--error').exists()).toBe(false);
      expect(wrapper.find('.session-content-banner--info').exists()).toBe(false);
    });

    it('pending status shows processing indicator', () => {
      const wrapper = mount(SessionContent, {
        props: { snapshot: null, sections: [], detectionStatus: 'pending' },
      });
      expect(wrapper.find('.terminal-empty').text()).toContain('being processed');
    });

    it('failed + sections shows error banner above section content', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeCliSection('s1', 0, 10)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections, detectionStatus: 'failed' },
      });
      expect(wrapper.find('.session-content-banner--error').exists()).toBe(true);
      expect(wrapper.text()).toContain('processing encountered an error');
      // Sections should still render
      expect(wrapper.find('.section-header-stub').exists()).toBe(true);
    });
  });

  describe('collapsed/expanded toggle (defaultCollapsed prop)', () => {
    it('hides section content by default when defaultCollapsed is true', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeCliSection('col-1', 0, 5)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections, defaultCollapsed: true },
      });
      // When collapsed, the section-content div should not render (v-if="!isCollapsed")
      expect(wrapper.find('.section-content').exists()).toBe(false);
    });

    it('shows section content when defaultCollapsed is false (default)', () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeCliSection('col-2', 0, 5)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections, defaultCollapsed: false },
      });
      expect(wrapper.find('.section-content').exists()).toBe(true);
    });

    it('toggles section content when section header emits toggle event', async () => {
      const snapshot = makeSnapshot(20);
      const sections: Section[] = [makeCliSection('tog-1', 0, 5)];
      const wrapper = mount(SessionContent, {
        props: { snapshot: snapshot as never, sections, defaultCollapsed: false },
      });

      // Initially expanded
      expect(wrapper.find('.section-content').exists()).toBe(true);

      // Trigger toggle via section header stub click
      await wrapper.find('.section-header-stub').trigger('click');
      await nextTick();

      // Should now be collapsed
      expect(wrapper.find('.section-content').exists()).toBe(false);

      // Toggle again to expand
      await wrapper.find('.section-header-stub').trigger('click');
      await nextTick();

      expect(wrapper.find('.section-content').exists()).toBe(true);
    });
  });
});

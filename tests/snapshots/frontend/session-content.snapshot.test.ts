/**
 * Snapshot tests for SessionContent component.
 * Locks down the terminal chrome, section layout, preamble, and content rendering.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionContent from '@client/components/SessionContent.vue';
import type { Section } from '@client/composables/useSession';
import type { TerminalSnapshot } from '../../../packages/vt-wasm/types';

function makeSnapshot(lineTexts: string[]): TerminalSnapshot {
  return {
    cols: 80,
    rows: 24,
    lines: lineTexts.map(text => ({ spans: [{ text }] })),
  };
}

function makeSection(overrides: Partial<Section>): Section {
  return {
    id: 'section-1',
    type: 'marker',
    label: 'Section',
    startEvent: 0,
    endEvent: 100,
    startLine: 0,
    endLine: 10,
    snapshot: null,
    ...overrides,
  };
}

describe('SessionContent component snapshots', () => {
  it('CLI sections with line ranges', () => {
    const snapshot = makeSnapshot([
      'Line 0', 'Line 1', 'Line 2', 'Line 3', 'Line 4',
      'Line 5', 'Line 6', 'Line 7', 'Line 8', 'Line 9',
    ]);
    const sections: Section[] = [
      makeSection({ id: 'section-1', label: 'First', startLine: 0, endLine: 5 }),
      makeSection({ id: 'section-2', label: 'Second', startLine: 5, endLine: 10 }),
    ];

    const wrapper = mount(SessionContent, {
      props: { snapshot, sections },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('preamble lines before first section', () => {
    const snapshot = makeSnapshot([
      'Preamble A', 'Preamble B',
      'Section content 1', 'Section content 2',
    ]);
    const sections: Section[] = [
      makeSection({ id: 'section-1', label: 'Main', startLine: 2, endLine: 4 }),
    ];

    const wrapper = mount(SessionContent, {
      props: { snapshot, sections },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('TUI section with viewport snapshot', () => {
    const sessionSnapshot = makeSnapshot(['unused']);
    const tuiSnapshot: TerminalSnapshot = {
      cols: 80,
      rows: 24,
      lines: [
        { spans: [{ text: 'TUI viewport line 1' }] },
        { spans: [{ text: 'TUI viewport line 2' }] },
      ],
    };
    const sections: Section[] = [
      makeSection({
        id: 'section-1',
        label: 'TUI View',
        startLine: null,
        endLine: null,
        snapshot: tuiSnapshot,
      }),
    ];

    const wrapper = mount(SessionContent, {
      props: { snapshot: sessionSnapshot, sections },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('empty state (no snapshot, no sections)', () => {
    const wrapper = mount(SessionContent, {
      props: { snapshot: null, sections: [] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('mixed CLI and TUI sections', () => {
    const snapshot = makeSnapshot([
      'CLI line 0', 'CLI line 1', 'CLI line 2',
    ]);
    const tuiSnap: TerminalSnapshot = {
      cols: 80,
      rows: 24,
      lines: [{ spans: [{ text: 'TUI content' }] }],
    };
    const sections: Section[] = [
      makeSection({ id: 'section-1', label: 'CLI Part', startLine: 0, endLine: 3 }),
      makeSection({ id: 'section-2', label: 'TUI Part', startLine: null, endLine: null, snapshot: tuiSnap }),
    ];

    const wrapper = mount(SessionContent, {
      props: { snapshot, sections },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('defaultCollapsed prop — sections start collapsed', () => {
    const snapshot = makeSnapshot(['Line 0', 'Line 1']);
    const sections: Section[] = [
      makeSection({ id: 'section-1', label: 'Collapsed', startLine: 0, endLine: 2 }),
    ];

    const wrapper = mount(SessionContent, {
      props: { snapshot, sections, defaultCollapsed: true },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});

/**
 * Snapshot tests for SectionHeader component.
 * Locks down header HTML for expanded/collapsed, marker/detected, and metadata display.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SectionHeader from '@client/components/SectionHeader.vue';
import type { Section } from '@client/composables/useSession';

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'section-1',
    type: 'marker',
    label: 'Test Section',
    startEvent: 0,
    endEvent: 100,
    startLine: 0,
    endLine: 50,
    snapshot: null,
    ...overrides,
  };
}

describe('SectionHeader component snapshots', () => {
  it('expanded marker section with CLI line range', () => {
    const wrapper = mount(SectionHeader, {
      props: {
        section: makeSection({ type: 'marker', label: 'Build Step', startLine: 10, endLine: 60 }),
        collapsed: false,
        lineCount: 50,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('collapsed marker section', () => {
    const wrapper = mount(SectionHeader, {
      props: {
        section: makeSection({ type: 'marker', label: 'Deploy', startLine: 100, endLine: 200 }),
        collapsed: true,
        lineCount: 100,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('detected section with auto-label', () => {
    const wrapper = mount(SectionHeader, {
      props: {
        section: makeSection({
          id: 'section-2',
          type: 'detected',
          label: 'Section 1',
          startLine: 0,
          endLine: 150,
        }),
        collapsed: false,
        lineCount: 150,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('TUI viewport section (no line range)', () => {
    const wrapper = mount(SectionHeader, {
      props: {
        section: makeSection({
          startLine: null,
          endLine: null,
          snapshot: { cols: 80, rows: 24, lines: Array.from({ length: 24 }, () => ({ spans: [{ text: 'x' }] })) },
        }),
        collapsed: false,
        lineCount: 24,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('large line count display', () => {
    const wrapper = mount(SectionHeader, {
      props: {
        section: makeSection({ startLine: 0, endLine: 5000 }),
        collapsed: false,
        lineCount: 5000,
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});

/**
 * Snapshot tests for SessionContent component.
 *
 * Tests use the new SectionMetadata API where content is fetched per-section
 * via fetchSectionContent. Sections render via SectionItem which loads
 * content async — these tests verify the structural shell (no-sections states,
 * terminal chrome, flat rendering).
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionContent from '@client/components/SessionContent.vue';
import type { SectionMetadata, SectionContentPage } from '../../../src/shared/types/api.js';

function makeSectionMetadata(overrides: Partial<SectionMetadata> = {}): SectionMetadata {
  return {
    id: 'section-1',
    type: 'marker',
    label: 'Section',
    startEvent: 0,
    endEvent: 100,
    startLine: 0,
    endLine: 10,
    lineCount: 10,
    preview: null,
    ...overrides,
  };
}

function makeContentPage(sectionId: string, lineTexts: string[]): SectionContentPage {
  return {
    sectionId,
    lines: lineTexts.map((text) => ({ spans: [{ text }] })),
    totalLines: lineTexts.length,
    offset: 0,
    limit: 'all',
    hasMore: false,
    contentHash: 'abc123',
  };
}

describe('SessionContent component snapshots', () => {
  it('empty state — completed + 0 sections', () => {
    const fetchSectionContent = vi.fn().mockResolvedValue(makeContentPage('s', []));
    const wrapper = mount(SessionContent, {
      props: {
        sections: [],
        fetchSectionContent,
        detectionStatus: 'completed',
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('empty state — processing in progress', () => {
    const fetchSectionContent = vi.fn().mockResolvedValue(makeContentPage('s', []));
    const wrapper = mount(SessionContent, {
      props: {
        sections: [],
        fetchSectionContent,
        detectionStatus: 'processing',
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('error state — failed + 0 sections', () => {
    const fetchSectionContent = vi.fn().mockResolvedValue(makeContentPage('s', []));
    const wrapper = mount(SessionContent, {
      props: {
        sections: [],
        fetchSectionContent,
        detectionStatus: 'failed',
      },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('flat mode — two sections render terminal-chrome + overlay scrollbar', () => {
    const sections: SectionMetadata[] = [
      makeSectionMetadata({ id: 'section-1', label: 'First', lineCount: 5 }),
      makeSectionMetadata({ id: 'section-2', label: 'Second', lineCount: 5 }),
    ];
    const fetchSectionContent = vi.fn((id: string) =>
      Promise.resolve(makeContentPage(id, ['Line 0', 'Line 1']))
    );
    const wrapper = mount(SessionContent, {
      props: { sections, fetchSectionContent },
    });
    // Verify terminal chrome and scrollbar structure exist
    expect(wrapper.find('.terminal-chrome').exists()).toBe(true);
    expect(wrapper.find('.terminal-scroll').exists()).toBe(true);
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('virtual mode — renders virtual container with total height', () => {
    const sections: SectionMetadata[] = [
      makeSectionMetadata({ id: 'section-1', label: 'First', lineCount: 5 }),
    ];
    const fetchSectionContent = vi.fn((id: string) =>
      Promise.resolve(makeContentPage(id, ['Line 0']))
    );
    const wrapper = mount(SessionContent, {
      props: {
        sections,
        fetchSectionContent,
        virtualItems: [{ index: 0, key: 'section-1', start: 0, end: 200, size: 200, lane: 0 }],
        totalHeight: 200,
      },
    });
    const container = wrapper.find('.section-virtual-container');
    expect(container.exists()).toBe(true);
    expect(container.attributes('style')).toContain('height: 200px');
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('failed status with sections — shows error banner', () => {
    const sections: SectionMetadata[] = [
      makeSectionMetadata({ id: 'section-1', label: 'Partial', lineCount: 3 }),
    ];
    const fetchSectionContent = vi.fn((id: string) =>
      Promise.resolve(makeContentPage(id, ['Line 0']))
    );
    const wrapper = mount(SessionContent, {
      props: {
        sections,
        fetchSectionContent,
        detectionStatus: 'failed',
      },
    });
    expect(wrapper.find('.session-content-banner--error').exists()).toBe(true);
    expect(wrapper.html()).toMatchSnapshot();
  });
});

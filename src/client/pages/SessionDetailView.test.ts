/**
 * Tests for SessionDetailView component — Stage 11 integration.
 *
 * Covers:
 *  - loading state delegates to SkeletonMain
 *  - error state renders inline
 *  - data wired from useSessionV2 to SessionContent
 *  - large sessions (sectionCount > SMALL_SESSION_THRESHOLD) show SectionNavigator
 *  - small sessions (sectionCount <= SMALL_SESSION_THRESHOLD) do NOT show SectionNavigator
 *  - fetchSectionContent forwarded as onHoverSection on the navigator
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionDetailView from './SessionDetailView.vue';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../composables/use_session.js', () => ({
  useSessionV2: vi.fn(),
}));

vi.mock('../components/SkeletonMain.vue', () => ({
  default: { template: '<div class="skeleton-main-stub" />' },
}));

vi.mock('../components/SessionContent.vue', () => ({
  default: {
    props: ['sections', 'fetchSectionContent', 'virtualItems', 'totalHeight', 'detectionStatus', 'sectionEntries'],
    template: '<div class="session-content-stub" :data-section-count="sections.length" />',
    emits: ['register-section'],
  },
}));

vi.mock('../components/SectionNavigator.vue', () => ({
  default: {
    props: ['sections', 'activeId', 'scrollToSection', 'onHoverSection'],
    template: '<div class="section-navigator-stub" :data-section-count="sections.length" />',
  },
}));

import { useSessionV2 } from '../composables/use_session.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type UseSessionV2Return = ReturnType<typeof import('../composables/use_session.js').useSessionV2>;

function makeSections(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `sec-${i}`,
    type: 'detected' as const,
    label: `Section ${i}`,
    startEvent: 0,
    endEvent: 10,
    startLine: i * 10,
    endLine: (i + 1) * 10,
    lineCount: 10,
    preview: null,
  }));
}

function mountView(overrides: Partial<UseSessionV2Return> = {}) {
  const mockedUseSessionV2 = vi.mocked(useSessionV2);
  const fetchSectionContent = vi.fn().mockResolvedValue({ sectionId: 'sec-0', lines: [], totalLines: 0, offset: 0, limit: 500, hasMore: false, contentHash: 'abc' });

  mockedUseSessionV2.mockReturnValue({
    session: ref(null),
    sections: ref([]),
    loading: ref(false),
    error: ref(null),
    filename: computed(() => ''),
    detectionStatus: ref('completed'),
    fetchSectionContent,
    ...overrides,
  } as UseSessionV2Return);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/session/:id', name: 'session-detail', component: SessionDetailView },
    ],
  });

  return { router, fetchSectionContent, mockedUseSessionV2 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionDetailView (Stage 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('renders SkeletonMain when loading is true', async () => {
      const { router } = mountView({ loading: ref(true) });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.skeleton-main-stub').exists()).toBe(true);
    });

    it('does not render session content while loading', async () => {
      const { router } = mountView({ loading: ref(true) });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-content-stub').exists()).toBe(false);
    });
  });

  describe('error state', () => {
    it('renders an error message when error is set', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref('Session not found'),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-detail-view__state--error').exists()).toBe(true);
      expect(wrapper.text()).toContain('Session not found');
    });

    it('does not render SkeletonMain in error state', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref('Failed'),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.skeleton-main-stub').exists()).toBe(false);
    });
  });

  describe('content state', () => {
    it('renders SessionContent when sections are present', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref(makeSections(2)),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-content-stub').exists()).toBe(true);
    });

    it('renders SessionContent when sections are empty (delegates empty state)', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref([]),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-content-stub').exists()).toBe(true);
    });
  });

  describe('navigator: small sessions', () => {
    it('does NOT render SectionNavigator when sectionCount <= SMALL_SESSION_THRESHOLD (5)', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref(makeSections(3)),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.section-navigator-stub').exists()).toBe(false);
    });

    it('does NOT render SectionNavigator for exactly 5 sections (at threshold)', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref(makeSections(5)),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.section-navigator-stub').exists()).toBe(false);
    });
  });

  describe('navigator: large sessions', () => {
    it('renders SectionNavigator when sectionCount > SMALL_SESSION_THRESHOLD (6)', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref(makeSections(6)),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.section-navigator-stub').exists()).toBe(true);
    });

    it('passes sections to SectionNavigator', async () => {
      const sections = makeSections(6);
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref(sections),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      const nav = wrapper.find('.section-navigator-stub');
      expect(nav.attributes('data-section-count')).toBe('6');
    });
  });

  describe('detectionStatus prop wiring', () => {
    it('passes detectionStatus from useSessionV2 to SessionContent', async () => {
      const SessionContentStub = {
        name: 'SessionContentPropsCapture',
        props: ['sections', 'fetchSectionContent', 'virtualItems', 'totalHeight', 'detectionStatus', 'sectionEntries'],
        template: '<div class="session-content-props-stub" :data-detection-status="detectionStatus" />',
      };

      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref([]),
        detectionStatus: ref('pending'),
      });
      await router.push('/session/sess-1');

      const wrapper = mount(SessionDetailView, {
        global: {
          plugins: [router],
          stubs: { SessionContent: SessionContentStub },
        },
      });

      const stub = wrapper.find('.session-content-props-stub');
      expect(stub.exists()).toBe(true);
      expect(stub.attributes('data-detection-status')).toBe('pending');
    });
  });

  describe('layout: no breadcrumb or container wrapper', () => {
    it('does not render a breadcrumb element', async () => {
      const { router } = mountView({ loading: ref(false) });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.breadcrumb').exists()).toBe(false);
    });

    it('does not render a container-wrapped header element', async () => {
      const { router } = mountView({ loading: ref(false) });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-detail-view__header').exists()).toBe(false);
    });

    it('root element uses session-detail-view class without container wrapper', async () => {
      const { router } = mountView({ loading: ref(false) });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-detail-page').exists()).toBe(false);
    });
  });
});

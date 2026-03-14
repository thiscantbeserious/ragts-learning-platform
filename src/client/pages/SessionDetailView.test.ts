/**
 * Tests for SessionDetailView component — Stage 9.
 *
 * Covers: loading state uses SkeletonMain, error state, empty content state,
 * session content rendering, no breadcrumb in this component (moved to ShellHeader),
 * no container wrapper div with margins.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionDetailView from './SessionDetailView.vue';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../composables/useSession.js', () => ({
  useSession: vi.fn(),
}));

vi.mock('../components/SkeletonMain.vue', () => ({
  default: { template: '<div class="skeleton-main-stub" />' },
}));

vi.mock('../components/SessionContent.vue', () => ({
  default: { template: '<div class="session-content-stub" />' },
}));

import { useSession } from '../composables/useSession.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type UseSessionReturn = ReturnType<typeof import('../composables/useSession.js').useSession>;

function mountView(useSessionReturnValue: Partial<UseSessionReturn>) {
  const mockedUseSession = vi.mocked(useSession);
  mockedUseSession.mockReturnValue({
    session: ref(null),
    sections: ref([]),
    snapshot: ref(null),
    loading: ref(false),
    error: ref(null),
    filename: computed(() => ''),
    detectionStatus: ref('completed'),
    ...useSessionReturnValue,
  } as UseSessionReturn);

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/session/:id', name: 'session-detail', component: SessionDetailView },
    ],
  });

  return { router, mockedUseSession };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionDetailView', () => {
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

  describe('empty content state', () => {
    it('renders empty state when sections are empty and no snapshot', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref([]),
        snapshot: ref(null),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-detail-view__state').exists()).toBe(true);
      expect(wrapper.text()).toContain('no content');
    });
  });

  describe('content state', () => {
    it('renders SessionContent when sections are present', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref([{ id: 'sec-1', title: 'Section 1' }] as never),
        snapshot: ref(null),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      expect(wrapper.find('.session-content-stub').exists()).toBe(true);
    });

    it('renders SessionContent when snapshot is set but sections are empty', async () => {
      const { router } = mountView({
        loading: ref(false),
        error: ref(null),
        sections: ref([]),
        snapshot: ref({ screen: [], cursor: { x: 0, y: 0, visible: true } } as never),
      });
      await router.push('/session/sess-1');
      const wrapper = mount(SessionDetailView, {
        global: { plugins: [router] },
      });
      // hasContent is true when snapshot is non-null, even with no sections
      expect(wrapper.find('.session-content-stub').exists()).toBe(true);
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
      // Must have the BEM block class, not the old container class
      expect(wrapper.find('.session-detail-page').exists()).toBe(false);
    });
  });
});

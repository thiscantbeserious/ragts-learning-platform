/**
 * Tests for PipelineRingTrigger component.
 *
 * Covers: SVG ring renders, count binds to totalActive, label text,
 * and correct injection key usage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import { pipelineStatusKey } from '../../composables/usePipelineStatus.js';
import type { PipelineStatusState } from '../../composables/usePipelineStatus.js';
import PipelineRingTrigger from './PipelineRingTrigger.vue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePipelineStatus(overrides: Partial<PipelineStatusState> = {}): PipelineStatusState {
  const processingSessions = ref([]);
  const queuedSessions = ref([]);
  const recentlyCompleted = ref([]);
  const processingCount = computed(() => processingSessions.value.length);
  const queuedCount = computed(() => queuedSessions.value.length);
  const totalActive = computed(() => processingCount.value + queuedCount.value);
  const connected = ref(true);

  return {
    processingSessions,
    queuedSessions,
    recentlyCompleted,
    processingCount,
    queuedCount,
    totalActive,
    connected,
    cleanup: vi.fn(),
    ...overrides,
  };
}

function mountWithStatus(status: PipelineStatusState) {
  return mount(PipelineRingTrigger, {
    global: {
      provide: {
        [pipelineStatusKey as symbol]: status,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('EventSource', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineRingTrigger', () => {
  describe('structure', () => {
    it('renders a button element', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.element.tagName).toBe('BUTTON');
    });

    it('has class pipeline-ring-trigger on the root button', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.classes()).toContain('pipeline-ring-trigger');
    });

    it('renders an SVG progress ring', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.find('svg.progress-ring').exists()).toBe(true);
    });

    it('renders a background circle', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.find('circle.progress-ring__bg').exists()).toBe(true);
    });

    it('renders a fill circle', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.find('circle.progress-ring__fill').exists()).toBe(true);
    });

    it('renders the ring count text element', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.find('text.ring-count').exists()).toBe(true);
    });

    it('renders a Pipeline label span', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.find('.pipeline-label').exists()).toBe(true);
      expect(wrapper.find('.pipeline-label').text()).toBe('Pipeline');
    });
  });

  describe('count binding', () => {
    it('shows totalActive count of 0 when idle', () => {
      const status = makePipelineStatus();
      const wrapper = mountWithStatus(status);
      expect(wrapper.find('text.ring-count').text()).toBe('0');
    });

    it('shows totalActive count when sessions are active', async () => {
      const processingSessions = ref([
        { id: 's1', name: 'a.cast', status: 'processing' as const },
        { id: 's2', name: 'b.cast', status: 'processing' as const },
      ]);
      const queuedSessions = ref([
        { id: 's3', name: 'c.cast', status: 'queued' as const },
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => queuedSessions.value.length);
      const totalActive = computed(() => processingCount.value + queuedCount.value);

      const status = makePipelineStatus({
        processingSessions,
        queuedSessions,
        processingCount,
        queuedCount,
        totalActive,
      });

      const wrapper = mountWithStatus(status);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('text.ring-count').text()).toBe('3');
    });

    it('updates count when totalActive changes reactively', async () => {
      const processingSessions = ref([
        { id: 's1', name: 'a.cast', status: 'processing' as const },
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => 0);
      const totalActive = computed(() => processingCount.value + queuedCount.value);

      const status = makePipelineStatus({
        processingSessions,
        processingCount,
        queuedCount,
        totalActive,
      });

      const wrapper = mountWithStatus(status);
      expect(wrapper.find('text.ring-count').text()).toBe('1');

      processingSessions.value = [];
      await wrapper.vm.$nextTick();

      expect(wrapper.find('text.ring-count').text()).toBe('0');
    });
  });

  describe('aria-label', () => {
    it('has aria-label showing count=0 when idle', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.attributes('aria-label')).toBe('Pipeline: 0 active');
    });

    it('updates aria-label when totalActive changes', async () => {
      const processingSessions = ref([
        { id: 's1', name: 'a.cast', status: 'processing' as const },
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => 0);
      const totalActive = computed(() => processingCount.value + queuedCount.value);

      const status = makePipelineStatus({ processingSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountWithStatus(status);

      expect(wrapper.attributes('aria-label')).toBe('Pipeline: 1 active');

      processingSessions.value = [];
      await wrapper.vm.$nextTick();

      expect(wrapper.attributes('aria-label')).toBe('Pipeline: 0 active');
    });
  });

  describe('SVG ring geometry', () => {
    it('SVG has viewBox 0 0 24 24', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      expect(wrapper.find('svg.progress-ring').attributes('viewBox')).toBe('0 0 24 24');
    });

    it('background circle is at cx=12 cy=12 r=9', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      const bg = wrapper.find('circle.progress-ring__bg');
      expect(bg.attributes('cx')).toBe('12');
      expect(bg.attributes('cy')).toBe('12');
      expect(bg.attributes('r')).toBe('9');
    });

    it('fill circle is at cx=12 cy=12 r=9', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      const fill = wrapper.find('circle.progress-ring__fill');
      expect(fill.attributes('cx')).toBe('12');
      expect(fill.attributes('cy')).toBe('12');
      expect(fill.attributes('r')).toBe('9');
    });

    it('fill circle has stroke-dasharray of 56.55', () => {
      const wrapper = mountWithStatus(makePipelineStatus());
      const fill = wrapper.find('circle.progress-ring__fill');
      expect(fill.attributes('stroke-dasharray')).toBe('56.55');
    });
  });
});

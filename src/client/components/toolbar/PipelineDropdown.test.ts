/**
 * Tests for PipelineDropdown component.
 *
 * Covers: header rendering, section visibility based on session data,
 * session name rendering, spinner/queue-dot indicators, and injection usage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import { pipelineStatusKey } from '../../composables/usePipelineStatus.js';
import type { PipelineStatusState } from '../../composables/usePipelineStatus.js';
import type { PipelineSession } from '../../../shared/types/pipeline_status.js';
import PipelineDropdown from './PipelineDropdown.vue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<PipelineSession> & { id: string; name: string; status: PipelineSession['status'] }): PipelineSession {
  return { ...overrides };
}

function makePipelineStatus(overrides: Partial<PipelineStatusState> = {}): PipelineStatusState {
  const processingSessions = ref<PipelineSession[]>([]);
  const queuedSessions = ref<PipelineSession[]>([]);
  const recentlyCompleted = ref<PipelineSession[]>([]);
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

function mountDropdown(status: PipelineStatusState, open = true) {
  return mount(PipelineDropdown, {
    props: { open },
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

describe('PipelineDropdown', () => {
  describe('header', () => {
    it('renders the pipeline-dropdown container', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown').exists()).toBe(true);
    });

    it('renders the header with title "Pipeline Status"', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown__title').text()).toBe('Pipeline Status');
    });

    it('renders a summary in the header', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown__summary').exists()).toBe(true);
    });

    it('shows "0 active" summary when no sessions', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown__summary').text()).toContain('0 active');
    });
  });

  describe('processing section', () => {
    it('hides processing section when processingSessions is empty', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown__section--processing').exists()).toBe(false);
    });

    it('shows processing section when processingSessions is non-empty', () => {
      const processingSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'test.cast', status: 'processing' }),
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => 0);
      const totalActive = computed(() => processingCount.value);
      const status = makePipelineStatus({ processingSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.find('.pipeline-dropdown__section--processing').exists()).toBe(true);
    });

    it('renders session names in processing section', () => {
      const processingSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'my-session.cast', status: 'processing' }),
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => 0);
      const totalActive = computed(() => processingCount.value);
      const status = makePipelineStatus({ processingSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.text()).toContain('my-session.cast');
    });

    it('renders mini-spinner for each processing item', () => {
      const processingSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'a.cast', status: 'processing' }),
        makeSession({ id: 's2', name: 'b.cast', status: 'processing' }),
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => 0);
      const totalActive = computed(() => processingCount.value);
      const status = makePipelineStatus({ processingSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.findAll('.mini-spinner')).toHaveLength(2);
    });

    it('renders progress percentage when present', () => {
      const processingSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'a.cast', status: 'processing', progress: 42 }),
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => 0);
      const totalActive = computed(() => processingCount.value);
      const status = makePipelineStatus({ processingSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.text()).toContain('42%');
    });
  });

  describe('queued section', () => {
    it('hides queued section when queuedSessions is empty', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown__section--queued').exists()).toBe(false);
    });

    it('shows queued section when queuedSessions is non-empty', () => {
      const queuedSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'queued.cast', status: 'queued', queuePosition: 1 }),
      ]);
      const processingCount = computed(() => 0);
      const queuedCount = computed(() => queuedSessions.value.length);
      const totalActive = computed(() => queuedCount.value);
      const status = makePipelineStatus({ queuedSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.find('.pipeline-dropdown__section--queued').exists()).toBe(true);
    });

    it('renders session names in queued section', () => {
      const queuedSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'waiting.cast', status: 'queued', queuePosition: 1 }),
      ]);
      const processingCount = computed(() => 0);
      const queuedCount = computed(() => queuedSessions.value.length);
      const totalActive = computed(() => queuedCount.value);
      const status = makePipelineStatus({ queuedSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.text()).toContain('waiting.cast');
    });

    it('renders queue-dot for each queued item', () => {
      const queuedSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'a.cast', status: 'queued', queuePosition: 1 }),
        makeSession({ id: 's2', name: 'b.cast', status: 'queued', queuePosition: 2 }),
      ]);
      const processingCount = computed(() => 0);
      const queuedCount = computed(() => queuedSessions.value.length);
      const totalActive = computed(() => queuedCount.value);
      const status = makePipelineStatus({ queuedSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.findAll('.queue-dot')).toHaveLength(2);
    });

    it('renders queue position when present', () => {
      const queuedSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'a.cast', status: 'queued', queuePosition: 3 }),
      ]);
      const processingCount = computed(() => 0);
      const queuedCount = computed(() => queuedSessions.value.length);
      const totalActive = computed(() => queuedCount.value);
      const status = makePipelineStatus({ queuedSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      expect(wrapper.text()).toContain('#3');
    });
  });

  describe('recently completed section', () => {
    it('hides recently completed section when empty', () => {
      const wrapper = mountDropdown(makePipelineStatus());
      expect(wrapper.find('.pipeline-dropdown__section--completed').exists()).toBe(false);
    });

    it('shows recently completed section when non-empty', () => {
      const recentlyCompleted = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'done.cast', status: 'ready', completedAt: new Date().toISOString() }),
      ]);
      const status = makePipelineStatus({ recentlyCompleted });
      const wrapper = mountDropdown(status);

      expect(wrapper.find('.pipeline-dropdown__section--completed').exists()).toBe(true);
    });

    it('renders session names in recently completed section', () => {
      const recentlyCompleted = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'finished.cast', status: 'ready', completedAt: new Date().toISOString() }),
      ]);
      const status = makePipelineStatus({ recentlyCompleted });
      const wrapper = mountDropdown(status);

      expect(wrapper.text()).toContain('finished.cast');
    });

    it('renders a relative time string for completed sessions', () => {
      const completedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago
      const recentlyCompleted = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'finished.cast', status: 'ready', completedAt }),
      ]);
      const status = makePipelineStatus({ recentlyCompleted });
      const wrapper = mountDropdown(status);

      // Relative time should be something like "2m ago"
      expect(wrapper.text()).toMatch(/\d+[smh] ago/);
    });
  });

  describe('visibility', () => {
    it('is not rendered when open is false', () => {
      const wrapper = mountDropdown(makePipelineStatus(), false);
      expect(wrapper.find('.pipeline-dropdown').exists()).toBe(false);
    });

    it('is rendered when open is true', () => {
      const wrapper = mountDropdown(makePipelineStatus(), true);
      expect(wrapper.find('.pipeline-dropdown').exists()).toBe(true);
    });
  });

  describe('summary text', () => {
    it('shows correct summary with processing and queued sessions', () => {
      const processingSessions = ref<PipelineSession[]>([
        makeSession({ id: 's1', name: 'a.cast', status: 'processing' }),
      ]);
      const queuedSessions = ref<PipelineSession[]>([
        makeSession({ id: 's2', name: 'b.cast', status: 'queued', queuePosition: 1 }),
        makeSession({ id: 's3', name: 'c.cast', status: 'queued', queuePosition: 2 }),
      ]);
      const processingCount = computed(() => processingSessions.value.length);
      const queuedCount = computed(() => queuedSessions.value.length);
      const totalActive = computed(() => processingCount.value + queuedCount.value);
      const status = makePipelineStatus({ processingSessions, queuedSessions, processingCount, queuedCount, totalActive });
      const wrapper = mountDropdown(status);

      const summaryText = wrapper.find('.pipeline-dropdown__summary').text();
      expect(summaryText).toContain('1 active');
      expect(summaryText).toContain('2 queued');
    });
  });
});

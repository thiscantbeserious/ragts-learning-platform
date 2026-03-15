/**
 * Tests for SessionCard component — Stage 7.
 *
 * Covers: rendering (filename, metadata, status dot), selected state,
 * status indicator states (processing/ready/failed), aria-labels,
 * and click handler navigation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Session } from '../../shared/types/session.js';
import SessionCard from './SessionCard.vue';
import { resetConnectionBudget } from '../composables/useSSE.js';

// Mock vue-router
const mockPush = vi.fn().mockResolvedValue(undefined);
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: { id: '' } }),
}));

/**
 * Stub EventSource so useSSE composable does not throw in happy-dom
 * test environment where EventSource is unavailable.
 */
class StubEventSource {
   
  constructor(_url: string) {}
  onopen: null = null;
  onerror: null = null;
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test-session.cast',
    filepath: '/data/sessions/test-session.cast',
    size_bytes: 2048,
    marker_count: 0,
    uploaded_at: '2026-03-11T10:00:00Z',
    created_at: '2026-03-11T10:00:00Z',
    detection_status: 'completed',
    detected_sections_count: 5,
    ...overrides,
  };
}

function mountCard(session: Session, isSelected = false) {
  return mount(SessionCard, {
    props: { session, isSelected },
  });
}

describe('SessionCard', () => {
  beforeEach(() => {
    mockPush.mockClear();
    vi.stubGlobal('EventSource', StubEventSource);
    resetConnectionBudget();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetConnectionBudget();
  });

  describe('rendering', () => {
    it('renders without errors', () => {
      const wrapper = mountCard(makeSession());
      expect(wrapper.exists()).toBe(true);
    });

    it('displays the session filename', () => {
      const wrapper = mountCard(makeSession({ filename: 'my-recording.cast' }));
      expect(wrapper.text()).toContain('my-recording.cast');
    });

    it('displays section count when detected_sections_count is set', () => {
      const wrapper = mountCard(makeSession({ detected_sections_count: 7 }));
      expect(wrapper.text()).toContain('7 sections');
    });

    it('displays "0 sections" when detected_sections_count is 0', () => {
      const wrapper = mountCard(makeSession({ detected_sections_count: 0 }));
      expect(wrapper.text()).toContain('0 sections');
    });

    it('displays "— sections" when detected_sections_count is null', () => {
      const wrapper = mountCard(makeSession({ detected_sections_count: null }));
      expect(wrapper.text()).toContain('— sections');
    });

    it('has a status indicator dot element', () => {
      const wrapper = mountCard(makeSession());
      expect(wrapper.find('.session-card__status-dot').exists()).toBe(true);
    });

    it('has a metadata row', () => {
      const wrapper = mountCard(makeSession());
      expect(wrapper.find('.session-card__meta').exists()).toBe(true);
    });
  });

  describe('selected state', () => {
    it('applies selected class when isSelected is true', () => {
      const wrapper = mountCard(makeSession(), true);
      expect(wrapper.find('.session-card--selected').exists()).toBe(true);
    });

    it('does not apply selected class when isSelected is false', () => {
      const wrapper = mountCard(makeSession(), false);
      expect(wrapper.find('.session-card--selected').exists()).toBe(false);
    });
  });

  describe('status indicator — ready (completed)', () => {
    it('applies ready status class for completed status', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
      expect(wrapper.find('.session-card__status-dot--ready').exists()).toBe(true);
    });

    it('has aria-label "Ready" for completed status', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
      const dot = wrapper.find('.session-card__status-dot');
      expect(dot.attributes('aria-label')).toBe('Ready');
    });

    it('does not apply pulse animation class for ready status', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
      expect(wrapper.find('.session-card__status-dot--pulse').exists()).toBe(false);
    });
  });

  describe('status indicator — processing', () => {
    const processingStatuses: Session['detection_status'][] = [
      'pending', 'processing', 'queued', 'validating',
      'detecting', 'replaying', 'deduplicating', 'storing',
    ];

    for (const status of processingStatuses) {
      it(`applies processing class for status "${status}"`, () => {
        const wrapper = mountCard(makeSession({ detection_status: status }));
        expect(wrapper.find('.session-card__status-dot--processing').exists()).toBe(true);
      });

      it(`has aria-label "Processing" for status "${status}"`, () => {
        const wrapper = mountCard(makeSession({ detection_status: status }));
        const dot = wrapper.find('.session-card__status-dot');
        expect(dot.attributes('aria-label')).toBe('Processing');
      });

      it(`applies pulse class for status "${status}"`, () => {
        const wrapper = mountCard(makeSession({ detection_status: status }));
        expect(wrapper.find('.session-card__status-dot--pulse').exists()).toBe(true);
      });
    }
  });

  describe('status indicator — failed', () => {
    const failedStatuses: Session['detection_status'][] = ['failed', 'interrupted'];

    for (const status of failedStatuses) {
      it(`applies failed class for status "${status}"`, () => {
        const wrapper = mountCard(makeSession({ detection_status: status }));
        expect(wrapper.find('.session-card__status-dot--failed').exists()).toBe(true);
      });

      it(`has aria-label "Failed" for status "${status}"`, () => {
        const wrapper = mountCard(makeSession({ detection_status: status }));
        const dot = wrapper.find('.session-card__status-dot');
        expect(dot.attributes('aria-label')).toBe('Failed');
      });

      it(`does not apply pulse class for status "${status}"`, () => {
        const wrapper = mountCard(makeSession({ detection_status: status }));
        expect(wrapper.find('.session-card__status-dot--pulse').exists()).toBe(false);
      });
    }
  });

  describe('status indicator — undefined', () => {
    it('defaults to ready class when detection_status is undefined', () => {
      const wrapper = mountCard(makeSession({ detection_status: undefined }));
      expect(wrapper.find('.session-card__status-dot--ready').exists()).toBe(true);
    });
  });

  describe('click handler', () => {
    it('calls router.push with correct session route on click', async () => {
      const session = makeSession({ id: 'abc-123' });
      const wrapper = mountCard(session);
      await wrapper.find('.session-card').trigger('click');
      expect(mockPush).toHaveBeenCalledWith('/session/abc-123');
    });

    it('is accessible as a button (role="button" or button element)', () => {
      const wrapper = mountCard(makeSession());
      const card = wrapper.find('.session-card');
      const tagName = card.element.tagName.toLowerCase();
      const role = card.attributes('role');
      expect(tagName === 'button' || role === 'button').toBe(true);
    });
  });

  describe('zero-section completed session', () => {
    it('renders without error or warning indicators', async () => {
      const session = makeSession({
        detection_status: 'completed',
        detected_sections_count: 0,
      });
      const wrapper = mountCard(session);

      // Should show ready (green) dot, not failed
      expect(wrapper.find('.session-card__status-dot--ready').exists()).toBe(true);
      expect(wrapper.find('.session-card__status-dot--failed').exists()).toBe(false);

      // Should show "0 sections" text, not an error message
      expect(wrapper.text()).toContain('0 sections');

      // Should not be in processing state
      expect(wrapper.find('.session-card--processing').exists()).toBe(false);

      // Should be clickable — triggers navigation on click
      await wrapper.find('.session-card').trigger('click');
      expect(mockPush).toHaveBeenCalledWith('/session/sess-1');
    });
  });

  describe('processing card', () => {
    it('applies processing modifier class when statusGroup is processing', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
      expect(wrapper.find('.session-card--processing').exists()).toBe(true);
    });

    it('does not apply processing modifier class for completed status', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
      expect(wrapper.find('.session-card--processing').exists()).toBe(false);
    });

    it('shows "Processing" text instead of section count when processing', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'processing', detected_sections_count: 5 }));
      expect(wrapper.find('.session-card__processing-text').exists()).toBe(true);
      expect(wrapper.find('.session-card__processing-text').text()).toContain('Processing');
    });

    it('does not show meta row when processing', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
      expect(wrapper.find('.session-card__meta').exists()).toBe(false);
    });

    it('does not navigate on click when processing', async () => {
      const session = makeSession({ id: 'proc-1', detection_status: 'processing' });
      const wrapper = mountCard(session);
      await wrapper.find('.session-card').trigger('click');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('remains focusable (tabindex="0") when processing so screen readers can discover status', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
      const card = wrapper.find('.session-card');
      expect(card.attributes('tabindex')).toBe('0');
    });

    it('has tabindex="0" for non-processing cards', () => {
      const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
      const card = wrapper.find('.session-card');
      expect(card.attributes('tabindex')).toBe('0');
    });
  });
});

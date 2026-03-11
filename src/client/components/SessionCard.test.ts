/**
 * Tests for SessionCard component — Stage 7.
 *
 * Covers: rendering (filename, metadata, status dot), selected state,
 * status indicator states (processing/ready/failed), aria-labels,
 * and click handler navigation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Session } from '../../shared/types/session.js';
import SessionCard from './SessionCard.vue';

// Mock vue-router
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: { id: '' } }),
}));

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
    mockPush.mockReset();
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
});

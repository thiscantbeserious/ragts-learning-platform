/**
 * Unit tests for GalleryCard component.
 * Exercises ready, processing, and failed states, connection dot behavior,
 * and routing link structure.
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import GalleryCard from './GalleryCard.vue';
import type { Session } from '../../shared/types/session.js';
import type { SseConnectionState } from '../composables/useSessionSSE';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'landing', component: { template: '<div />' } },
    { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
  ],
});

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-id',
    filename: 'test-session.cast',
    filepath: '/data/sessions/test-session.cast',
    size_bytes: 342_000,
    marker_count: 7,
    uploaded_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    created_at: new Date().toISOString(),
    detected_sections_count: 23,
    detection_status: 'completed',
    ...overrides,
  };
}

function mountCard(session: Session, connectionState?: SseConnectionState) {
  return mount(GalleryCard, {
    props: { session, connectionState },
    global: { plugins: [router] },
  });
}

describe('GalleryCard — ready state', () => {
  it('renders a router-link to session-detail', () => {
    const wrapper = mountCard(makeSession());
    const link = wrapper.findComponent({ name: 'RouterLink' });
    expect(link.exists()).toBe(true);
    expect(link.props('to')).toEqual({ name: 'session-detail', params: { id: 'test-id' } });
  });

  it('applies .landing__gallery-card class', () => {
    const wrapper = mountCard(makeSession());
    expect(wrapper.find('.landing__gallery-card').exists()).toBe(true);
  });

  it('does NOT apply processing or failed modifier for ready session', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
    expect(wrapper.find('.landing__gallery-card--processing').exists()).toBe(false);
    expect(wrapper.find('.landing__gallery-card--failed').exists()).toBe(false);
  });

  it('renders filename in .landing__card-filename', () => {
    const wrapper = mountCard(makeSession({ filename: 'my-session.cast' }));
    expect(wrapper.find('.landing__card-filename').text()).toContain('my-session.cast');
  });

  it('renders marker count in .landing__card-meta-item', () => {
    const wrapper = mountCard(makeSession({ marker_count: 7 }));
    const metaItems = wrapper.findAll('.landing__card-meta-item');
    const text = metaItems.map((el) => el.text()).join(' ');
    expect(text).toContain('7');
  });

  it('renders section count in .landing__card-meta-item', () => {
    const wrapper = mountCard(makeSession({ detected_sections_count: 23 }));
    const metaItems = wrapper.findAll('.landing__card-meta-item');
    const text = metaItems.map((el) => el.text()).join(' ');
    expect(text).toContain('23');
  });

  it('renders file size in .landing__card-size', () => {
    const wrapper = mountCard(makeSession({ size_bytes: 342_000 }));
    expect(wrapper.find('.landing__card-size').text()).toContain('KB');
  });

  it('renders relative time in .landing__card-date', () => {
    const wrapper = mountCard(makeSession());
    expect(wrapper.find('.landing__card-date').exists()).toBe(true);
    expect(wrapper.find('.landing__card-date').text().length).toBeGreaterThan(0);
  });

  it('does NOT show status badge for ready session', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
    expect(wrapper.find('.landing__card-status').exists()).toBe(false);
  });

  it('does NOT show connection dot when ready (no connectionState)', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'completed' }));
    expect(wrapper.find('.gallery-card__connection-dot').exists()).toBe(false);
  });

  it('renders preview titlebar with dots', () => {
    const wrapper = mountCard(makeSession());
    expect(wrapper.find('.landing__preview-titlebar').exists()).toBe(true);
    expect(wrapper.findAll('.landing__preview-dot').length).toBeGreaterThanOrEqual(3);
  });
});

describe('GalleryCard — processing state', () => {
  it('applies .landing__gallery-card--processing modifier', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
    expect(wrapper.find('.landing__gallery-card--processing').exists()).toBe(true);
  });

  it('shows .badge--warning with spinner and "Processing" text', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
    expect(wrapper.find('.landing__card-status').exists()).toBe(true);
    expect(wrapper.find('.badge--warning').exists()).toBe(true);
    expect(wrapper.find('.badge--warning').text()).toContain('Processing');
  });

  it('shows .landing__preview-processing area with spinner', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
    expect(wrapper.find('.landing__preview-processing').exists()).toBe(true);
    expect(wrapper.find('.spinner').exists()).toBe(true);
  });

  it('shows "Analyzing session..." label in preview area', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
    expect(wrapper.find('.landing__preview-processing-label').text()).toContain('Analyzing');
  });

  it('shows pipeline stage label from formatPipelineStage in meta area', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'detecting' }));
    expect(wrapper.find('.landing__card-processing-meta').text()).toContain('Detecting sections');
  });

  it('shows dot-spinner in processing meta area', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
    expect(wrapper.find('.dot-spinner').exists()).toBe(true);
  });

  it('does NOT show connection dot when connectionState is connected', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }), 'connected');
    expect(wrapper.find('.gallery-card__connection-dot').exists()).toBe(false);
  });

  it('does NOT show connection dot when connectionState is undefined', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }));
    expect(wrapper.find('.gallery-card__connection-dot').exists()).toBe(false);
  });

  it('shows amber connection dot when connectionState is connecting', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }), 'connecting');
    const dot = wrapper.find('.gallery-card__connection-dot');
    expect(dot.exists()).toBe(true);
    expect(dot.classes()).toContain('gallery-card__connection-dot--connecting');
  });

  it('shows red connection dot when connectionState is disconnected', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'processing' }), 'disconnected');
    const dot = wrapper.find('.gallery-card__connection-dot');
    expect(dot.exists()).toBe(true);
    expect(dot.classes()).toContain('gallery-card__connection-dot--disconnected');
  });
});

describe('GalleryCard — failed state', () => {
  it('applies .landing__gallery-card--failed modifier', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'failed' }));
    expect(wrapper.find('.landing__gallery-card--failed').exists()).toBe(true);
  });

  it('applies .landing__gallery-card--failed modifier for interrupted status', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'interrupted' }));
    expect(wrapper.find('.landing__gallery-card--failed').exists()).toBe(true);
  });

  it('shows .badge--error with error icon and "Failed" text', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'failed' }));
    expect(wrapper.find('.badge--error').exists()).toBe(true);
    expect(wrapper.find('.badge--error').text()).toContain('Failed');
  });

  it('shows .landing__preview-failed area with error icon', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'failed' }));
    expect(wrapper.find('.landing__preview-failed').exists()).toBe(true);
    expect(wrapper.find('.landing__preview-failed-label').text()).toContain('Parse failed');
  });

  it('shows error text in meta area for failed state', () => {
    const wrapper = mountCard(makeSession({ detection_status: 'failed' }));
    expect(wrapper.find('.landing__card-error').exists()).toBe(true);
  });
});

describe('GalleryCard — no agent badges', () => {
  it('does NOT render agent-type badge for session with agent_type', () => {
    const wrapper = mountCard(makeSession({ agent_type: 'claude' }));
    // No hardcoded agent-type badge class expected
    expect(wrapper.find('.badge--agent').exists()).toBe(false);
  });
});

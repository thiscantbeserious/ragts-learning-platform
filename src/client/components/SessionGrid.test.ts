/**
 * Unit tests for SessionGrid component.
 * Exercises loading skeleton state, populated card rendering, empty/no-results state,
 * and clear-filters emit.
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionGrid from './SessionGrid.vue';
import type { Session } from '../../shared/types/session.js';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'landing', component: { template: '<div />' } },
    { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
  ],
});

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    filename: `session-${id}.cast`,
    filepath: `/data/sessions/${id}.cast`,
    size_bytes: 100_000,
    marker_count: 3,
    uploaded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    detection_status: 'completed',
    ...overrides,
  };
}

function mountGrid(props: {
  sessions?: Session[];
  loading?: boolean;
  connectionStates?: Map<string, 'connecting' | 'connected' | 'disconnected'>;
}) {
  return mount(SessionGrid, {
    props: {
      sessions: [],
      loading: false,
      ...props,
    },
    global: { plugins: [router] },
  });
}

describe('SessionGrid — structure', () => {
  it('renders .landing__session-grid container', () => {
    const wrapper = mountGrid({ sessions: [] });
    expect(wrapper.find('.landing__session-grid').exists()).toBe(true);
  });
});

describe('SessionGrid — loading state', () => {
  it('renders 3 SkeletonCard instances when loading is true', () => {
    const wrapper = mountGrid({ loading: true });
    const skeletons = wrapper.findAll('.landing__skeleton-card');
    expect(skeletons).toHaveLength(3);
  });

  it('does NOT render GalleryCard instances when loading', () => {
    const wrapper = mountGrid({ loading: true, sessions: [makeSession('1')] });
    expect(wrapper.findAll('.landing__gallery-card')).toHaveLength(0);
  });

  it('does NOT show no-results state when loading', () => {
    const wrapper = mountGrid({ loading: true, sessions: [] });
    expect(wrapper.find('.landing__no-results').exists()).toBe(false);
  });
});

describe('SessionGrid — populated state', () => {
  it('renders one GalleryCard per session', () => {
    const sessions = [makeSession('a'), makeSession('b'), makeSession('c')];
    const wrapper = mountGrid({ sessions });
    expect(wrapper.findAll('.landing__gallery-card')).toHaveLength(3);
  });

  it('does NOT render SkeletonCards when sessions are present', () => {
    const sessions = [makeSession('a')];
    const wrapper = mountGrid({ sessions });
    expect(wrapper.findAll('.landing__skeleton-card')).toHaveLength(0);
  });

  it('does NOT show no-results state when sessions are present', () => {
    const sessions = [makeSession('a')];
    const wrapper = mountGrid({ sessions });
    expect(wrapper.find('.landing__no-results').exists()).toBe(false);
  });
});

describe('SessionGrid — empty state', () => {
  it('renders .landing__no-results when sessions is empty and not loading', () => {
    const wrapper = mountGrid({ sessions: [], loading: false });
    expect(wrapper.find('.landing__no-results').exists()).toBe(true);
  });

  it('shows search icon in no-results state', () => {
    const wrapper = mountGrid({ sessions: [], loading: false });
    expect(wrapper.find('.landing__no-results .icon-search').exists()).toBe(true);
  });

  it('shows "No sessions match your search" text', () => {
    const wrapper = mountGrid({ sessions: [], loading: false });
    expect(wrapper.find('.landing__no-results').text()).toContain('No sessions match your search');
  });

  it('shows "Clear filters" button', () => {
    const wrapper = mountGrid({ sessions: [], loading: false });
    const btn = wrapper.find('.landing__no-results-action');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Clear filters');
  });

  it('emits clear-filters when "Clear filters" button is clicked', async () => {
    const wrapper = mountGrid({ sessions: [], loading: false });
    await wrapper.find('.landing__no-results-action').trigger('click');
    expect(wrapper.emitted('clear-filters')).toBeTruthy();
  });
});

describe('SessionGrid — connectionStates passthrough', () => {
  it('passes connectionState to GalleryCard for processing sessions', () => {
    const sessions = [makeSession('p1', { detection_status: 'processing' })];
    const connectionStates = new Map([['p1', 'connecting' as const]]);
    const wrapper = mountGrid({ sessions, connectionStates });
    // The processing card should have the connecting dot
    const dot = wrapper.find('.gallery-card__connection-dot--connecting');
    expect(dot.exists()).toBe(true);
  });
});

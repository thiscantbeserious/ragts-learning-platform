/**
 * Snapshot tests for SessionList component.
 * Locks down list rendering for all states: loading, empty, error, populated.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionList from '@client/components/SessionList.vue';
import type { Session } from '../../../src/shared/types';

// Mock Intl.DateTimeFormat for deterministic date output
const OriginalDateTimeFormat = Intl.DateTimeFormat;

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: { template: '<div/>' } },
      { path: '/session/:id', name: 'session-detail', component: { template: '<div/>' } },
    ],
  });
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-001',
    filename: 'test-session.cast',
    filepath: '/data/sessions/test-session.cast',
    size_bytes: 12345,
    marker_count: 3,
    uploaded_at: '2024-01-15T12:00:00Z',
    created_at: '2024-01-15T12:00:00Z',
    ...overrides,
  };
}

describe('SessionList component snapshots', () => {
  beforeEach(() => {
    // Mock DateTimeFormat for deterministic output — always use de-DE locale
    (globalThis as any).Intl = {
      ...Intl,
      DateTimeFormat: class extends OriginalDateTimeFormat {
        constructor(_locale?: any, options?: any) {
          super('de-DE', options);
        }
      },
    };
  });

  afterEach(() => {
    (globalThis as any).Intl = { ...Intl, DateTimeFormat: OriginalDateTimeFormat };
  });

  it('loading state', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(SessionList, {
      props: { sessions: [], loading: true, error: null },
      global: { plugins: [router] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('empty state (no sessions)', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(SessionList, {
      props: { sessions: [], loading: false, error: null },
      global: { plugins: [router] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('error state', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const wrapper = mount(SessionList, {
      props: { sessions: [], loading: false, error: 'Network error: connection refused' },
      global: { plugins: [router] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('populated with sessions (fixed dates)', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const sessions: Session[] = [
      makeSession({ id: 'sess-001', filename: 'claude-session.cast', size_bytes: 245678, marker_count: 5 }),
      makeSession({ id: 'sess-002', filename: 'codex-session.cast', size_bytes: 1234567, marker_count: 0 }),
      makeSession({ id: 'sess-003', filename: 'simple.cast', size_bytes: 512, marker_count: 1 }),
    ];

    const wrapper = mount(SessionList, {
      props: { sessions, loading: false, error: null },
      global: { plugins: [router] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('session with zero markers (no badge)', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();

    const sessions: Session[] = [
      makeSession({ id: 'sess-no-markers', marker_count: 0 }),
    ];

    const wrapper = mount(SessionList, {
      props: { sessions, loading: false, error: null },
      global: { plugins: [router] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});

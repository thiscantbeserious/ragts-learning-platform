/**
 * Branch coverage tests for SessionList component.
 *
 * Lines targeted:
 *   28-29 — confirmDelete: confirm() returns true → emits 'delete'
 *   72     — confirmDelete: confirm() returns false → does NOT emit 'delete'
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionList from './SessionList.vue';
import type { Session } from '../../shared/types/session.js';

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/session/:id', name: 'session-detail', component: { template: '<div />' } },
    ],
  });
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    filename: 'test.cast',
    filepath: '/data/sessions/test.cast',
    size_bytes: 1024,
    marker_count: 0,
    uploaded_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    detection_status: 'completed',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionList — confirmDelete branches', () => {
  it('emits delete event when confirm() returns true', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const router = createTestRouter();
    await router.push('/');
    const session = makeSession({ id: 'to-delete', filename: 'delete-me.cast' });

    const wrapper = mount(SessionList, {
      props: { sessions: [session], loading: false, error: null },
      global: { plugins: [router] },
    });

    const deleteBtn = wrapper.find('.session-card__delete');
    await deleteBtn.trigger('click');

    expect(wrapper.emitted('delete')).toBeTruthy();
    expect(wrapper.emitted('delete')![0]).toEqual(['to-delete']);
  });

  it('does NOT emit delete event when confirm() returns false', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    const router = createTestRouter();
    await router.push('/');
    const session = makeSession({ id: 'kept', filename: 'keep-me.cast' });

    const wrapper = mount(SessionList, {
      props: { sessions: [session], loading: false, error: null },
      global: { plugins: [router] },
    });

    const deleteBtn = wrapper.find('.session-card__delete');
    await deleteBtn.trigger('click');

    expect(wrapper.emitted('delete')).toBeFalsy();
  });
});

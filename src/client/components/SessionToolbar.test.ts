/**
 * Unit tests for SessionToolbar component.
 * Exercises search bar rendering, filter pill rendering and active states,
 * session count display, and emit behavior.
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionToolbar from './SessionToolbar.vue';

function mountToolbar(overrides: {
  searchQuery?: string;
  activeFilter?: string;
  sessionCount?: number;
  filteredCount?: number;
} = {}) {
  return mount(SessionToolbar, {
    props: {
      searchQuery: '',
      activeFilter: 'all',
      sessionCount: 8,
      filteredCount: 8,
      ...overrides,
    },
  });
}

describe('SessionToolbar — structure', () => {
  it('renders .landing__toolbar container', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.landing__toolbar').exists()).toBe(true);
  });

  it('renders .search-bar container', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.search-bar').exists()).toBe(true);
  });

  it('renders .search-bar__icon', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.search-bar__icon').exists()).toBe(true);
  });

  it('renders .search-bar__input', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.search-bar__input').exists()).toBe(true);
  });

  it('renders filter pills container', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.filter-pills').exists()).toBe(true);
  });

  it('renders 4 filter pills', () => {
    const wrapper = mountToolbar();
    expect(wrapper.findAll('.filter-pill')).toHaveLength(4);
  });

  it('renders .landing__session-count', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.landing__session-count').exists()).toBe(true);
  });
});

describe('SessionToolbar — filter pills labels', () => {
  it('renders "All" pill', () => {
    const wrapper = mountToolbar();
    const pills = wrapper.findAll('.filter-pill');
    expect(pills.some((p) => p.text().trim() === 'All')).toBe(true);
  });

  it('renders "Processing" pill with .landing__pill--processing', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.landing__pill--processing').text()).toContain('Processing');
  });

  it('renders "Ready" pill with .landing__pill--ready', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.landing__pill--ready').text()).toContain('Ready');
  });

  it('renders "Failed" pill with .landing__pill--failed', () => {
    const wrapper = mountToolbar();
    expect(wrapper.find('.landing__pill--failed').text()).toContain('Failed');
  });
});

describe('SessionToolbar — active pill state', () => {
  it('applies .filter-pill--active to "All" pill when activeFilter is "all"', () => {
    const wrapper = mountToolbar({ activeFilter: 'all' });
    const pills = wrapper.findAll('.filter-pill');
    const allPill = pills.find((p) => p.text().trim() === 'All');
    expect(allPill!.classes()).toContain('filter-pill--active');
  });

  it('applies .filter-pill--active to Processing pill when activeFilter is "processing"', () => {
    const wrapper = mountToolbar({ activeFilter: 'processing' });
    const pill = wrapper.find('.landing__pill--processing');
    expect(pill.classes()).toContain('filter-pill--active');
  });

  it('applies .filter-pill--active to Ready pill when activeFilter is "ready"', () => {
    const wrapper = mountToolbar({ activeFilter: 'ready' });
    const pill = wrapper.find('.landing__pill--ready');
    expect(pill.classes()).toContain('filter-pill--active');
  });

  it('applies .filter-pill--active to Failed pill when activeFilter is "failed"', () => {
    const wrapper = mountToolbar({ activeFilter: 'failed' });
    const pill = wrapper.find('.landing__pill--failed');
    expect(pill.classes()).toContain('filter-pill--active');
  });

  it('does NOT apply .filter-pill--active to non-active pills', () => {
    const wrapper = mountToolbar({ activeFilter: 'all' });
    const activePills = wrapper.findAll('.filter-pill--active');
    expect(activePills).toHaveLength(1);
  });
});

describe('SessionToolbar — session count display', () => {
  it('shows "8 sessions" when sessionCount equals filteredCount', () => {
    const wrapper = mountToolbar({ sessionCount: 8, filteredCount: 8 });
    expect(wrapper.find('.landing__session-count').text()).toContain('8 sessions');
  });

  it('shows "3 of 8 sessions" when filteredCount differs from sessionCount', () => {
    const wrapper = mountToolbar({ sessionCount: 8, filteredCount: 3 });
    expect(wrapper.find('.landing__session-count').text()).toContain('3 of 8');
  });

  it('handles singular "1 session"', () => {
    const wrapper = mountToolbar({ sessionCount: 1, filteredCount: 1 });
    expect(wrapper.find('.landing__session-count').text()).toContain('1 session');
  });
});

describe('SessionToolbar — emits', () => {
  it('emits update:searchQuery when input changes', async () => {
    const wrapper = mountToolbar();
    const input = wrapper.find('.search-bar__input');
    await input.setValue('hello');
    const emitted = wrapper.emitted('update:searchQuery');
    expect(emitted).toBeTruthy();
    expect(emitted![0]).toEqual(['hello']);
  });

  it('emits update:activeFilter with "processing" when Processing pill clicked', async () => {
    const wrapper = mountToolbar();
    await wrapper.find('.landing__pill--processing').trigger('click');
    const emitted = wrapper.emitted('update:activeFilter');
    expect(emitted).toBeTruthy();
    expect(emitted![0]).toEqual(['processing']);
  });

  it('emits update:activeFilter with "ready" when Ready pill clicked', async () => {
    const wrapper = mountToolbar();
    await wrapper.find('.landing__pill--ready').trigger('click');
    const emitted = wrapper.emitted('update:activeFilter');
    expect(emitted![0]).toEqual(['ready']);
  });

  it('emits update:activeFilter with "failed" when Failed pill clicked', async () => {
    const wrapper = mountToolbar();
    await wrapper.find('.landing__pill--failed').trigger('click');
    const emitted = wrapper.emitted('update:activeFilter');
    expect(emitted![0]).toEqual(['failed']);
  });

  it('emits update:activeFilter with "all" when All pill clicked', async () => {
    const wrapper = mountToolbar({ activeFilter: 'processing' });
    const pills = wrapper.findAll('.filter-pill');
    const allPill = pills.find((p) => p.text().trim() === 'All')!;
    await allPill.trigger('click');
    const emitted = wrapper.emitted('update:activeFilter');
    expect(emitted![0]).toEqual(['all']);
  });
});

describe('SessionToolbar — search input binding', () => {
  it('reflects searchQuery prop value in input', () => {
    const wrapper = mountToolbar({ searchQuery: 'my-query' });
    const input = wrapper.find('.search-bar__input') as ReturnType<typeof wrapper.find>;
    expect((input.element as HTMLInputElement).value).toBe('my-query');
  });
});

/**
 * Tests for StartPage component — Stage 8.
 *
 * Covers: rendering (upload zone, title, browse link, AGR hint, SVG pipeline,
 * file input), accessibility attributes, keyboard interaction, and file picker
 * trigger behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import StartPage from './StartPage.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import type { Session } from '../../shared/types/session.js';

/** Minimal mock of SessionListState for injection. */
function mockSessionListState(sessions: Session[] = []): SessionListState {
  const sessionsRef = ref(sessions);
  return {
    sessions: sessionsRef,
    loading: ref(false),
    error: ref(null),
    searchQuery: ref(''),
    statusFilter: ref('all'),
    filteredSessions: computed(() => sessionsRef.value),
    fetchSessions: vi.fn(),
    deleteSession: vi.fn(),
  };
}

describe('StartPage', () => {
  describe('structure', () => {
    it('renders without errors', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.exists()).toBe(true);
    });

    it('renders the upload zone element', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.upload-zone').exists()).toBe(true);
    });

    it('renders "No sessions yet" title when no sessions exist', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.upload-zone__title').text()).toBe('No sessions yet. Fix that.');
    });

    it('renders "Add another session" title when sessions exist', () => {
      const wrapper = mount(StartPage, {
        global: {
          provide: {
            [sessionListKey as symbol]: mockSessionListState([{ id: '1', filename: 'test.cast' } as Session]),
          },
        },
      });
      expect(wrapper.find('.upload-zone__title').text()).toBe('Add another session.');
    });

    it('renders the browse files link', () => {
      const wrapper = mount(StartPage);
      const browse = wrapper.find('.upload-zone__browse');
      expect(browse.exists()).toBe(true);
      expect(browse.text().toLowerCase()).toContain('browse');
    });

    it('renders the AGR hint link', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.start-page__hint').exists()).toBe(true);
      expect(wrapper.find('.start-page__hint a').exists()).toBe(true);
    });

    it('renders the SVG pipeline background', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.start-page__pipeline').exists()).toBe(true);
    });

    it('renders a hidden file input with .cast accept filter', () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      expect(input.exists()).toBe(true);
      expect(input.attributes('accept')).toBe('.cast');
    });

    it('renders 5 pipeline nodes', () => {
      const wrapper = mount(StartPage);
      const nodeRings = wrapper.findAll('.sp-node-ring');
      expect(nodeRings.length).toBe(5);
    });

    it('renders 8 ambient particles', () => {
      const wrapper = mount(StartPage);
      const particles = wrapper.findAll('.sp-particle');
      expect(particles.length).toBe(8);
    });

    it('renders the cursor watermark', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.start-page__cursor-prompt').exists()).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('upload zone has role="button"', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.upload-zone');
      expect(zone.attributes('role')).toBe('button');
    });

    it('upload zone has tabindex="0"', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.upload-zone');
      expect(zone.attributes('tabindex')).toBe('0');
    });

    it('upload zone has aria-label for screen readers', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.upload-zone');
      expect(zone.attributes('aria-label')).toBeTruthy();
    });

    it('SVG pipeline is aria-hidden', () => {
      const wrapper = mount(StartPage);
      const svg = wrapper.find('.start-page__pipeline');
      expect(svg.attributes('aria-hidden')).toBe('true');
    });

    it('upload zone has aria-dropeffect="copy"', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.upload-zone');
      expect(zone.attributes('aria-dropeffect')).toBe('copy');
    });

    it('cursor watermark is aria-hidden', () => {
      const wrapper = mount(StartPage);
      const cursor = wrapper.find('.start-page__cursor-prompt');
      expect(cursor.attributes('aria-hidden')).toBe('true');
    });
  });

  describe('file picker interaction', () => {
    it('clicking the browse link triggers the hidden file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.upload-zone__browse').trigger('click');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('clicking the upload zone triggers the hidden file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.upload-zone').trigger('click');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('pressing Enter on the upload zone triggers the file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.upload-zone').trigger('keydown', { key: 'Enter' });

      expect(clickSpy).toHaveBeenCalled();
    });

    it('pressing Space on the upload zone triggers the file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.upload-zone').trigger('keydown', { key: ' ' });

      expect(clickSpy).toHaveBeenCalled();
    });
  });
});

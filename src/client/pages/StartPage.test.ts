/**
 * Tests for StartPage component — Stage 8.
 *
 * Covers: rendering (upload zone, title, browse link, AGR hint, SVG pipeline,
 * file input), accessibility attributes, keyboard interaction, file picker
 * trigger behavior, and handleFileChange upload flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, computed } from 'vue';
import StartPage from './StartPage.vue';
import { sessionListKey } from '../composables/useSessionList.js';
import type { SessionListState } from '../composables/useSessionList.js';
import type { Session } from '../../shared/types/session.js';

// Shared mock function for uploadFileWithOptimistic — used by both component and tests.
const mockUploadFileWithOptimistic = vi.fn();

// Mock useUpload so file-change tests don't hit fetch
vi.mock('../composables/useUpload.js', () => ({
  useUpload: () => ({
    uploadFileWithOptimistic: mockUploadFileWithOptimistic,
  }),
}));

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
    refreshOnSessionComplete: vi.fn(),
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

    it('pressing Tab on the upload zone does not trigger the file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.upload-zone').trigger('keydown', { key: 'Tab' });

      expect(clickSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleFileChange', () => {
    beforeEach(() => {
      mockUploadFileWithOptimistic.mockReset();
    });

    it('calls uploadFileWithOptimistic for each selected file when sessionList is injected', async () => {
      const sessionState = mockSessionListState([]);
      const wrapper = mount(StartPage, {
        global: {
          provide: {
            [sessionListKey as symbol]: sessionState,
          },
        },
      });

      const input = wrapper.find('input[type="file"]');
      const file1 = new File(['content'], 'session1.cast', { type: '' });
      const file2 = new File(['content'], 'session2.cast', { type: '' });

      // Simulate the change event with a FileList-like object
      Object.defineProperty(input.element, 'files', {
        value: [file1, file2],
        writable: false,
        configurable: true,
      });

      await input.trigger('change');

      expect(mockUploadFileWithOptimistic).toHaveBeenCalledTimes(2);
    });

    it('does not call uploadFileWithOptimistic when no sessionList is provided', async () => {
      const wrapper = mount(StartPage);

      const input = wrapper.find('input[type="file"]');
      const file = new File(['content'], 'session.cast', { type: '' });

      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      });

      await input.trigger('change');

      expect(mockUploadFileWithOptimistic).not.toHaveBeenCalled();
    });

    it('does not call uploadFileWithOptimistic when files list is empty', async () => {
      const sessionState = mockSessionListState([]);
      const wrapper = mount(StartPage, {
        global: {
          provide: {
            [sessionListKey as symbol]: sessionState,
          },
        },
      });

      const input = wrapper.find('input[type="file"]');
      Object.defineProperty(input.element, 'files', {
        value: [],
        writable: false,
        configurable: true,
      });

      await input.trigger('change');

      expect(mockUploadFileWithOptimistic).not.toHaveBeenCalled();
    });

    it('onOptimisticInsert prepends the temp session to the sessions list', async () => {
      const sessionState = mockSessionListState([]);
      const wrapper = mount(StartPage, {
        global: {
          provide: {
            [sessionListKey as symbol]: sessionState,
          },
        },
      });

      const input = wrapper.find('input[type="file"]');
      const file = new File(['content'], 'session.cast', { type: '' });

      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      });

      await input.trigger('change');

      // Extract the onOptimisticInsert callback and call it
      const callbacks = mockUploadFileWithOptimistic.mock.calls[0]?.[1];
      const tempSession = { id: 'temp-1', filename: 'session.cast' } as Session;
      callbacks?.onOptimisticInsert(tempSession);

      expect(sessionState.sessions.value[0]).toEqual(tempSession);
    });

    it('onUploadComplete removes the temp session and calls fetchSessions', async () => {
      const tempSession = { id: 'temp-1', filename: 'session.cast' } as Session;
      const sessionState = mockSessionListState([tempSession]);

      const wrapper = mount(StartPage, {
        global: {
          provide: {
            [sessionListKey as symbol]: sessionState,
          },
        },
      });

      const input = wrapper.find('input[type="file"]');
      const file = new File(['content'], 'session.cast', { type: '' });

      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      });

      await input.trigger('change');

      // Extract the onUploadComplete callback and call it
      const callbacks = mockUploadFileWithOptimistic.mock.calls[0]?.[1];
      await callbacks?.onUploadComplete('temp-1');

      expect(sessionState.sessions.value.find((s) => s.id === 'temp-1')).toBeUndefined();
      expect(sessionState.fetchSessions).toHaveBeenCalled();
    });
  });
});

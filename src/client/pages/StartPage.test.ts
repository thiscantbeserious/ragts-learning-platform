/**
 * Tests for StartPage component — Stage 8.
 *
 * Covers: rendering (drop zone, heading, CTA button, AGR hint, SVG pipeline,
 * file input), accessibility attributes, keyboard interaction, and file picker
 * trigger behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import StartPage from './StartPage.vue';

describe('StartPage', () => {
  describe('structure', () => {
    it('renders without errors', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.exists()).toBe(true);
    });

    it('renders the drop zone element', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.start-page__drop-zone').exists()).toBe(true);
    });

    it('renders the heading with upload CTA text', () => {
      const wrapper = mount(StartPage);
      expect(wrapper.find('.start-page__heading').exists()).toBe(true);
      expect(wrapper.find('.start-page__heading').text()).toBeTruthy();
    });

    it('renders the Browse Files button', () => {
      const wrapper = mount(StartPage);
      const btn = wrapper.find('.start-page__cta');
      expect(btn.exists()).toBe(true);
      expect(btn.text().toLowerCase()).toContain('browse');
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
  });

  describe('accessibility', () => {
    it('drop zone has role="button"', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.start-page__drop-zone');
      expect(zone.attributes('role')).toBe('button');
    });

    it('drop zone has tabindex="0"', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.start-page__drop-zone');
      expect(zone.attributes('tabindex')).toBe('0');
    });

    it('drop zone has aria-label for screen readers', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.start-page__drop-zone');
      expect(zone.attributes('aria-label')).toBeTruthy();
    });

    it('SVG pipeline is aria-hidden', () => {
      const wrapper = mount(StartPage);
      const svg = wrapper.find('.start-page__pipeline');
      expect(svg.attributes('aria-hidden')).toBe('true');
    });

    it('drop zone has aria-dropeffect="copy"', () => {
      const wrapper = mount(StartPage);
      const zone = wrapper.find('.start-page__drop-zone');
      expect(zone.attributes('aria-dropeffect')).toBe('copy');
    });
  });

  describe('file picker interaction', () => {
    it('clicking the CTA button triggers the hidden file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.start-page__cta').trigger('click');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('clicking the drop zone triggers the hidden file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.start-page__drop-zone').trigger('click');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('pressing Enter on the drop zone triggers the file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.start-page__drop-zone').trigger('keydown', { key: 'Enter' });

      expect(clickSpy).toHaveBeenCalled();
    });

    it('pressing Space on the drop zone triggers the file input click', async () => {
      const wrapper = mount(StartPage);
      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

      await wrapper.find('.start-page__drop-zone').trigger('keydown', { key: ' ' });

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('corner bracket decorations', () => {
    it('renders four corner bracket elements', () => {
      const wrapper = mount(StartPage);
      const corners = wrapper.findAll('.start-page__corner');
      expect(corners.length).toBe(4);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TerminalSnapshot from './TerminalSnapshot.vue';
import type { SnapshotLine } from '../../../packages/vt-wasm/types';

describe('TerminalSnapshot', () => {
  it('renders plain text spans correctly', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Hello World' }] },
      { spans: [{ text: 'Second line' }] },
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    expect(wrapper.text()).toContain('Hello World');
    expect(wrapper.text()).toContain('Second line');
    const lineElements = wrapper.findAll('.terminal-line');
    expect(lineElements).toHaveLength(2);
  });

  it('renders foreground color via CSS variable (palette 0-7)', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Red text', fg: 1 }] }, // ANSI red = palette index 1
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
    expect(span.element.style.color).toBe('var(--term-color-1)');
  });

  it('renders background color', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Blue background', bg: 4 }] }, // ANSI blue = palette index 4
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
    expect(span.element.style.backgroundColor).toBe('var(--term-color-4)');
  });

  it('renders bold/italic/underline attributes', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Bold', bold: true }] },
      { spans: [{ text: 'Italic', italic: true }] },
      { spans: [{ text: 'Underline', underline: true }] },
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const spans = wrapper.findAll('.terminal-span');
    expect(spans[0].classes()).toContain('terminal-span--bold');
    expect(spans[1].classes()).toContain('terminal-span--italic');
    expect(spans[2].classes()).toContain('terminal-span--underline');
  });

  it('renders 256-color palette span', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Orange', fg: 208 }] }, // 256-color palette orange
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
    // Should compute RGB color from palette index 208
    expect(span.element.style.color).toMatch(/rgb/);
  });

  it('renders true color (#RRGGBB) span', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'True color', fg: '#ff5733' }] },
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
    expect(span.element.style.color).toBe('#ff5733');
  });

  it('renders empty snapshot (no crash)', () => {
    const lines: SnapshotLine[] = [];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    expect(wrapper.find('.terminal-snapshot').exists()).toBe(true);
    expect(wrapper.findAll('.terminal-line')).toHaveLength(0);
  });

  it('renders correct number of lines (e.g., 24 lines for 80x24)', () => {
    const lines: SnapshotLine[] = Array.from({ length: 24 }, (_, i) => ({
      spans: [{ text: `Line ${i + 1}` }],
    }));

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const lineElements = wrapper.findAll('.terminal-line');
    expect(lineElements).toHaveLength(24);
  });

  it('handles multiple attributes on single span', () => {
    const lines: SnapshotLine[] = [
      {
        spans: [
          { text: 'Bold italic underline', bold: true, italic: true, underline: true, fg: 2 },
        ],
      },
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.classes()).toContain('terminal-span--bold');
    expect(span.classes()).toContain('terminal-span--italic');
    expect(span.classes()).toContain('terminal-span--underline');
    expect(span.element.style.color).toBe('var(--term-color-2)');
  });

  it('handles faint, strikethrough, blink, and inverse attributes', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Faint', faint: true }] },
      { spans: [{ text: 'Strike', strikethrough: true }] },
      { spans: [{ text: 'Blink', blink: true }] },
      { spans: [{ text: 'Inverse', inverse: true }] },
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const spans = wrapper.findAll('.terminal-span');
    expect(spans[0].classes()).toContain('terminal-span--faint');
    expect(spans[1].classes()).toContain('terminal-span--strikethrough');
    expect(spans[2].classes()).toContain('terminal-span--blink');
    expect(spans[3].classes()).toContain('terminal-span--inverse');
  });

  it('handles bright ANSI colors (8-15)', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Bright red', fg: 9 }] }, // Bright red = palette index 9
      { spans: [{ text: 'Bright cyan', fg: 14 }] }, // Bright cyan = palette index 14
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const spans = wrapper.findAll('.terminal-span');
    expect(spans[0].element.style.color).toBe('var(--term-color-9)');
    expect(spans[1].element.style.color).toBe('var(--term-color-14)');
  });

  it('handles grayscale colors (232-255)', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Gray', fg: 240 }] }, // Grayscale ramp
    ];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
    // Should compute grayscale RGB value
    expect(span.element.style.color).toMatch(/rgb/);
  });
});

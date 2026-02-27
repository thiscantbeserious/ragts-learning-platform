/**
 * Snapshot tests for TerminalSnapshot component.
 * Locks down HTML output for all color modes and text attributes.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TerminalSnapshot from '@client/components/TerminalSnapshot.vue';
import type { SnapshotLine } from '../../../packages/vt-wasm/types';

describe('TerminalSnapshot component snapshots', () => {
  it('plain text lines', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Hello World' }] },
      { spans: [{ text: 'Second line' }] },
      { spans: [{ text: 'Third line' }] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('16-color foreground (ANSI 0-15)', () => {
    const lines: SnapshotLine[] = [
      { spans: [
        { text: 'Red', fg: 1 },
        { text: ' ' },
        { text: 'Green', fg: 2 },
        { text: ' ' },
        { text: 'Blue', fg: 4 },
      ] },
      { spans: [
        { text: 'BrightRed', fg: 9 },
        { text: ' ' },
        { text: 'BrightCyan', fg: 14 },
      ] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('16-color background', () => {
    const lines: SnapshotLine[] = [
      { spans: [
        { text: 'Red BG', bg: 1 },
        { text: ' ' },
        { text: 'Blue BG', bg: 4 },
      ] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('256-palette colors (16-231 RGB cube + 232-255 grayscale)', () => {
    const lines: SnapshotLine[] = [
      { spans: [
        { text: 'Orange', fg: 208 },
        { text: ' ' },
        { text: 'Purple', fg: 135 },
      ] },
      { spans: [
        { text: 'Gray', fg: 240 },
        { text: ' ' },
        { text: 'Light', fg: 250 },
      ] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('true color (#RRGGBB)', () => {
    const lines: SnapshotLine[] = [
      { spans: [
        { text: 'Custom FG', fg: '#ff5733' },
        { text: ' ' },
        { text: 'Custom BG', bg: '#0066cc' },
      ] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('all text attributes', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Bold', bold: true }] },
      { spans: [{ text: 'Italic', italic: true }] },
      { spans: [{ text: 'Underline', underline: true }] },
      { spans: [{ text: 'Strikethrough', strikethrough: true }] },
      { spans: [{ text: 'Faint', faint: true }] },
      { spans: [{ text: 'Blink', blink: true }] },
      { spans: [{ text: 'Inverse', inverse: true }] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('combined attributes and colors', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'Bold Red', bold: true, fg: 1 }] },
      { spans: [{ text: 'Italic Green BG', italic: true, bg: 2 }] },
      { spans: [{ text: 'All attrs', bold: true, italic: true, underline: true, fg: '#ff0000', bg: '#000080' }] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('line numbers with startLineNumber', () => {
    const lines: SnapshotLine[] = [
      { spans: [{ text: 'First' }] },
      { spans: [{ text: 'Second' }] },
    ];
    const wrapper = mount(TerminalSnapshot, {
      props: { lines, startLineNumber: 42 },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('empty snapshot (no lines)', () => {
    const wrapper = mount(TerminalSnapshot, {
      props: { lines: [] },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('large input — 100 lines', () => {
    const lines: SnapshotLine[] = Array.from({ length: 100 }, (_, i) => ({
      spans: [{ text: `Line ${i + 1}: ${'x'.repeat(60)}` }],
    }));
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    // Just snapshot the line count, not full HTML (too large)
    const lineElements = wrapper.findAll('.terminal-line');
    expect(lineElements.length).toBe(100);
    // Snapshot first and last line HTML
    expect(lineElements[0].html()).toMatchSnapshot();
    expect(lineElements[99].html()).toMatchSnapshot();
  });

  it('multi-span line with mixed styles', () => {
    const lines: SnapshotLine[] = [
      { spans: [
        { text: '$ ' },
        { text: 'npm', fg: 2, bold: true },
        { text: ' ' },
        { text: 'test', fg: 14 },
      ] },
    ];
    const wrapper = mount(TerminalSnapshot, { props: { lines } });
    expect(wrapper.html()).toMatchSnapshot();
  });
});

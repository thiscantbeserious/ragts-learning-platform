import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AnsiLine from './AnsiLine.vue';

describe('AnsiLine', () => {
  it('renders plain text without ANSI codes', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: 'Hello World' }
    });

    expect(wrapper.text()).toBe('Hello World');
    expect(wrapper.find('span').exists()).toBe(true);
  });

  it('renders text with foreground color', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '\x1b[31mRed Text\x1b[0m' }
    });

    expect(wrapper.text()).toBe('Red Text');
    // anser returns "ansi-red" -> class becomes "ansi-fg-ansi-red"
    const span = wrapper.find('span.ansi-fg-ansi-red');
    expect(span.exists()).toBe(true);
    expect(span.text()).toBe('Red Text');
  });

  it('renders text with background color', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '\x1b[42mGreen BG\x1b[0m' }
    });

    expect(wrapper.text()).toBe('Green BG');
    const span = wrapper.find('span.ansi-bg-ansi-green');
    expect(span.exists()).toBe(true);
  });

  it('renders bold text', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '\x1b[1mBold Text\x1b[0m' }
    });

    expect(wrapper.text()).toBe('Bold Text');
    const span = wrapper.find('span.ansi-bold');
    expect(span.exists()).toBe(true);
  });

  it('renders underlined text', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '\x1b[4mUnderlined\x1b[0m' }
    });

    expect(wrapper.text()).toBe('Underlined');
    const span = wrapper.find('span.ansi-underline');
    expect(span.exists()).toBe(true);
  });

  it('renders 256-color palette', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '\x1b[38;5;208mOrange\x1b[0m' }
    });

    expect(wrapper.text()).toBe('Orange');
    // anser returns "ansi-palette-208" -> class becomes "ansi-fg-ansi-palette-208"
    const span = wrapper.find('span.ansi-fg-ansi-palette-208');
    expect(span.exists()).toBe(true);
  });

  it('renders mixed styles', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '\x1b[1;4;31mBold Red Underline\x1b[0m' }
    });

    expect(wrapper.text()).toBe('Bold Red Underline');
    expect(wrapper.find('span.ansi-bold').exists()).toBe(true);
    expect(wrapper.find('span.ansi-underline').exists()).toBe(true);
    expect(wrapper.find('span.ansi-fg-ansi-red').exists()).toBe(true);
  });

  it('handles empty line', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: '' }
    });

    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.text()).toBe('');
  });

  it('ignores unknown control sequences', () => {
    // \x1b[2J = clear screen, \x1b[H = cursor home - should be stripped
    const wrapper = mount(AnsiLine, {
      props: { line: 'Before\x1b[2JMiddle\x1b[HAfter' }
    });

    const text = wrapper.text();
    expect(text).toContain('Before');
    expect(text).toContain('Middle');
    expect(text).toContain('After');
  });

  it('handles text with multiple segments', () => {
    const wrapper = mount(AnsiLine, {
      props: { line: 'Plain \x1b[32mGreen\x1b[0m Back to plain' }
    });

    expect(wrapper.text()).toBe('Plain Green Back to plain');
    const spans = wrapper.findAll('span');
    expect(spans.length).toBeGreaterThan(1);
  });
});

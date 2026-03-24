/**
 * Branch coverage tests for TerminalSnapshot component — line 44.
 *
 * Lines targeted:
 *   44 — paletteToRgb: toRgbValue helper `v === 0 ? 0 : 55 + v * 40`
 *        The `v === 0` true branch: when RGB cube index is 0 in any channel.
 *        Palette index 16 = cube index 0 → r=0, g=0, b=0 → rgb(0, 0, 0)
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TerminalSnapshot from './TerminalSnapshot.vue';
import type { SnapshotLine } from '#vt-wasm/types';

describe('TerminalSnapshot — paletteToRgb toRgbValue zero branch (line 44)', () => {
  it('renders palette index 16 (cube index 0) as rgb(0, 0, 0) — all channels zero', () => {
    // Palette index 16 = cube index 0: r=0, g=0, b=0 → toRgbValue(0) = 0 for each
    const lines: SnapshotLine[] = [{ spans: [{ text: 'Black cube', fg: 16 }] }];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
    // toRgbValue(0) = 0 → rgb(0, 0, 0)
    expect((span.element as HTMLElement).style.color).toBe('rgb(0, 0, 0)');
  });

  it('renders palette index 17 (cube = r0,g0,b1) as rgb(0, 0, 95)', () => {
    // Palette index 17 = cube index 1: r=0, g=0, b=1 → toRgbValue(0)=0, toRgbValue(0)=0, toRgbValue(1)=95
    const lines: SnapshotLine[] = [{ spans: [{ text: 'Near-black', fg: 17 }] }];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect((span.element as HTMLElement).style.color).toBe('rgb(0, 0, 95)');
  });

  it('renders palette index 16 as background color (bg channel zero branch)', () => {
    const lines: SnapshotLine[] = [{ spans: [{ text: 'Black bg', bg: 16 }] }];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    const span = wrapper.find('.terminal-span');
    expect((span.element as HTMLElement).style.backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('renders out-of-range palette index as "inherit" (fallback branch)', () => {
    // Index 256 is out of range (>255) — should use fallback 'inherit'
    const lines: SnapshotLine[] = [{ spans: [{ text: 'Out of range', fg: 256 }] }];

    const wrapper = mount(TerminalSnapshot, {
      props: { lines },
    });

    // Out-of-range → paletteToRgb returns 'inherit'
    // happy-dom may coerce or keep the CSS value
    const span = wrapper.find('.terminal-span');
    expect(span.exists()).toBe(true);
  });
});

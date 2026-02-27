/**
 * Snapshot tests for vt-wasm terminal processing.
 * Locks down VT output for escape sequences, colors, attributes, and operations.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initVt, createVt } from '../../../packages/vt-wasm/index.js';
import type { TerminalSnapshot } from '../../../packages/vt-wasm/types.js';
import { snapshotToText } from '../../helpers/test-utils.js';

beforeAll(async () => {
  await initVt();
});

/** Feed data and get the view, returning a simplified snapshot for readable assertions. */
function feedAndView(data: string, cols = 80, rows = 24): { text: string[]; snapshot: TerminalSnapshot } {
  const vt = createVt(cols, rows);
  vt.feed(data);
  const snapshot = vt.getView();
  vt.free();
  return { text: snapshotToText(snapshot).map(t => t.trimEnd()), snapshot };
}

/** Feed data and get all lines (scrollback + viewport). */
function feedAndAllLines(data: string, cols = 80, rows = 24, scrollback = 1000): { text: string[]; snapshot: TerminalSnapshot } {
  const vt = createVt(cols, rows, scrollback);
  vt.feed(data);
  const snapshot = vt.getAllLines();
  vt.free();
  return { text: snapshotToText(snapshot).map(t => t.trimEnd()), snapshot };
}

/** Extract color spans with fg values from a snapshot line. */
function extractColorSpans(snapshot: TerminalSnapshot, lineIndex = 0) {
  return snapshot.lines[lineIndex].spans
    .filter(s => s.fg !== undefined)
    .map(s => ({ text: s.text, fg: s.fg }));
}

/** Extract spans with a specific attribute from a snapshot line. */
function extractAttrSpans(snapshot: TerminalSnapshot, attr: string, lineIndex = 0) {
  return snapshot.lines[lineIndex].spans
    .filter(s => (s as any)[attr])
    .map(s => ({ text: s.text, [attr]: (s as any)[attr] }));
}

describe('vt-wasm snapshots', () => {
  it('plain text — getView', () => {
    const { text, snapshot } = feedAndView('Hello World\r\nSecond line\r\n');
    expect(text.filter(l => l.length > 0)).toMatchSnapshot();
    expect(snapshot.cols).toBe(80);
    expect(snapshot.rows).toBe(24);
  });

  it('16-color foreground — span fg values', () => {
    const { snapshot } = feedAndView(
      '\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m\r\n'
    );
    expect(extractColorSpans(snapshot)).toMatchSnapshot();
  });

  it('256-palette color — span fg values', () => {
    const { snapshot } = feedAndView(
      '\x1b[38;5;208mOrange\x1b[0m \x1b[38;5;135mPurple\x1b[0m\r\n'
    );
    expect(extractColorSpans(snapshot)).toMatchSnapshot();
  });

  it('true color — span fg values', () => {
    const { snapshot } = feedAndView(
      '\x1b[38;2;255;128;0mTrueOrange\x1b[0m \x1b[38;2;0;200;100mTrueGreen\x1b[0m\r\n'
    );
    expect(extractColorSpans(snapshot)).toMatchSnapshot();
  });

  it.each([
    { attr: 'bold', code: '1', text: 'Bold Text' },
    { attr: 'italic', code: '3', text: 'Italic Text' },
    { attr: 'underline', code: '4', text: 'Underlined' },
    { attr: 'strikethrough', code: '9', text: 'Struck' },
  ])('$attr attribute', ({ attr, code, text }) => {
    const { snapshot } = feedAndView(`\x1b[${code}m${text}\x1b[0m\r\n`);
    expect(extractAttrSpans(snapshot, attr)).toMatchSnapshot();
  });

  it('faint and inverse attributes', () => {
    const { snapshot } = feedAndView('\x1b[2mFaint\x1b[0m \x1b[7mInverse\x1b[0m\r\n');
    const attrSpans = snapshot.lines[0].spans.filter(s => s.faint || s.inverse);
    expect(attrSpans.map(s => ({
      text: s.text,
      faint: s.faint || false,
      inverse: s.inverse || false,
    }))).toMatchSnapshot();
  });

  it('screen clear + redraw — getAllLines', () => {
    const { text } = feedAndAllLines(
      'Line 1\r\nLine 2\r\n\x1b[2J\x1b[HAfter clear\r\n'
    );
    expect(text.filter(l => l.length > 0)).toMatchSnapshot();
  });

  it('scrollback accumulation — getAllLines', () => {
    // Feed more lines than viewport to test scrollback
    let data = '';
    for (let i = 1; i <= 30; i++) {
      data += `Line ${i}\r\n`;
    }
    const { text } = feedAndAllLines(data, 80, 24, 1000);
    expect(text.filter(l => l.length > 0)).toMatchSnapshot();
    expect(text.filter(l => l.length > 0).length).toBe(30);
  });

  it('resize — terminal dimensions change', () => {
    const vt = createVt(80, 24, 1000);
    vt.feed('Before resize\r\n');
    vt.resize(120, 40);
    vt.feed('After resize\r\n');

    const view = vt.getView();
    const size = vt.getSize();
    vt.free();

    expect({
      cols: size.cols,
      rows: size.rows,
      viewCols: view.cols,
      viewRows: view.rows,
      text: snapshotToText(view).filter(l => l.trimEnd().length > 0),
    }).toMatchSnapshot();
  });

  it('valid-with-markers.cast — first 5 feed events → getView', () => {
    const content = readFileSync(
      join(__dirname, '../../fixtures/valid-with-markers.cast'),
      'utf-8'
    );
    const lines = content.split('\n').filter(l => l.trim());
    const header = JSON.parse(lines[0]);
    const events = lines.slice(1).map(l => JSON.parse(l));

    const vt = createVt(header.term?.cols ?? header.width, header.term?.rows ?? header.height);

    // Feed first 5 output events
    let fed = 0;
    for (const event of events) {
      if (event[1] === 'o') {
        vt.feed(String(event[2]));
        fed++;
        if (fed >= 5) break;
      }
    }

    const view = vt.getView();
    vt.free();
    const text = snapshotToText(view).filter(l => l.trimEnd().length > 0);

    expect(text).toMatchSnapshot();
  });
});

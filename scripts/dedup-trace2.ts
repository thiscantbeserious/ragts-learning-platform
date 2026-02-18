/**
 * Check where headers appear relative to epoch boundaries.
 */
import { NdjsonStream } from '../src/server/processing/ndjson-stream.js';
import { normalizeHeader } from '../src/shared/asciicast.js';
import { createVt, initVt } from '../packages/vt-wasm/index.js';
import type { AsciicastHeader, AsciicastEvent } from '../src/shared/asciicast-types.js';

async function main() {
  await initVt();
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: tsx dedup-trace2.ts <file>'); process.exit(1); }

  let header: AsciicastHeader | null = null;
  const events: AsciicastEvent[] = [];
  const stream = new NdjsonStream(filePath);
  for await (const item of stream) {
    if (item.header) header = normalizeHeader(item.header as Record<string, any>);
    if (item.event) events.push(item.event as AsciicastEvent);
  }
  if (!header) throw new Error('No header');

  const vt = createVt(header.width, header.height, 200000);
  let inAltScreen = false;
  const epochBoundaries: { eventIndex: number; rawLineCount: number }[] = [];

  for (let j = 0; j < events.length; j++) {
    const [, eventType, data] = events[j];
    if (eventType === 'r') {
      const sizeStr = String(data);
      const match = sizeStr.match(/^(\d+)x(\d+)$/);
      if (match) vt.resize(parseInt(match[1], 10), parseInt(match[2], 10));
    } else if (eventType === 'o') {
      const str = String(data);
      vt.feed(str.replaceAll('\x1b[3J', ''));
      if (str.includes('\x1b[?1049h')) inAltScreen = true;
      if (str.includes('\x1b[?1049l')) inAltScreen = false;
      if (!inAltScreen && (str.includes('\x1b[2J') || str.includes('\x1b[3J'))) {
        const lineCount = vt.getAllLines().lines.length;
        if (epochBoundaries.length === 0 || epochBoundaries[epochBoundaries.length - 1].rawLineCount !== lineCount) {
          epochBoundaries.push({ eventIndex: j, rawLineCount: lineCount });
        }
      }
    }
  }

  const rawSnapshot = vt.getAllLines();
  const rawLines = rawSnapshot.lines;

  const HEADER = '╭─── Claude Code v2.1.34';
  function lk(i: number) {
    return rawLines[i].spans.map(s => s.text ?? '').join('').trimEnd();
  }

  // Build epoch ranges
  const epochRanges: { start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const b of epochBoundaries) {
    epochRanges.push({ start: prevEnd, end: b.rawLineCount });
    prevEnd = b.rawLineCount;
  }
  epochRanges.push({ start: prevEnd, end: rawLines.length });

  // Find headers and show their position relative to epoch boundaries
  for (let e = 0; e < epochRanges.length; e++) {
    const r = epochRanges[e];
    const len = r.end - r.start;
    for (let i = 0; i < len; i++) {
      const rawIdx = r.start + i;
      if (lk(rawIdx).startsWith(HEADER)) {
        const remaining = len - i - 1;
        console.log(`Epoch ${e}: header at pos ${i}/${len} (${remaining} lines after), raw ${rawIdx}`);
        // Show first 3 lines after the header
        for (let k = 1; k <= Math.min(3, remaining); k++) {
          console.log(`  +${k}: "${lk(rawIdx + k).slice(0, 80)}"`);
        }
      }
    }
  }
}

main().catch(console.error);

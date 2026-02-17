/**
 * Diagnostic: run the actual buildCleanDocument on the lennart session
 * and analyze the results.
 */
import { NdjsonStream } from '../src/server/processing/ndjson-stream.js';
import { normalizeHeader } from '../src/shared/asciicast.js';
import { createVt, initVt } from '../packages/vt-wasm/index.js';
import { buildCleanDocument, type EpochBoundary } from '../src/server/processing/scrollback-dedup.js';
import type { AsciicastHeader, AsciicastEvent } from '../src/shared/asciicast-types.js';

async function main() {
  await initVt();

  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: tsx dedup-diag2.ts <file>'); process.exit(1); }

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
  const epochBoundaries: EpochBoundary[] = [];

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
  console.log(`Raw lines: ${rawSnapshot.lines.length}`);
  console.log(`Epoch boundaries: ${epochBoundaries.length}`);

  // Show epoch sizes
  let prevEnd = 0;
  for (let i = 0; i < Math.min(20, epochBoundaries.length); i++) {
    const start = prevEnd;
    const end = epochBoundaries[i].rawLineCount;
    console.log(`  Epoch ${i}: lines ${start}-${end} (${end - start} lines)`);
    prevEnd = end;
  }
  console.log(`  Final epoch: lines ${prevEnd}-${rawSnapshot.lines.length} (${rawSnapshot.lines.length - prevEnd} lines)`);

  // Run dedup
  const t0 = performance.now();
  const result = buildCleanDocument(rawSnapshot, epochBoundaries);
  const t1 = performance.now();
  console.log(`\nDedup took ${(t1 - t0).toFixed(0)}ms`);
  console.log(`Clean lines: ${result.cleanSnapshot.lines.length}`);

  // Count headers in clean doc
  let headerCount = 0;
  for (let i = 0; i < result.cleanSnapshot.lines.length; i++) {
    const text = result.cleanSnapshot.lines[i].spans.map(s => s.text ?? '').join('');
    if (text.includes('Claude Code v')) {
      headerCount++;
      if (headerCount <= 5) {
        console.log(`  Header at clean L${i + 1}: ${text.trim().slice(0, 80)}`);
      }
    }
  }
  console.log(`Total Claude Code headers in clean doc: ${headerCount}`);

  // Show first 15 lines of clean doc
  console.log('\n=== First 15 lines of clean doc ===');
  for (let i = 0; i < Math.min(15, result.cleanSnapshot.lines.length); i++) {
    const text = result.cleanSnapshot.lines[i].spans.map(s => s.text ?? '').join('').trimEnd();
    console.log(`  L${i + 1}: ${text.slice(0, 120)}`);
  }
}

main().catch(console.error);

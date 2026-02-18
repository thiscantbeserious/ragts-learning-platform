import { NdjsonStream } from '../src/server/processing/ndjson-stream.js';
import { normalizeHeader } from '../src/shared/asciicast.js';
import { createVt, initVt } from '../packages/vt-wasm/index.js';
import type { AsciicastHeader, AsciicastEvent } from '../src/shared/asciicast-types.js';

async function main() {
  await initVt();

  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: tsx diag.ts <file>'); process.exit(1); }

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
      if (match) {
        vt.resize(parseInt(match[1], 10), parseInt(match[2], 10));
      }
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
  console.log(`Total raw lines: ${rawSnapshot.lines.length}`);
  console.log(`Epoch boundaries: ${epochBoundaries.length}`);

  // Extract epochs
  const epochs: { start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const b of epochBoundaries) {
    epochs.push({ start: prevEnd, end: b.rawLineCount });
    prevEnd = b.rawLineCount;
  }
  epochs.push({ start: prevEnd, end: rawSnapshot.lines.length });

  function lineText(idx: number): string {
    return rawSnapshot.lines[idx].spans.map(s => s.text ?? '').join('').trimEnd();
  }

  // Show first 3 epochs
  for (let e = 0; e < Math.min(3, epochs.length); e++) {
    const ep = epochs[e];
    console.log(`\n=== Epoch ${e}: lines ${ep.start}-${ep.end} (${ep.end - ep.start} lines) ===`);
    for (let i = 0; i < Math.min(15, ep.end - ep.start); i++) {
      console.log(`  [${ep.start + i}] ${JSON.stringify(lineText(ep.start + i)).slice(0, 120)}`);
    }
  }

  // Check overlap: compare epoch 1 prefix vs end of epoch 0
  if (epochs.length >= 2) {
    const ep0 = epochs[0];
    const ep1 = epochs[1];
    const ep0Len = ep0.end - ep0.start;
    const ep1Len = ep1.end - ep1.start;

    console.log(`\n=== Overlap check: epoch 1 prefix vs epoch 0 content ===`);
    console.log(`  Epoch 0: ${ep0Len} lines, Epoch 1: ${ep1Len} lines`);

    // Check if epoch 1 starts with same content as epoch 0
    const checkLen = Math.min(ep0Len, ep1Len, 30);
    let matchCount = 0;
    let firstDiff = -1;
    for (let i = 0; i < checkLen; i++) {
      const l0 = lineText(ep0.start + i);
      const l1 = lineText(ep1.start + i);
      if (l0 === l1) {
        matchCount++;
      } else if (firstDiff === -1) {
        firstDiff = i;
        console.log(`  First diff at line ${i}:`);
        console.log(`    ep0: ${JSON.stringify(l0).slice(0, 120)}`);
        console.log(`    ep1: ${JSON.stringify(l1).slice(0, 120)}`);
      }
    }
    console.log(`  Match: ${matchCount}/${checkLen} (${(matchCount/checkLen*100).toFixed(1)}%)`);

    // Also check: does epoch 1 start with epoch 0's LAST lines? (suffix match)
    console.log(`\n=== Suffix check: epoch 1 prefix vs epoch 0 SUFFIX ===`);
    const suffixCheckLen = Math.min(20, ep0Len, ep1Len);
    let suffixMatch = 0;
    for (let i = 0; i < suffixCheckLen; i++) {
      const l0 = lineText(ep0.end - suffixCheckLen + i);
      const l1 = lineText(ep1.start + i);
      if (l0 === l1) suffixMatch++;
      else {
        console.log(`  Diff at offset ${i}:`);
        console.log(`    ep0_suffix: ${JSON.stringify(lineText(ep0.end - suffixCheckLen + i)).slice(0, 120)}`);
        console.log(`    ep1_prefix: ${JSON.stringify(lineText(ep1.start + i)).slice(0, 120)}`);
        break;
      }
    }
    console.log(`  Suffix match: ${suffixMatch}/${suffixCheckLen}`);
  }
}

main().catch(console.error);

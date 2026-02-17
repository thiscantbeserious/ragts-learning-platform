/**
 * Debug script: run the dedup algorithm with verbose logging to trace
 * why certain blocks aren't being deduplicated.
 */
import { NdjsonStream } from '../src/server/processing/ndjson-stream.js';
import { normalizeHeader } from '../src/shared/asciicast.js';
import { createVt, initVt } from '../packages/vt-wasm/index.js';
import type { AsciicastHeader, AsciicastEvent } from '../src/shared/asciicast-types.js';
import type { TerminalSnapshot, SnapshotLine } from '../packages/vt-wasm/types.js';

const MIN_MATCH = 3;

function lineKey(line: SnapshotLine): string {
  return line.spans.map(span => span.text ?? '').join('').trimEnd();
}

async function main() {
  await initVt();

  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: tsx dedup-debug.ts <file>'); process.exit(1); }

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
  console.log(`Raw lines: ${rawLines.length}, Epochs: ${epochBoundaries.length}`);

  // Run dedup with logging for header lines
  const HEADER_TEXT = '╭─── Claude Code v2.1.34';
  const cleanLines: SnapshotLine[] = [];
  const cleanIndex = new Map<string, number[]>();
  let headerCleanPositions: number[] = [];
  let headersDeduped = 0;
  let headersNew = 0;

  function addToClean(line: SnapshotLine): number {
    const cleanPos = cleanLines.length;
    cleanLines.push(line);
    const key = lineKey(line);
    let positions = cleanIndex.get(key);
    if (!positions) { positions = []; cleanIndex.set(key, positions); }
    positions.push(cleanPos);
    return cleanPos;
  }

  const epochRanges: { start: number; end: number }[] = [];
  let prevEnd = 0;
  for (const b of epochBoundaries) {
    epochRanges.push({ start: prevEnd, end: b.rawLineCount });
    prevEnd = b.rawLineCount;
  }
  epochRanges.push({ start: prevEnd, end: rawLines.length });

  for (let epochIdx = 0; epochIdx < epochRanges.length; epochIdx++) {
    const curr = epochRanges[epochIdx];
    const currLen = curr.end - curr.start;
    if (currLen === 0) continue;

    let i = 0;
    while (i < currLen) {
      const rawIdx = curr.start + i;
      const key = lineKey(rawLines[rawIdx]);
      const isHeader = key.startsWith(HEADER_TEXT);
      const candidates = cleanIndex.get(key);

      let bestLen = 0;
      let bestCleanStart = -1;

      if (candidates) {
        for (const cleanPos of candidates) {
          let len = 0;
          while (
            i + len < currLen &&
            cleanPos + len < cleanLines.length &&
            lineKey(rawLines[curr.start + i + len]) === lineKey(cleanLines[cleanPos + len])
          ) {
            len++;
          }
          if (len > bestLen) {
            bestLen = len;
            bestCleanStart = cleanPos;
          }
        }
      }

      if (bestLen >= MIN_MATCH) {
        if (isHeader) {
          headersDeduped++;
          console.log(`  DEDUP header at raw ${rawIdx} (epoch ${epochIdx}, pos ${i}): block of ${bestLen} → clean ${bestCleanStart}`);
        }
        i += bestLen;
      } else {
        const cleanPos = addToClean(rawLines[rawIdx]);
        if (isHeader) {
          headersNew++;
          headerCleanPositions.push(cleanPos);
          console.log(`  NEW header at raw ${rawIdx} (epoch ${epochIdx}, pos ${i}) → clean ${cleanPos}, candidates: ${candidates?.length ?? 0}, bestBlock: ${bestLen}`);
        }
        i++;
      }
    }
  }

  console.log(`\nClean lines: ${cleanLines.length}`);
  console.log(`Headers: ${headersNew} new, ${headersDeduped} deduped`);
  console.log(`Header clean positions: ${headerCleanPositions.join(', ')}`);

  // Check which pairs of header positions have identical 5-line context
  for (let a = 0; a < headerCleanPositions.length; a++) {
    for (let b = a + 1; b < headerCleanPositions.length; b++) {
      const pa = headerCleanPositions[a];
      const pb = headerCleanPositions[b];
      let matchLen = 0;
      while (
        pa + matchLen < cleanLines.length &&
        pb + matchLen < cleanLines.length &&
        lineKey(cleanLines[pa + matchLen]) === lineKey(cleanLines[pb + matchLen])
      ) {
        matchLen++;
      }
      if (matchLen >= 3) {
        console.log(`  Clean headers at ${pa} and ${pb} share ${matchLen} matching lines!`);
      }
    }
  }
}

main().catch(console.error);

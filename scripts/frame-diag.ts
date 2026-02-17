import { NdjsonStream } from '../src/server/processing/ndjson-stream.js';
import { normalizeHeader } from '../src/shared/asciicast.js';
import type { AsciicastHeader, AsciicastEvent } from '../src/shared/asciicast-types.js';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: tsx frame-diag.ts <file>'); process.exit(1); }

  let header: AsciicastHeader | null = null;
  const events: AsciicastEvent[] = [];
  const stream = new NdjsonStream(filePath);
  for await (const item of stream) {
    if (item.header) header = normalizeHeader(item.header as Record<string, any>);
    if (item.event) events.push(item.event as AsciicastEvent);
  }
  if (!header) throw new Error('No header');

  console.log(`Events: ${events.length}, Width: ${header.width}, Height: ${header.height}`);

  // Scan for escape sequences that indicate frame boundaries
  const escPatterns: Record<string, number> = {};
  let altScreenEnter = 0;
  let altScreenExit = 0;
  let clearScreen2J = 0;
  let clearScrollback3J = 0;
  let cursorHome = 0;
  let eraseDisplay = 0;

  // Find first 5 events that contain 2J or 3J and show their context
  let clearExamples = 0;

  for (let j = 0; j < events.length; j++) {
    const [ts, eventType, data] = events[j];
    if (eventType !== 'o') continue;
    const str = String(data);

    if (str.includes('\x1b[?1049h')) altScreenEnter++;
    if (str.includes('\x1b[?1049l')) altScreenExit++;
    if (str.includes('\x1b[2J')) clearScreen2J++;
    if (str.includes('\x1b[3J')) clearScrollback3J++;
    if (str.includes('\x1b[H') && !str.includes('\x1b[?')) cursorHome++;

    // Check for combined clear patterns
    if (str.includes('\x1b[2J') || str.includes('\x1b[3J')) {
      if (clearExamples < 5) {
        clearExamples++;
        // Show surrounding events for context
        const prevData = j > 0 ? String(events[j-1][2]).slice(0, 80) : '(start)';
        const nextData = j < events.length - 1 ? String(events[j+1][2]).slice(0, 80) : '(end)';
        console.log(`\nClear event #${clearExamples} at index ${j} (t=${ts.toFixed(1)}s):`);
        console.log(`  prev: ${JSON.stringify(prevData)}`);

        // Show the escape sequences in this event
        const escapes = str.match(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g) || [];
        const uniqueEsc = [...new Set(escapes.map(e => e.replace(/\x1b/g, 'ESC')))];
        console.log(`  this: ${uniqueEsc.join(', ')} (${str.length} bytes)`);
        console.log(`  next: ${JSON.stringify(nextData)}`);
      }
    }
  }

  console.log('\n=== Escape Sequence Summary ===');
  console.log(`  Alt screen enter (1049h): ${altScreenEnter}`);
  console.log(`  Alt screen exit (1049l):  ${altScreenExit}`);
  console.log(`  Clear screen (2J):        ${clearScreen2J}`);
  console.log(`  Clear scrollback (3J):    ${clearScrollback3J}`);
  console.log(`  Cursor home (H):          ${cursorHome}`);

  // Check for the actual redraw pattern: \x1b[H\x1b[2J or similar
  let fullRedrawPattern = 0;
  let homeAndRedraw = 0;
  for (const [, eventType, data] of events) {
    if (eventType !== 'o') continue;
    const str = String(data);
    if (str.includes('\x1b[H\x1b[2J') || str.includes('\x1b[2J\x1b[H')) fullRedrawPattern++;
    if (str.includes('\x1b[H') && str.includes('\x1b[2J')) homeAndRedraw++;
  }
  console.log(`  Home+Clear combos:        ${homeAndRedraw}`);
  console.log(`  Full redraw (H+2J adj):   ${fullRedrawPattern}`);

  // Look at the Claude Code header pattern to understand redraws
  // Find events that contain the Claude Code header text
  let headerEvents = 0;
  for (let j = 0; j < events.length; j++) {
    const [, eventType, data] = events[j];
    if (eventType !== 'o') continue;
    const str = String(data);
    if (str.includes('Claude Code v')) {
      headerEvents++;
      if (headerEvents <= 3) {
        console.log(`\nHeader event #${headerEvents} at index ${j}:`);
        console.log(`  ${JSON.stringify(str.slice(0, 200))}`);
      }
    }
  }
  console.log(`\nTotal events with "Claude Code v": ${headerEvents}`);
}

main().catch(console.error);

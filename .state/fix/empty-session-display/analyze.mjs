import { readFileSync } from 'fs';

const lines = readFileSync('fixtures/failing-session.cast', 'utf8').split('\n').filter(l => l.trim());
const header = JSON.parse(lines[0]);
const events = lines.slice(1).filter(l => l.startsWith('[')).map(l => JSON.parse(l));

console.log('=== HEADER ===');
console.log('command:', header.command);
console.log('title:', header.title);
console.log('cols:', header.term?.cols, 'rows:', header.term?.rows);

console.log('\n=== EVENT STATS ===');
console.log('Total events:', events.length);

// Timing analysis - note: asciicast v3 uses absolute timestamps
const timestamps = events.map(e => e[0]);
const gaps = [];
for (let i = 1; i < timestamps.length; i++) {
  gaps.push(timestamps[i] - timestamps[i-1]);
}
gaps.sort((a,b) => a - b);
console.log('Median gap:', gaps[Math.floor(gaps.length/2)]?.toFixed(4));
console.log('Min gap:', gaps[0]?.toFixed(6));
console.log('Max gap:', gaps[gaps.length-1]?.toFixed(4));
console.log('Gaps > 5s:', gaps.filter(g => g > 5).length);
console.log('Gaps > 3s:', gaps.filter(g => g > 3).length);
console.log('Gaps > 2s:', gaps.filter(g => g > 2).length);
console.log('Gaps > 1s:', gaps.filter(g => g > 1).length);
console.log('Gaps > 0.5s:', gaps.filter(g => g > 0.5).length);

// Check timing reliability the same way the detector does
const eventGaps = events.map(e => e[0]).filter(g => g > 0);
eventGaps.sort((a,b) => a - b);
const medianEventTimestamp = eventGaps.length % 2 === 0
  ? (eventGaps[eventGaps.length/2 - 1] + eventGaps[eventGaps.length/2]) / 2
  : eventGaps[Math.floor(eventGaps.length/2)];
console.log('\nMedian event[0] value (what detector checks):', medianEventTimestamp?.toFixed(6));
console.log('Timing would be reliable?', medianEventTimestamp >= 0.1 ? 'YES' : 'NO');

// Event types
const types = {};
events.forEach(e => { types[e[1]] = (types[e[1]] || 0) + 1; });
console.log('\nEvent types:', JSON.stringify(types));

// Escape sequence analysis
let screenClears = 0, altIn = 0, altOut = 0, eraseJ = 0;
let promptDetect = 0, newlines = 0, carriageReturn = 0;
events.forEach(e => {
  if (e[1] === 'o' && typeof e[2] === 'string') {
    const d = e[2];
    if (d.includes('\x1b[2J')) screenClears++;
    if (d.includes('\x1b[?1049h')) altIn++;
    if (d.includes('\x1b[?1049l')) altOut++;
    if (d.includes('\x1b[J')) eraseJ++;
    if (d.includes('$') || d.includes('❯') || d.includes('➜')) promptDetect++;
    if (d.includes('\n')) newlines++;
    if (d.includes('\r')) carriageReturn++;
  }
});
console.log('\n=== ESCAPE SEQUENCES ===');
console.log('Screen clears (2J):', screenClears);
console.log('Alt screen enter:', altIn);
console.log('Alt screen exit:', altOut);
console.log('Erase in display (J):', eraseJ);
console.log('Prompt-like chars:', promptDetect);
console.log('Events with newlines:', newlines);
console.log('Events with CR:', carriageReturn);

// Show where the big gaps are
console.log('\n=== LARGE GAPS (>1s) with position ===');
for (let i = 1; i < events.length; i++) {
  const gap = events[i][0] - events[i-1][0];
  if (gap > 1) {
    const data = typeof events[i][2] === 'string' ? events[i][2].substring(0, 80) : '';
    console.log(`  Event ${i}: gap=${gap.toFixed(2)}s data=${JSON.stringify(data).substring(0, 60)}`);
  }
}

// Show output volume per ~100-event window
console.log('\n=== OUTPUT VOLUME (per 100 events) ===');
for (let i = 0; i < events.length; i += 100) {
  const window = events.slice(i, i + 100);
  const totalVol = window.reduce((sum, e) => sum + (typeof e[2] === 'string' ? e[2].length : 0), 0);
  const avgVol = totalVol / window.length;
  console.log(`  Events ${i}-${Math.min(i+99, events.length-1)}: total=${totalVol}, avg=${avgVol.toFixed(1)}`);
}

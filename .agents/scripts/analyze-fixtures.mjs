/**
 * Fixture analysis script for ADR research.
 * Analyzes all .cast files in fixtures/ for escape sequence signals and timing.
 * Outputs JSON to stdout for the calling agent to process.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = join(import.meta.dirname, '../../fixtures');

const FILES = [
  'sample.cast',
  'failing-session.cast',
  'codex-small.cast',
  'codex-medium.cast',
  'gemini-small.cast',
  'gemini-medium.cast',
  'claude-small.cast',
  'claude-medium.cast',
];

function analyze(filename) {
  const filepath = join(FIXTURES_DIR, filename);
  const raw = readFileSync(filepath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());

  // First line is always the header
  let header = {};
  try { header = JSON.parse(lines[0]); } catch { header = { error: 'unparseable' }; }

  // Remaining lines are events
  const events = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      events.push(parsed);
    } catch { /* skip malformed */ }
  }

  const totalEvents = events.length;

  // Escape sequence counts (scan output events only)
  let esc2J = 0;    // \x1b[2J full screen clear
  let esc3J = 0;    // \x1b[3J scrollback clear
  let escJ = 0;     // \x1b[J or \x1b[0J erase to end
  let altEnter = 0; // \x1b[?1049h
  let altExit = 0;  // \x1b[?1049l
  let cursorHome = 0; // \x1b[H or \x1b[1;1H
  let reverseIndex = 0; // \x1bM
  let scrollUp = 0; // \x1b[nS (scroll up)
  let scrollRegion = 0; // \x1b[n;mr (set scroll region)

  for (const event of events) {
    const type = event[1];
    const data = event[2];
    if (type !== 'o' || typeof data !== 'string') continue;

    // Count \x1b[2J (but not \x1b[3J which also contains [J)
    const full2J = (data.match(/\x1b\[2J/g) || []).length;
    esc2J += full2J;

    // Count \x1b[3J
    const full3J = (data.match(/\x1b\[3J/g) || []).length;
    esc3J += full3J;

    // Count \x1b[J or \x1b[0J (erase to end) — exclude \x1b[2J and \x1b[3J
    // Match \x1b[J or \x1b[0J but NOT \x1b[2J or \x1b[3J
    const allJ = (data.match(/\x1b\[\d*J/g) || []);
    for (const m of allJ) {
      if (m === '\x1b[J' || m === '\x1b[0J') escJ++;
    }

    altEnter += (data.match(/\x1b\[\?1049h/g) || []).length;
    altExit += (data.match(/\x1b\[\?1049l/g) || []).length;

    // Cursor home: \x1b[H or \x1b[1;1H
    cursorHome += (data.match(/\x1b\[H/g) || []).length;
    cursorHome += (data.match(/\x1b\[1;1H/g) || []).length;

    reverseIndex += (data.match(/\x1bM/g) || []).length;
    scrollUp += (data.match(/\x1b\[\d+S/g) || []).length;
    scrollRegion += (data.match(/\x1b\[\d+;\d+r/g) || []).length;
  }

  // Timing statistics
  const gaps = events.map(e => e[0]).filter(g => typeof g === 'number');
  const positiveGaps = gaps.filter(g => g > 0);
  const sortedGaps = [...positiveGaps].sort((a, b) => a - b);

  let medianGap = 0;
  if (sortedGaps.length > 0) {
    const mid = Math.floor(sortedGaps.length / 2);
    medianGap = sortedGaps.length % 2 === 0
      ? (sortedGaps[mid - 1] + sortedGaps[mid]) / 2
      : sortedGaps[mid];
  }
  const maxGap = sortedGaps.length > 0 ? sortedGaps[sortedGaps.length - 1] : 0;
  const gapsOver1s = positiveGaps.filter(g => g > 1).length;
  const pctOver1s = positiveGaps.length > 0
    ? ((gapsOver1s / positiveGaps.length) * 100).toFixed(1)
    : '0.0';

  // Timing reliability check (same as SectionDetector)
  const timingReliable = medianGap >= 0.1;

  // Run SectionDetector logic inline (simplified — mirrors the class)
  // We only need the count, so replicate the key logic
  let detectedSections = 0;

  if (totalEvents >= 100) {
    const candidates = [];

    // Signal 1: timing gaps (only if reliable)
    if (timingReliable) {
      for (let i = 0; i < events.length; i++) {
        const gap = events[i][0];
        if (gap > 5) {
          candidates.push({ eventIndex: i, score: gap / 5, signals: ['timing_gap'] });
        }
      }
    }

    // Signal 2: screen clears (\x1b[2J)
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e[1] === 'o' && typeof e[2] === 'string' && e[2].includes('\x1b[2J')) {
        candidates.push({ eventIndex: i, score: 1, signals: ['screen_clear'] });
      }
    }

    // Signal 3: alt screen exits
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e[1] === 'o' && typeof e[2] === 'string' && e[2].includes('\x1b[?1049l')) {
        candidates.push({ eventIndex: i, score: 0.8, signals: ['alt_screen_exit'] });
      }
    }

    // Signal 4: volume bursts (only if reliable)
    if (timingReliable) {
      const volumes = events.map(e => typeof e[2] === 'string' ? e[2].length : 0);
      for (let i = 10; i < events.length; i++) {
        const precedingAvg = volumes.slice(i - 10, i).reduce((s, v) => s + v, 0) / 10;
        const currentVolume = volumes[i] || 0;
        if (precedingAvg > 0 && currentVolume > precedingAvg * 5) {
          const gap = events[i][0];
          if (gap > 1) {
            candidates.push({ eventIndex: i, score: 0.3, signals: ['volume_burst'] });
          }
        }
      }
    }

    // Merge within 50 events
    candidates.sort((a, b) => a.eventIndex - b.eventIndex);
    const merged = [];
    if (candidates.length > 0) {
      let current = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const next = candidates[i];
        if (next.eventIndex - current.eventIndex <= 50) {
          if (next.score > current.score) {
            current = { eventIndex: next.eventIndex, score: next.score, signals: [...new Set([...current.signals, ...next.signals])] };
          } else {
            current = { ...current, signals: [...new Set([...current.signals, ...next.signals])] };
          }
        } else {
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);
    }

    // Filter by min section size (100 events)
    const filtered = merged.filter((b, i) => {
      if (i === 0 && b.eventIndex < 100) return false;
      if (i === merged.length - 1 && totalEvents - b.eventIndex < 100) return false;
      return true;
    });

    // Cap at 50
    detectedSections = Math.min(filtered.length, 50);
  }

  // Hypothetical: what if we added \x1b[J detection?
  let hypotheticalWithEscJ = 0;
  if (totalEvents >= 100) {
    const candidates = [];

    if (timingReliable) {
      for (let i = 0; i < events.length; i++) {
        const gap = events[i][0];
        if (gap > 5) {
          candidates.push({ eventIndex: i, score: gap / 5, signals: ['timing_gap'] });
        }
      }
    }

    // Existing: \x1b[2J
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e[1] === 'o' && typeof e[2] === 'string' && e[2].includes('\x1b[2J')) {
        candidates.push({ eventIndex: i, score: 1, signals: ['screen_clear'] });
      }
    }

    // NEW: \x1b[J / \x1b[0J (erase to end, not \x1b[2J or \x1b[3J)
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e[1] === 'o' && typeof e[2] === 'string') {
        const matches = e[2].match(/\x1b\[\d*J/g) || [];
        for (const m of matches) {
          if (m === '\x1b[J' || m === '\x1b[0J') {
            candidates.push({ eventIndex: i, score: 0.8, signals: ['erase_to_end'] });
            break; // one per event
          }
        }
      }
    }

    // Alt screen exits
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e[1] === 'o' && typeof e[2] === 'string' && e[2].includes('\x1b[?1049l')) {
        candidates.push({ eventIndex: i, score: 0.8, signals: ['alt_screen_exit'] });
      }
    }

    if (timingReliable) {
      const volumes = events.map(e => typeof e[2] === 'string' ? e[2].length : 0);
      for (let i = 10; i < events.length; i++) {
        const precedingAvg = volumes.slice(i - 10, i).reduce((s, v) => s + v, 0) / 10;
        const currentVolume = volumes[i] || 0;
        if (precedingAvg > 0 && currentVolume > precedingAvg * 5) {
          const gap = events[i][0];
          if (gap > 1) {
            candidates.push({ eventIndex: i, score: 0.3, signals: ['volume_burst'] });
          }
        }
      }
    }

    candidates.sort((a, b) => a.eventIndex - b.eventIndex);
    const merged = [];
    if (candidates.length > 0) {
      let current = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const next = candidates[i];
        if (next.eventIndex - current.eventIndex <= 50) {
          if (next.score > current.score) {
            current = { eventIndex: next.eventIndex, score: next.score, signals: [...new Set([...current.signals, ...next.signals])] };
          } else {
            current = { ...current, signals: [...new Set([...current.signals, ...next.signals])] };
          }
        } else {
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);
    }

    const filtered = merged.filter((b, i) => {
      if (i === 0 && b.eventIndex < 100) return false;
      if (i === merged.length - 1 && totalEvents - b.eventIndex < 100) return false;
      return true;
    });

    hypotheticalWithEscJ = Math.min(filtered.length, 50);
  }

  return {
    filename,
    sizeBytes: raw.length,
    header: {
      version: header.version,
      width: header.width,
      height: header.height,
    },
    totalEvents,
    escapeSequences: {
      'esc_2J': esc2J,
      'esc_3J': esc3J,
      'esc_J_or_0J': escJ,
      'alt_enter_1049h': altEnter,
      'alt_exit_1049l': altExit,
      'cursor_home': cursorHome,
      'reverse_index_M': reverseIndex,
      'scroll_up_nS': scrollUp,
      'scroll_region_nmr': scrollRegion,
    },
    timing: {
      medianGapS: Number(medianGap.toFixed(4)),
      maxGapS: Number(maxGap.toFixed(2)),
      gapsOver1s,
      pctOver1s: Number(pctOver1s),
      timingReliable,
    },
    detection: {
      currentSections: detectedSections,
      withEraseToEnd: hypotheticalWithEscJ,
    },
  };
}

const results = FILES.map(f => analyze(f));
console.log(JSON.stringify(results, null, 2));

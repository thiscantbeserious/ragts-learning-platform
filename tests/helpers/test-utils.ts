/**
 * Shared test utilities for snapshot tests.
 * Provides factory functions for creating deterministic test data.
 */

import type { SnapshotLine, SnapshotSpan, TerminalSnapshot } from '../../packages/vt-wasm/types.js';

/**
 * Create a simple SnapshotLine from plain text.
 */
export function makeLine(text: string, attrs?: Partial<SnapshotSpan>): SnapshotLine {
  return {
    spans: [{ text, ...attrs }],
  };
}

/**
 * Create a SnapshotLine with multiple styled spans.
 */
export function makeStyledLine(...spans: Array<{ text: string } & Partial<SnapshotSpan>>): SnapshotLine {
  return { spans };
}

/**
 * Create a TerminalSnapshot from an array of text strings.
 * Each string becomes a single-span line.
 */
export function makeSnapshot(
  lines: string[],
  cols = 80,
  rows = 24
): TerminalSnapshot {
  return {
    cols,
    rows,
    lines: lines.map((text) => makeLine(text)),
  };
}

/**
 * Convert a TerminalSnapshot to an array of plain text strings.
 * Useful for readable snapshot assertions.
 */
export function snapshotToText(snapshot: TerminalSnapshot): string[] {
  return snapshot.lines.map((line) =>
    line.spans.map((span) => span.text ?? '').join('')
  );
}

/**
 * Create a minimal .cast file content string (NDJSON format).
 * Generates output events with relative timestamps.
 */
export function createCastContent(
  outputs: string[],
  options?: {
    cols?: number;
    rows?: number;
    markers?: Array<{ time: number; label: string }>;
  }
): string {
  const cols = options?.cols ?? 80;
  const rows = options?.rows ?? 24;
  const header = JSON.stringify({
    version: 3,
    term: { cols, rows, type: 'xterm-256color' },
  });

  const lines = [header];
  let time = 0.1;

  for (const output of outputs) {
    lines.push(JSON.stringify([time, 'o', output]));
    time += 0.1;
  }

  if (options?.markers) {
    for (const marker of options.markers) {
      lines.push(JSON.stringify([marker.time, 'm', marker.label]));
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Create a .cast file content with clear-screen epochs.
 * Simulates TUI redraw cycles that exercise dedup.
 *
 * Each epoch starts with a clear-screen (\x1b[2J\x1b[3J),
 * re-renders some previous content, then adds new content.
 */
export function createCastContentWithEpochs(
  epochs: Array<{ rerender: string[]; newContent: string[] }>,
  options?: { cols?: number; rows?: number }
): string {
  const cols = options?.cols ?? 80;
  const rows = options?.rows ?? 24;
  const header = JSON.stringify({
    version: 3,
    term: { cols, rows, type: 'xterm-256color' },
  });

  const lines = [header];
  let time = 0.1;

  for (let epochIdx = 0; epochIdx < epochs.length; epochIdx++) {
    const epoch = epochs[epochIdx];

    // First epoch doesn't need a clear-screen
    if (epochIdx > 0) {
      lines.push(JSON.stringify([time, 'o', '\x1b[2J\x1b[3J\x1b[H']));
      time += 0.05;
    }

    // Re-render previous content
    for (const content of epoch.rerender) {
      lines.push(JSON.stringify([time, 'o', content + '\r\n']));
      time += 0.02;
    }

    // New content for this epoch
    for (const content of epoch.newContent) {
      lines.push(JSON.stringify([time, 'o', content + '\r\n']));
      time += 0.02;
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Synthetic asciicast v3 generator for stress testing the pipeline.
 *
 * Generates in-memory NDJSON content that simulates realistic terminal output
 * with clear-screen section boundaries and optional resize events.
 */

export interface SyntheticCastOptions {
  /** Number of sections (clear-screen events). Default: 200 */
  sections?: number;
  /** Approximate target size in MB. Default: 50 */
  targetSizeMB?: number;
  /** Terminal width. Default: 120 */
  cols?: number;
  /** Terminal rows. Default: 40 */
  rows?: number;
  /** Include resize events to test reflow. Default: true */
  includeResizes?: boolean;
  /** Emit resize events every N sections. Default: 20 */
  resizeInterval?: number;
}

/** Build a single section of terminal output lines to fill the target byte count. */
function buildSectionLines(sectionIndex: number, cols: number, targetBytes: number): string[] {
  const lines: string[] = [];
  let sectionBytes = 0;
  let lineNum = 0;

  while (sectionBytes < targetBytes) {
    const isLongLine = lineNum % 5 === 0;
    const lineLength = isLongLine ? cols - 5 : 20 + Math.floor(Math.random() * 40);
    const text = `[section ${sectionIndex}] line ${lineNum}: ${'x'.repeat(lineLength)}\r\n`;
    const event = JSON.stringify([0.001, 'o', text]);
    lines.push(event);
    sectionBytes += event.length;
    lineNum++;
  }

  return lines;
}

/**
 * Generates a synthetic asciicast v3 NDJSON buffer for pipeline stress testing.
 * Uses clear-screen events (\x1b[2J) as section boundaries and optionally emits
 * resize events to exercise terminal reflow code paths.
 */
export function generateLargeCast(options: SyntheticCastOptions = {}): Buffer {
  const sections = options.sections ?? 200;
  const targetSizeMB = options.targetSizeMB ?? 50;
  const cols = options.cols ?? 120;
  const rows = options.rows ?? 40;
  const includeResizes = options.includeResizes ?? true;
  const resizeInterval = options.resizeInterval ?? 20;

  const targetBytes = targetSizeMB * 1024 * 1024;
  const bytesPerSection = Math.floor(targetBytes / sections);

  const lines: string[] = [];
  lines.push(JSON.stringify({ version: 3, term: { cols, rows }, timestamp: Math.floor(Date.now() / 1000) }));

  for (let s = 0; s < sections; s++) {
    if (includeResizes && s > 0 && s % resizeInterval === 0) {
      const newCols = cols + (s % 2 === 0 ? -20 : 20);
      lines.push(JSON.stringify([0.001, 'r', `${newCols}x${rows}`]));
    }

    if (s > 0) {
      const clearDelay = 2.0 + Math.random() * 3;
      lines.push(JSON.stringify([parseFloat(clearDelay.toFixed(3)), 'o', '\x1b[2J']));
    }

    const sectionLines = buildSectionLines(s, cols, bytesPerSection);
    for (const line of sectionLines) {
      lines.push(line);
    }
  }

  return Buffer.from(lines.join('\n'));
}

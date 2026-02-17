/**
 * TypeScript types for vt-wasm terminal snapshot data model.
 * Maps to avt's Cell/Pen types with structured span representation.
 */

/**
 * A complete terminal buffer snapshot (viewport only).
 * Represents the visible terminal grid at a point in time.
 */
export interface TerminalSnapshot {
  cols: number;
  rows: number;
  lines: SnapshotLine[];
}

/**
 * A single line in the terminal snapshot.
 */
export interface SnapshotLine {
  spans: SnapshotSpan[];
  // Note: Line.wrapped is pub(crate) in avt, not accessible from WASM.
  // Wrapped line merging can be done heuristically if needed later.
}

/**
 * A span of text with uniform styling.
 * Consecutive cells with identical pens are merged into spans.
 */
export interface SnapshotSpan {
  text: string;
  fg?: string | number; // undefined=default, number=palette(0-255), string="#RRGGBB"
  bg?: string | number; // undefined=default, number=palette(0-255), string="#RRGGBB"
  bold?: boolean;       // mapped from Pen.intensity (Bold)
  faint?: boolean;      // mapped from Pen.intensity (Faint)
  italic?: boolean;     // from Pen.attrs bit 0 (avt layout)
  underline?: boolean;  // from Pen.attrs bit 1 (avt layout)
  strikethrough?: boolean; // from Pen.attrs bit 2 (avt layout)
  blink?: boolean;      // from Pen.attrs bit 3 (avt layout)
  inverse?: boolean;    // from Pen.attrs bit 4 (avt layout)
}

/**
 * Cursor position within the terminal viewport.
 */
export interface CursorPosition {
  col: number; // 0-indexed column
  row: number; // 0-indexed row
}

/**
 * Terminal size in columns and rows.
 */
export interface TerminalSize {
  cols: number;
  rows: number;
}

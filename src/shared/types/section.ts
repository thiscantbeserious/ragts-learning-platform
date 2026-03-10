/**
 * API section response shape — shared between server and client.
 *
 * Represents a processed session section as returned by the session route handler.
 * Supports hybrid rendering: CLI sections use startLine/endLine ranges against
 * the session-level snapshot; TUI sections carry a per-section viewport snapshot.
 */

import type { TerminalSnapshot } from '#vt-wasm/types';

export interface Section {
  id: string;
  type: 'marker' | 'detected';
  label: string;
  startEvent: number;
  endEvent: number;
  /** CLI sections — index into session snapshot. Null for TUI sections. */
  startLine: number | null;
  /** CLI sections — index into session snapshot. Null for TUI sections. */
  endLine: number | null;
  /** TUI sections — per-section viewport snapshot. Null for CLI sections. */
  snapshot: TerminalSnapshot | null;
}

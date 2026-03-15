/**
 * API section response shape — shared between server and client.
 *
 * Represents a processed session section as returned by the session route handler.
 * Supports hybrid rendering: CLI sections use startLine/endLine ranges against
 * the session-level snapshot; TUI sections carry a per-section viewport snapshot.
 */

import type { tags } from 'typia';
import type { TerminalSnapshot } from '#vt-wasm/types';

export interface Section {
  /** Non-empty unique section identifier. */
  id: string & tags.MinLength<1>;
  type: 'marker' | 'detected';
  /** Non-empty human-readable label for the section. */
  label: string & tags.MinLength<1>;
  /** Index of the first event in this section — 0 or greater. */
  startEvent: number & tags.Type<'uint32'> & tags.Minimum<0>;
  /** Index of the last event in this section — 0 or greater. */
  endEvent: number & tags.Type<'uint32'> & tags.Minimum<0>;
  /** CLI sections — index into session snapshot. Null for TUI sections. */
  startLine: (number & tags.Type<'uint32'> & tags.Minimum<0>) | null;
  /** CLI sections — index into session snapshot. Null for TUI sections. */
  endLine: (number & tags.Type<'uint32'> & tags.Minimum<0>) | null;
  /** TUI sections — per-section viewport snapshot. Null for CLI sections. */
  snapshot: TerminalSnapshot | null;
}

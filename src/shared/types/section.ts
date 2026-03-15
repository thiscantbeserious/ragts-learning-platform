/**
 * API section response shape — shared between server and client.
 *
 * Represents a processed session section as returned by the session route handler.
 * Supports hybrid rendering: CLI sections use startLine/endLine ranges against
 * the session-level snapshot; TUI sections carry a per-section viewport snapshot.
 */

import type { tags } from 'typia';
import type { TerminalSnapshot } from '#vt-wasm/types';

/** Non-negative uint32. */
type UInt32 = number & tags.Type<'uint32'> & tags.Minimum<0>;

/** Non-empty string. */
type NonEmptyString = string & tags.MinLength<1>;

export interface Section {
  /** Non-empty unique section identifier. */
  id: NonEmptyString;
  type: 'marker' | 'detected';
  /** Non-empty human-readable label for the section. */
  label: NonEmptyString;
  /** Index of the first event in this section — 0 or greater. */
  startEvent: UInt32;
  /** Index of the last event in this section — 0 or greater. */
  endEvent: UInt32;
  /** CLI sections — index into session snapshot. Null for TUI sections. */
  startLine: UInt32 | null;
  /** CLI sections — index into session snapshot. Null for TUI sections. */
  endLine: UInt32 | null;
  /** TUI sections — per-section viewport snapshot. Null for CLI sections. */
  snapshot: TerminalSnapshot | null;
}

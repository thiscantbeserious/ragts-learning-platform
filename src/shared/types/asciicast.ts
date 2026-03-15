/**
 * Type definitions for asciicast v3 format.
 *
 * asciicast v3 uses NDJSON: first line is header, subsequent lines are event arrays.
 * Event timestamps are relative (delta from previous) - must compute cumulative for display.
 */

import type { tags } from 'typia';

/** Exact version 3 (only supported version). */
type Version3 = number & tags.Type<'uint32'> & tags.Minimum<3> & tags.Maximum<3>;

/** Positive uint32 (at least 1). */
type PositiveUInt32 = number & tags.Type<'uint32'> & tags.Minimum<1>;

/** Non-negative uint32 (0 or more). */
type UInt32 = number & tags.Type<'uint32'> & tags.Minimum<0>;

/** Non-empty string. */
type NonEmptyString = string & tags.MinLength<1>;

/**
 * asciicast v3 header. First line of .cast file.
 *
 * Official v3 uses `term.cols`/`term.rows` (nested). For backward compat,
 * `width`/`height` are normalized from `term.cols`/`term.rows` at parse time
 * so all downstream consumers can use `header.width`/`header.height`.
 */
export interface AsciicastHeader {
  /** asciicast format version — only version 3 is supported by the parser. */
  version: Version3;
  /** Terminal width in columns — must be at least 1. Normalized from term.cols for v3. */
  width: PositiveUInt32;
  /** Terminal height in rows — must be at least 1. Normalized from term.rows for v3. */
  height: PositiveUInt32;
  term?: {
    /** Terminal width in columns — must be at least 1. */
    cols: PositiveUInt32;
    /** Terminal height in rows — must be at least 1. */
    rows: PositiveUInt32;
    type?: string;
    version?: string;
    theme?: { fg?: string; bg?: string; palette?: string };
  };
  /** Unix timestamp of recording start. */
  timestamp?: number;
  idle_time_limit?: number;
  command?: string;
  env?: Record<string, string>;
  title?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * asciicast v3 event. Array format: [time, "type", "data"]
 * - time: relative to previous event (seconds, float)
 * - type: "o" (output), "i" (input), "m" (marker), "r" (resize), "x" (exit)
 * - data: string for o/i/m/r (resize is "COLSxROWS"), number for x (exit code)
 */
export type AsciicastEvent =
  | [number, "o", string]  // output
  | [number, "i", string]  // input
  | [number, "m", string]  // marker
  | [number, "r", string]  // resize "COLSxROWS"
  | [number, "x", number]; // exit code

/**
 * Parsed event with cumulative timestamp.
 */
export interface ParsedEvent {
  time: number;           // cumulative timestamp (seconds from start)
  relativeTime: number;   // original delta
  type: string;
  data: string | number;
}

/**
 * Marker extracted from events (type "m").
 */
export interface Marker {
  /** Cumulative timestamp in seconds from recording start — 0 or greater. */
  time: number & tags.Minimum<0>;
  /** Non-empty marker text label. */
  label: NonEmptyString;
  /** Event index in the events array — 0 or greater. */
  index: UInt32;
}

/**
 * Complete parsed asciicast file.
 */
export interface AsciicastFile {
  header: AsciicastHeader;
  events: ParsedEvent[];
  markers: Marker[];
}

/**
 * Validation result for asciicast parsing.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  line?: number;  // line number where error occurred
}

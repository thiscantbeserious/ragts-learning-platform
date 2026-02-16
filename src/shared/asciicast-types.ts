/**
 * Type definitions for asciicast v3 format.
 *
 * asciicast v3 uses NDJSON: first line is header, subsequent lines are event arrays.
 * Event timestamps are relative (delta from previous) - must compute cumulative for display.
 */

/**
 * asciicast v3 header. First line of .cast file.
 */
export interface AsciicastHeader {
  version: number;
  width: number;
  height: number;
  timestamp?: number;
  env?: Record<string, string>;
  title?: string;
  [key: string]: unknown;
}

/**
 * asciicast v3 event. Array format: [time, "type", "data"]
 * - time: relative to previous event (seconds, float)
 * - type: "o" (output), "i" (input), "m" (marker), "r" (resize), "x" (exit)
 * - data: string for o/i/m, array for r [width, height], number for x (exit code)
 */
export type AsciicastEvent =
  | [number, "o", string]  // output
  | [number, "i", string]  // input
  | [number, "m", string]  // marker
  | [number, "r", [number, number]]  // resize [width, height]
  | [number, "x", number]; // exit code

/**
 * Parsed event with cumulative timestamp.
 */
export interface ParsedEvent {
  time: number;           // cumulative timestamp (seconds from start)
  relativeTime: number;   // original delta
  type: string;
  data: string | [number, number] | number;
}

/**
 * Marker extracted from events (type "m").
 */
export interface Marker {
  time: number;     // cumulative timestamp
  label: string;    // marker text
  index: number;    // event index in events array
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

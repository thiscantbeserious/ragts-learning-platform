/**
 * Server-side processing pipeline for asciicast v3 sessions.
 *
 * This module provides streaming-based processing of .cast files:
 * - NdjsonStream: Low-level streaming NDJSON parser
 * - SessionProcessor: High-level pipeline with VT integration and snapshot capture
 * - SectionDetector: Section boundary detection for sessions
 *
 * Usage:
 * ```typescript
 * import { processSession } from './processing/index.js';
 *
 * const result = await processSession('/path/to/session.cast', [10, 20, 30]);
 * // result.snapshots contains terminal snapshots at events 10, 20, 30
 * ```
 */

export { NdjsonStream, type NdjsonItem } from './ndjson-stream.js';
export { processSession, type ProcessingResult } from './session-processor.js';
export { SectionDetector, type SectionBoundary } from './section-detector.js';

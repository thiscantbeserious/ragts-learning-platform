/**
 * Server-side processing pipeline for asciicast v3 sessions.
 *
 * This module provides streaming-based processing of .cast files:
 * - NdjsonStream: Low-level streaming NDJSON parser
 * - SectionDetector: Section boundary detection for sessions
 * - processSessionPipeline: Full session processing pipeline with VT integration,
 *   snapshot capture, section detection, and database persistence
 */

export { NdjsonStream, type NdjsonItem } from './ndjson-stream.js';
export { SectionDetector, type SectionBoundary } from './section-detector.js';
export { processSessionPipeline } from './session-pipeline.js';
export { runPipeline, waitForPipelines } from './pipeline-tracker.js';
export type { ProcessedSession } from './types.js';

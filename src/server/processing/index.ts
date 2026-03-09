/**
 * Server-side processing pipeline for asciicast v3 sessions.
 *
 * This module provides streaming-based processing of .cast files:
 * - NdjsonStream: Low-level streaming NDJSON parser
 * - SectionDetector: Section boundary detection for sessions
 *
 * Stage 3 (job queue + event bus): processing is now driven by PipelineOrchestrator.
 * The processSessionPipeline / runPipeline exports are kept for backward compatibility
 * (existing tests) but are no longer called from production routes.
 *
 * @deprecated processSessionPipeline — use PipelineOrchestrator instead.
 * @deprecated runPipeline / waitForPipelines — replaced by orchestrator concurrency control.
 */

export { NdjsonStream, type NdjsonItem } from './ndjson_stream.js';
export { SectionDetector, type SectionBoundary } from './section_detector.js';
export { processSessionPipeline } from './session_pipeline.js';
export { runPipeline, waitForPipelines } from './pipeline_tracker.js';
export type { ProcessedSession } from './types.js';

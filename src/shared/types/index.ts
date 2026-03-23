/**
 * Barrel re-exports for all shared type definitions.
 * Organized by domain: session, pipeline, asciicast, errors.
 */

export type { Session, SessionCreate } from './session.js';

export type {
  DetectionStatus,
  PipelineEvent,
  PipelineEventType,
  PipelineEventPayload,
} from './pipeline.js';
export { PipelineStage, ALL_PIPELINE_EVENT_TYPES } from './pipeline.js';

export type {
  AsciicastHeader,
  AsciicastEvent,
  ParsedEvent,
  Marker,
  AsciicastFile,
  ValidationResult,
} from './asciicast.js';

export { ServiceError } from './errors.js';
export type { ServiceErrorCode } from './errors.js';

export type { Section } from './section.js';

export type {
  SessionDetailResponse,
  SessionStatusResponse,
  SectionMetadata,
  SectionContentPage,
  BulkSectionContentResponse,
  SessionMetadataResponse,
} from './api.js';

export type {
  PipelineSession,
  PipelineStatusSnapshot,
  PipelineStatusEvent,
} from './pipeline_status.js';

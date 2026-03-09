/**
 * Stage registry: exports all pipeline stage functions and their result types.
 *
 * Import from here in the orchestrator to keep dependency management central.
 */

export { validate } from './validate.js';
export type { ValidateResult } from './validate.js';

export { detect } from './detect.js';
export type { DetectResult } from './detect.js';

export { replay } from './replay.js';
export type { ReplayResult } from './replay.js';

export { dedup } from './dedup.js';

export { store } from './store.js';

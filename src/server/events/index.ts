/**
 * Event bus module exports.
 * Consumers should depend on the EventBus interface, not the concrete implementation.
 */

export type { EventBus, EventHandler, AnyEventHandler } from './event_bus.js';
export { EmitterEventBus } from './emitter_event_bus.js';

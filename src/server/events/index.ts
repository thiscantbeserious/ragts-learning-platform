/**
 * Event bus and event log module exports.
 * Consumers should depend on the EventBusAdapter and EventLogAdapter interfaces, not concrete implementations.
 */

export type { EventBusAdapter, EventHandler, AnyEventHandler } from './event_bus_adapter.js';
export { EmitterEventBusImpl } from './emitter_event_bus_impl.js';
export type { EventLogAdapter, EventLogEntry } from './event_log_adapter.js';
export { SqliteEventLogImpl } from './sqlite_event_log_impl.js';

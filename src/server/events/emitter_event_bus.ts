/**
 * In-process EventBus implementation backed by Node.js EventEmitter.
 *
 * Suitable for single-process deployments. Max listeners is raised to 100
 * to support many concurrent SSE connections without triggering Node.js
 * memory leak warnings (default limit is 10).
 *
 * Connections: used by the pipeline orchestrator and SSE route handlers.
 */

import { EventEmitter } from 'node:events';
import type { EventBus, EventHandler, AnyEventHandler } from './event_bus.js';
import type { PipelineEvent, PipelineEventType } from '../../shared/pipeline_events.js';

const MAX_LISTENERS = 100;

export class EmitterEventBus implements EventBus {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(MAX_LISTENERS);
  }

  emit(event: PipelineEvent): void {
    this.emitter.emit(event.type, event);
  }

  on<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void {
    this.emitter.on(type, handler as AnyEventHandler);
  }

  off<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void {
    this.emitter.off(type, handler as AnyEventHandler);
  }

  once<T extends PipelineEventType>(type: T, handler: EventHandler<T>): void {
    this.emitter.once(type, handler as AnyEventHandler);
  }
}

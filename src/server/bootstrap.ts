/**
 * Server bootstrap module.
 *
 * Handles DB init, migrations, orchestrator startup, service instantiation,
 * and event log subscription. Returns the dependencies needed by createApp().
 * Signal handlers are intentionally NOT registered here — they belong in the
 * production entry point (start.ts) so dev.ts can skip them.
 */

import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { DatabaseFactory } from './db/database_factory.js';
import { EmitterEventBusImpl } from './events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from './processing/pipeline_orchestrator.js';
import type { PipelineEvent } from '../shared/types/pipeline.js';
import { eventLogIds } from './event_log_ids.js';
import { ALL_PIPELINE_EVENT_TYPES } from './services/index.js';
import type { AppDeps } from './app.js';

const log = logger.child({ module: 'bootstrap' });

/**
 * Full initialized runtime returned by init().
 * Extends AppDeps with the orchestrator and close function for signal handlers.
 */
export interface ServerRuntime extends AppDeps {
  orchestrator: PipelineOrchestrator;
  close: () => Promise<void>;
}

/**
 * Initialize the server runtime: DB, migrations, orchestrator, event subscriptions.
 * Returns all dependencies ready to pass into createApp().
 * Caller is responsible for registering signal handlers using orchestrator and close.
 */
export async function init(): Promise<ServerRuntime> {
  const config = loadConfig();

  const factory = new DatabaseFactory();
  const db = await factory.create();
  const { sessionRepository, sectionRepository, storageAdapter, jobQueue, eventLog, ping, close } =
    await db.initialize({ dataDir: config.dataDir });

  const eventBus = new EmitterEventBusImpl();
  const orchestrator = new PipelineOrchestrator(eventBus, jobQueue, {
    sessionRepository,
    storageAdapter,
  });

  // Subscribe event log to every pipeline event type BEFORE start() so recovered
  // jobs that emit events during startup are captured for audit/debugging.
  for (const type of ALL_PIPELINE_EVENT_TYPES) {
    eventBus.on(type, (event) => {
      try {
        const logId = eventLog.logSync(event as PipelineEvent);
        eventLogIds.set(event as object, logId);
      } catch (err) {
        log.warn({ err, eventType: type }, 'Failed to persist event to event log');
      }
    });
  }

  await orchestrator.start();

  return {
    sessionRepository,
    sectionRepository,
    storageAdapter,
    jobQueue,
    eventLog,
    eventBus,
    ping,
    close,
    orchestrator,
    config,
  };
}

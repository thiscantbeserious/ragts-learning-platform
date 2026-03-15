/**
 * Pure Hono app factory.
 *
 * Accepts pre-initialized dependencies and returns a configured Hono app
 * with all routes registered. No side effects, no top-level await,
 * no signal handlers, no @hono/node-server imports.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { pinoLogger } from 'hono-pino';
import type { Config } from './config.js';
import { logger } from './logger.js';
import type { SessionAdapter } from './db/session_adapter.js';
import type { SectionAdapter } from './db/section_adapter.js';
import type { StorageAdapter } from './storage/storage_adapter.js';
import type { JobQueueAdapter } from './jobs/job_queue_adapter.js';
import type { EventLogAdapter } from './events/event_log_adapter.js';
import type { EventBusAdapter } from './events/event_bus_adapter.js';
import {
  UploadService,
  SessionService,
  StatusService,
  RetryService,
  EventLogService,
} from './services/index.js';
import { handleUpload } from './routes/upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
  handleRedetect,
} from './routes/sessions.js';
import { handleSseEvents } from './routes/sse.js';
import { handleGetStatus } from './routes/status.js';
import { handleRetry } from './routes/retry.js';
import { handleGetEventLog } from './routes/events.js';

/** Dependencies the app factory requires — initialized by bootstrap or dev entry. */
export interface AppDeps {
  sessionRepository: SessionAdapter;
  sectionRepository: SectionAdapter;
  storageAdapter: StorageAdapter;
  jobQueue: JobQueueAdapter;
  eventLog: EventLogAdapter;
  eventBus: EventBusAdapter;
  ping: () => Promise<void>;
  config: Config;
}

const log = logger.child({ module: 'server' });

/**
 * Create a configured Hono application with all routes registered.
 * Pure function — every call returns a fresh app instance.
 * Side effects (DB init, signal handlers) are the caller's responsibility.
 */
export function createApp(deps: AppDeps): Hono {
  const { sessionRepository, sectionRepository, storageAdapter, jobQueue, eventLog, eventBus, ping, config } = deps;
  const app = new Hono();

  app.use(pinoLogger({
    pino: logger,
    http: {
      onReqBindings: (c) => ({
        method: c.req.method,
        url: c.req.path,
      }),
      onResBindings: (c) => ({
        status: c.res.status,
      }),
    },
  }));

  app.use(cors({
    origin: config.corsOrigin ?? '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Last-Event-ID'],
    exposeHeaders: ['Content-Type'],
    maxAge: 86400,
  }));

  const uploadService = new UploadService({
    sessionRepository,
    storageAdapter,
    jobQueue,
    eventBus,
    maxFileSizeMB: config.maxFileSizeMB,
  });

  const sessionService = new SessionService({
    sessionRepository,
    sectionRepository,
    storageAdapter,
    jobQueue,
    eventBus,
  });

  const statusService = new StatusService({ sessionRepository, jobQueue });
  const retryService = new RetryService({ sessionRepository, jobQueue, eventBus });
  const eventLogService = new EventLogService({ sessionRepository, eventLog });

  app.get('/api/health', async (c) => {
    try {
      await ping();
      return c.json({ status: 'ok', db: 'ok' });
    } catch (err) {
      log.error({ err }, 'Health check failed');
      return c.json({ status: 'degraded', db: 'error' }, 503);
    }
  });

  app.post('/api/upload', (c) => handleUpload(c, uploadService));

  app.get('/api/sessions', (c) => handleListSessions(c, sessionService));
  app.get('/api/sessions/:id', (c) => handleGetSession(c, sessionService));
  app.delete('/api/sessions/:id', (c) => handleDeleteSession(c, sessionService));
  app.post('/api/sessions/:id/redetect', (c) => handleRedetect(c, sessionService));

  app.get('/api/sessions/:id/events', (c) =>
    handleSseEvents(c, sessionRepository, eventBus, eventLog)
  );

  app.get('/api/sessions/:id/status', (c) => handleGetStatus(c, statusService));
  app.post('/api/sessions/:id/retry', (c) => handleRetry(c, retryService));
  app.get('/api/events', (c) => handleGetEventLog(c, eventLogService));

  return app;
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { pinoLogger } from 'hono-pino';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { DatabaseFactory } from './db/database_factory.js';
import { EmitterEventBusImpl } from './events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from './processing/pipeline_orchestrator.js';
import type { PipelineEvent } from '../shared/types/pipeline.js';
import { eventLogIds } from './event_log_ids.js';
import {
  UploadService,
  SessionService,
  StatusService,
  RetryService,
  EventLogService,
  ALL_PIPELINE_EVENT_TYPES,
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

const log = logger.child({ module: 'server' });
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

// Load configuration
const config = loadConfig();

app.use(cors({
  origin: config.corsOrigin ?? '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Last-Event-ID'],
  exposeHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Initialize database and repositories through the factory
const factory = new DatabaseFactory();
const db = await factory.create();
const { sessionRepository, sectionRepository, storageAdapter, jobQueue, eventLog, ping, close } =
  await db.initialize({ dataDir: config.dataDir });

// Initialize event bus and pipeline orchestrator
const eventBus = new EmitterEventBusImpl();
const orchestrator = new PipelineOrchestrator(eventBus, jobQueue, {
  sessionRepository,
  storageAdapter,
});

// Subscribe event log to every pipeline event type BEFORE start() so recovered
// jobs that emit events during startup are captured for audit/debugging.
// logSync runs synchronously before other handlers fire, attaching the log ID
// to the event object so SSE handlers can include it as the SSE `id` field.
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

process.on('SIGTERM', async () => {
  await orchestrator.stop();
  await close();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await orchestrator.stop();
  await close();
  process.exit(0);
});

// Instantiate services with their dependencies
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

// Health check — includes DB ping to verify connectivity
app.get('/api/health', async (c) => {
  try {
    await ping();
    return c.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    log.error({ err }, 'Health check failed');
    return c.json({ status: 'degraded', db: 'error' }, 503);
  }
});

// Upload endpoint
app.post('/api/upload', (c) => handleUpload(c, uploadService));

// Session endpoints
app.get('/api/sessions', (c) => handleListSessions(c, sessionService));
app.get('/api/sessions/:id', (c) => handleGetSession(c, sessionService));
app.delete('/api/sessions/:id', (c) => handleDeleteSession(c, sessionService));
app.post('/api/sessions/:id/redetect', (c) => handleRedetect(c, sessionService));

// SSE endpoint — real-time pipeline events for a session
app.get('/api/sessions/:id/events', (c) =>
  handleSseEvents(c, sessionRepository, eventBus, eventLog)
);

// Session status endpoint — current processing stage for UI hydration
app.get('/api/sessions/:id/status', (c) => handleGetStatus(c, statusService));

// Retry endpoint — restart processing from validate stage for failed jobs
app.post('/api/sessions/:id/retry', (c) => handleRetry(c, retryService));

// Event log endpoint — pipeline event history for debugging
app.get('/api/events', (c) => handleGetEventLog(c, eventLogService));

// Serve frontend in production — single-container deployment
if (config.nodeEnv === 'production') {
  app.use('/*', serveStatic({ root: './dist/client' }));
  // SPA fallback: serve index.html for Vue Router history mode routes
  app.get('*', serveStatic({ root: './dist/client', path: 'index.html' }));
}

export default app;

import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { pinoLogger } from 'hono-pino';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { DatabaseFactory } from './db/database_factory.js';
import { EmitterEventBusImpl } from './events/emitter_event_bus_impl.js';
import { PipelineOrchestrator } from './processing/pipeline_orchestrator.js';
import { handleUpload } from './routes/upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
  handleRedetect,
} from './routes/sessions.js';

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
await orchestrator.start();

// Subscribe event log to every pipeline event type for audit/debugging
const allEventTypes = [
  'session.uploaded', 'session.validated', 'session.detected',
  'session.replayed', 'session.deduped', 'session.ready',
  'session.failed', 'session.retrying',
] as const;
for (const type of allEventTypes) {
  eventBus.on(type, (event) => { void eventLog.log(event as never); });
}

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

// Health check — includes DB ping to verify connectivity
app.get('/api/health', async (c) => {
  try {
    await ping();
    return c.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ status: 'degraded', db: 'error', detail }, 503);
  }
});

// Upload endpoint
app.post('/api/upload', (c) =>
  handleUpload(c, sessionRepository, storageAdapter, config.maxFileSizeMB, jobQueue, eventBus)
);

// Session endpoints
app.get('/api/sessions', (c) => handleListSessions(c, sessionRepository));
app.get('/api/sessions/:id', (c) =>
  handleGetSession(c, sessionRepository, sectionRepository, storageAdapter)
);
app.delete('/api/sessions/:id', (c) =>
  handleDeleteSession(c, sessionRepository, storageAdapter)
);
app.post('/api/sessions/:id/redetect', (c) =>
  handleRedetect(c, sessionRepository, storageAdapter, jobQueue, eventBus)
);

// Serve frontend in production — single-container deployment
if (config.nodeEnv === 'production') {
  app.use('/*', serveStatic({ root: './dist/client' }));
  // SPA fallback: serve index.html for Vue Router history mode routes
  app.get('*', serveStatic({ root: './dist/client', path: 'index.html' }));
}

export default app;

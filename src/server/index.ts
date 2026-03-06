import { Hono } from 'hono';
import { loadConfig } from './config.js';
import { DatabaseFactory } from './db/database_factory.js';
import { waitForPipelines } from './processing/index.js';
import { handleUpload } from './routes/upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
  handleRedetect,
} from './routes/sessions.js';

const app = new Hono();

// Load configuration
const config = loadConfig();

// Initialize database and repositories through the factory
const factory = new DatabaseFactory();
const db = await factory.create();
const { sessionRepository, sectionRepository, storageAdapter, close } =
  await db.initialize({ dataDir: config.dataDir });

process.on('SIGTERM', async () => {
  await waitForPipelines();
  await Promise.resolve(close());
  process.exit(0);
});
process.on('SIGINT', async () => {
  await waitForPipelines();
  await Promise.resolve(close());
  process.exit(0);
});

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Upload endpoint
app.post('/api/upload', (c) =>
  handleUpload(c, sessionRepository, sectionRepository, storageAdapter, config.maxFileSizeMB)
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
  handleRedetect(c, sessionRepository, sectionRepository, storageAdapter)
);

export default app;

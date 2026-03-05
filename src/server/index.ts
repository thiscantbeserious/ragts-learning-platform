import { Hono } from 'hono';
import { loadConfig } from './config.js';
import { SqliteDatabaseImpl } from './db/sqlite-database-impl.js';
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

// Initialize database and repositories through the implementation
const dbImpl = new SqliteDatabaseImpl();
const { sessionRepository, sectionRepository, storageAdapter, close } =
  await dbImpl.initialize({ dataDir: config.dataDir });

process.on('SIGTERM', () => { Promise.resolve(close()).finally(() => process.exit(0)); });
process.on('SIGINT', () => { Promise.resolve(close()).finally(() => process.exit(0)); });

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

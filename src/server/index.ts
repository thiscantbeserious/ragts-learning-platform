import { Hono } from 'hono';
import { loadConfig } from './config.js';
import { initDatabase } from './db/database.js';
import { SqliteSessionRepository } from './db/sqlite-session-repository.js';
import { join } from 'path';
import { handleUpload } from './routes/upload.js';
import {
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
} from './routes/sessions.js';

const app = new Hono();

// Load configuration
const config = loadConfig();

// Initialize database and repository
const dbPath = join(config.dataDir, 'ragts.db');
const db = initDatabase(dbPath);
const repository = new SqliteSessionRepository(db);

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Upload endpoint
app.post('/api/upload', (c) =>
  handleUpload(c, repository, config.dataDir, config.maxFileSizeMB)
);

// Session endpoints
app.get('/api/sessions', (c) => handleListSessions(c, repository));
app.get('/api/sessions/:id', (c) => handleGetSession(c, repository));
app.delete('/api/sessions/:id', (c) => handleDeleteSession(c, repository));

export default app;

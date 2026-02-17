import { Hono } from 'hono';
import { loadConfig } from './config.js';
import { initDatabase } from './db/database.js';
import { SqliteSessionRepository } from './db/sqlite-session-repository.js';
import { SqliteSectionRepository } from './db/sqlite-section-repository.js';
import { join } from 'path';
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

// Initialize database and repositories
const dbPath = join(config.dataDir, 'ragts.db');
const db = initDatabase(dbPath);
const sessionRepository = new SqliteSessionRepository(db);
const sectionRepository = new SqliteSectionRepository(db);

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Upload endpoint
app.post('/api/upload', (c) =>
  handleUpload(c, sessionRepository, sectionRepository, config.dataDir, config.maxFileSizeMB)
);

// Session endpoints
app.get('/api/sessions', (c) => handleListSessions(c, sessionRepository));
app.get('/api/sessions/:id', (c) => handleGetSession(c, sessionRepository, sectionRepository));
app.delete('/api/sessions/:id', (c) => handleDeleteSession(c, sessionRepository));
app.post('/api/sessions/:id/redetect', (c) => handleRedetect(c, sessionRepository, sectionRepository));

export default app;

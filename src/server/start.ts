import { serve } from '@hono/node-server';
import app from './index.js';
import { logger } from './logger.js';

const port = Number(process.env.PORT) || 3000;

logger.info({ port }, 'Starting RAGTS server');

const server = serve(
  { fetch: app.fetch, port },
  (info) => {
    logger.info({ port: info.port }, `Server running at http://localhost:${info.port}`);
  },
);

// Graceful shutdown: close HTTP server so the port is released immediately.
// The SIGTERM/SIGINT handlers in index.ts handle DB + orchestrator cleanup.
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down server');
  server.close(() => {
    logger.info('HTTP server closed');
    // Let index.ts signal handlers finish DB cleanup — they call process.exit(0)
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { serve } from '@hono/node-server';
import app from './index.js';
import { logger } from './logger.js';

const port = Number(process.env.PORT) || 3000;

logger.info({ port }, 'Starting RAGTS server');

serve(
  { fetch: app.fetch, port },
  (info) => {
    logger.info({ port: info.port }, `Server running at http://localhost:${info.port}`);
  },
);

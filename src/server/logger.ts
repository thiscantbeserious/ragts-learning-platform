/**
 * Centralized pino logger for the RAGTS server.
 *
 * Uses pino-pretty in development for readable output,
 * structured JSON in production for log aggregation.
 *
 * Child loggers for subsystems:
 *   import { logger } from './logger.js';
 *   const log = logger.child({ module: 'pipeline' });
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

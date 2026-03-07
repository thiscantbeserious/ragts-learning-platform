/**
 * Tests for logger configuration.
 * Verifies both dev and production modes produce valid pino instances.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('creates logger with debug level in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { logger } = await import('./logger.js');
    expect(logger).toBeDefined();
    expect(logger.level).toBe('debug');
  });

  it('creates logger with info level in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { logger } = await import('./logger.js');
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  it('respects LOG_LEVEL env override', async () => {
    vi.stubEnv('LOG_LEVEL', 'warn');
    const { logger } = await import('./logger.js');
    expect(logger.level).toBe('warn');
  });
});

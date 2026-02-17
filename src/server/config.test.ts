/**
 * Unit tests for configuration loading.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should return default values when no env vars are set', () => {
    delete process.env.PORT;
    delete process.env.DATA_DIR;
    delete process.env.MAX_FILE_SIZE_MB;
    delete process.env.NODE_ENV;

    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.dataDir).toBe('./data');
    expect(config.maxFileSizeMB).toBe(250);
    expect(config.nodeEnv).toBe('development');
  });

  it('should use PORT from environment', () => {
    process.env.PORT = '8080';

    const config = loadConfig();

    expect(config.port).toBe(8080);
  });

  it('should use DATA_DIR from environment', () => {
    process.env.DATA_DIR = '/custom/data';

    const config = loadConfig();

    expect(config.dataDir).toBe('/custom/data');
  });

  it('should use MAX_FILE_SIZE_MB from environment', () => {
    process.env.MAX_FILE_SIZE_MB = '100';

    const config = loadConfig();

    expect(config.maxFileSizeMB).toBe(100);
  });

  it('should use NODE_ENV from environment', () => {
    process.env.NODE_ENV = 'production';

    const config = loadConfig();

    expect(config.nodeEnv).toBe('production');
  });

  it('should parse numeric values correctly', () => {
    process.env.PORT = '9000';
    process.env.MAX_FILE_SIZE_MB = '200';

    const config = loadConfig();

    expect(typeof config.port).toBe('number');
    expect(typeof config.maxFileSizeMB).toBe('number');
    expect(config.port).toBe(9000);
    expect(config.maxFileSizeMB).toBe(200);
  });

  it('should throw on invalid PORT', () => {
    process.env.PORT = 'not-a-number';

    expect(() => loadConfig()).toThrow('Invalid PORT');
  });

  it('should throw on invalid MAX_FILE_SIZE_MB', () => {
    process.env.MAX_FILE_SIZE_MB = 'abc';

    expect(() => loadConfig()).toThrow('Invalid MAX_FILE_SIZE_MB');
  });
});

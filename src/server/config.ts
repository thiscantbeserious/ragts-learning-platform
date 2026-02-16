/**
 * Server configuration loaded from environment variables.
 * All settings have sensible defaults for local-first development.
 */

export interface Config {
  port: number;
  dataDir: string;
  maxFileSizeMB: number;
  nodeEnv: string;
}

/**
 * Load configuration from environment variables with defaults.
 */
export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    dataDir: process.env.DATA_DIR || './data',
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

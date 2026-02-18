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
 * Validates numeric values to prevent silent failures.
 */
export function loadConfig(): Config {
  const port = parseInt(process.env.PORT || '3000', 10);
  const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || '250', 10);

  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: "${process.env.PORT}". Must be a number between 1 and 65535.`);
  }

  if (isNaN(maxFileSizeMB) || maxFileSizeMB <= 0) {
    throw new Error(`Invalid MAX_FILE_SIZE_MB: "${process.env.MAX_FILE_SIZE_MB}". Must be a positive number.`);
  }

  return {
    port,
    dataDir: process.env.DATA_DIR || './data',
    maxFileSizeMB,
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

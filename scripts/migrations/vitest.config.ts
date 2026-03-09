import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/migrations/**/*.test.ts'],
    environment: 'node',
  },
});

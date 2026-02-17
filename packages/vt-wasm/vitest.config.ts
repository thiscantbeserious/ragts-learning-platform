import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'vt-wasm',
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,ts}'],
  },
});

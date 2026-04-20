import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['server/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./server/__tests__/setup.ts'],
    testTimeout: 5000,
  },
  resolve: {
    conditions: ['node'],
  },
});

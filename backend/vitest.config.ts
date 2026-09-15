import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      AI_RECOMMENDATION_PROVIDER: 'mock',
      AI_PROVIDER: 'mock'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});

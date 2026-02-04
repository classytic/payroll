import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 120000,
    // Limit parallelism to prevent MongoDB memory exhaustion
    // Each test file spawns its own MongoMemoryServer (~100-200MB each)
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,  // Limit concurrent test files
        minForks: 1,
      },
    },
    // Ensure cleanup even on test failures
    teardownTimeout: 10000,
  },
});


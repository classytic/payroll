#!/usr/bin/env node
/**
 * Run tests with localhost MongoDB
 *
 * Usage: node scripts/test-local.mjs
 *
 * Requires: MongoDB running on localhost:27017
 * Will use database: payroll_test
 */

import { execSync } from 'child_process';

process.env.TEST_MONGODB_URI = 'mongodb://localhost:27017/payroll_test';

console.log('Running tests with localhost MongoDB...');
console.log(`URI: ${process.env.TEST_MONGODB_URI}\n`);

try {
  execSync('npx vitest run', {
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_MONGODB_URI: 'mongodb://localhost:27017/payroll_test',
    },
  });
} catch (error) {
  process.exit(1);
}

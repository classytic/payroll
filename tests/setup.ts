/**
 * @classytic/payroll - Test Setup
 *
 * Minimal test configuration
 */

import { beforeEach } from 'vitest';
import { setLogger } from '../src/utils/logger.js';

// Use silent logger for tests
beforeEach(() => {
  setLogger({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  });
});

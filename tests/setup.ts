/**
 * @classytic/payroll - Test Setup
 *
 * Minimal test configuration
 */

import { beforeEach } from 'vitest';
import { resetPayroll, setLogger } from '../src/index.js';

// Use silent logger for tests
beforeEach(() => {
  resetPayroll();
  setLogger({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  });
});

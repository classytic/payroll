/**
 * @classytic/payroll - Logger
 *
 * Pluggable logger abstraction
 * Defaults to console, can be replaced with pino, winston, etc.
 */

import type { Logger } from '../types.js';

// ============================================================================
// Default Logger Implementation
// ============================================================================

const createConsoleLogger = (): Logger => ({
  info: (message: string, meta?: Record<string, unknown>) => {
    if (meta) {
      console.log(`[Payroll] INFO: ${message}`, meta);
    } else {
      console.log(`[Payroll] INFO: ${message}`);
    }
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    if (meta) {
      console.error(`[Payroll] ERROR: ${message}`, meta);
    } else {
      console.error(`[Payroll] ERROR: ${message}`);
    }
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (meta) {
      console.warn(`[Payroll] WARN: ${message}`, meta);
    } else {
      console.warn(`[Payroll] WARN: ${message}`);
    }
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      if (meta) {
        console.log(`[Payroll] DEBUG: ${message}`, meta);
      } else {
        console.log(`[Payroll] DEBUG: ${message}`);
      }
    }
  },
});

// ============================================================================
// Logger State
// ============================================================================

let currentLogger: Logger = createConsoleLogger();
let loggingEnabled = true;

// ============================================================================
// Logger Functions
// ============================================================================

/**
 * Get the current logger instance
 */
export function getLogger(): Logger {
  return currentLogger;
}

/**
 * Set a custom logger instance
 */
export function setLogger(logger: Logger): void {
  currentLogger = logger;
}

/**
 * Reset to default console logger
 */
export function resetLogger(): void {
  currentLogger = createConsoleLogger();
}

/**
 * Create a child logger with prefix
 */
export function createChildLogger(prefix: string): Logger {
  const parent = currentLogger;
  return {
    info: (message: string, meta?: Record<string, unknown>) =>
      parent.info(`[${prefix}] ${message}`, meta),
    error: (message: string, meta?: Record<string, unknown>) =>
      parent.error(`[${prefix}] ${message}`, meta),
    warn: (message: string, meta?: Record<string, unknown>) =>
      parent.warn(`[${prefix}] ${message}`, meta),
    debug: (message: string, meta?: Record<string, unknown>) =>
      parent.debug(`[${prefix}] ${message}`, meta),
  };
}

/**
 * Create a silent logger (for testing)
 */
export function createSilentLogger(): Logger {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };
}

/**
 * Enable logging globally
 */
export function enableLogging(): void {
  loggingEnabled = true;
}

/**
 * Disable logging globally (useful for production)
 */
export function disableLogging(): void {
  loggingEnabled = false;
}

/**
 * Check if logging is enabled
 */
export function isLoggingEnabled(): boolean {
  return loggingEnabled;
}

// ============================================================================
// Logger Proxy Object
// ============================================================================

/**
 * Logger proxy that always delegates to currentLogger
 * Respects global logging enabled/disabled state
 */
export const logger: Logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    if (loggingEnabled) currentLogger.info(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    if (loggingEnabled) currentLogger.error(message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (loggingEnabled) currentLogger.warn(message, meta);
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (loggingEnabled) currentLogger.debug(message, meta);
  },
};

export default logger;


/**
 * @classytic/payroll - Error Helpers
 *
 * Higher-level error handling utilities that combine type guards
 * and error classes for common payroll error scenarios.
 *
 * Uses:
 * - `../errors/index.js` for PayrollError classes
 * - `./type-guards.js` for MongoDB error type checking
 *
 * @module @classytic/payroll/utils/error-helpers
 */

import {
  PayrollError,
  DuplicatePayrollError,
  extractErrorInfo,
  toPayrollError,
} from '../errors/index.js';
import {
  isDuplicateKeyError,
  parseDuplicateKeyError,
  isTransactionError,
  isTransactionUnsupportedError,
  isConnectionError,
  getErrorMessage,
} from './type-guards.js';

// ============================================================================
// Transaction Error Handling
// ============================================================================

export interface TransactionErrorResult {
  /** Whether the error is transaction-related */
  isTransactionError: boolean;
  /** Whether transactions are unsupported (standalone MongoDB) */
  isUnsupported: boolean;
  /** Whether the operation can be safely retried */
  retryable: boolean;
  /** Wrapped PayrollError with context */
  error: PayrollError;
  /** Original error for logging */
  originalError: unknown;
}

/**
 * Handle transaction-specific errors with categorization and retry guidance.
 *
 * Categorizes transaction errors into:
 * - **Unsupported**: Standalone MongoDB without replica set (non-retryable, graceful fallback)
 * - **Transient**: Network issues, coordinator changes (retryable)
 * - **Connection**: Server unreachable, shutdown (retryable after delay)
 * - **Other**: Unknown transaction errors (non-retryable)
 *
 * @param error - Unknown error from a transaction operation
 * @param operationName - Name of the operation for context (e.g., 'processSalary')
 * @returns Structured error result with retry guidance
 *
 * @example
 * ```typescript
 * try {
 *   await processWithTransaction(session);
 * } catch (error) {
 *   const result = handleTransactionError(error, 'processSalary');
 *   if (result.isUnsupported) {
 *     // Fall back to non-transactional processing
 *     await processWithoutTransaction();
 *   } else if (result.retryable) {
 *     // Retry the operation
 *     await retry(() => processWithTransaction(session));
 *   } else {
 *     throw result.error;
 *   }
 * }
 * ```
 */
export function handleTransactionError(
  error: unknown,
  operationName: string
): TransactionErrorResult {
  const isUnsupported = isTransactionUnsupportedError(error);
  const isTxError = isTransactionError(error);
  const isConnError = isConnectionError(error);

  const retryable = isTxError && !isUnsupported;

  const wrappedError = toPayrollError(error);
  wrappedError.context.operationName = operationName;
  wrappedError.context.transactionError = true;

  if (isUnsupported) {
    wrappedError.context.reason = 'transactions_unsupported';
  } else if (isConnError) {
    wrappedError.context.reason = 'connection_error';
  } else if (isTxError) {
    wrappedError.context.reason = 'transaction_conflict';
  }

  return {
    isTransactionError: isTxError || isUnsupported,
    isUnsupported,
    retryable,
    error: wrappedError,
    originalError: error,
  };
}

// ============================================================================
// Duplicate Key Error Handling
// ============================================================================

export interface DuplicateKeyErrorResult {
  /** Whether the error is a duplicate key error */
  isDuplicate: boolean;
  /** The field name that caused the duplicate */
  field: string;
  /** Wrapped DuplicatePayrollError or PayrollError */
  error: PayrollError;
}

/**
 * Handle MongoDB duplicate key errors with field extraction.
 *
 * Converts raw MongoDB E11000 errors into structured DuplicatePayrollError
 * or PayrollError with the duplicate field identified.
 *
 * @param error - Unknown error from a create/update operation
 * @param context - Additional context for the error
 * @returns Structured duplicate key error result
 *
 * @example
 * ```typescript
 * try {
 *   await PayrollRecord.create(data);
 * } catch (error) {
 *   const result = handleDuplicateKeyError(error, {
 *     employeeId: 'EMP-001',
 *     month: 1,
 *     year: 2024,
 *   });
 *   if (result.isDuplicate) {
 *     throw result.error; // DuplicatePayrollError with field info
 *   }
 *   throw error; // Re-throw non-duplicate errors
 * }
 * ```
 */
export function handleDuplicateKeyError(
  error: unknown,
  context?: { employeeId?: string; month?: number; year?: number }
): DuplicateKeyErrorResult {
  if (!isDuplicateKeyError(error)) {
    return {
      isDuplicate: false,
      field: '',
      error: toPayrollError(error),
    };
  }

  const field = parseDuplicateKeyError(error);

  const wrappedError = context?.employeeId && context?.month && context?.year
    ? new DuplicatePayrollError(context.employeeId, context.month, context.year, undefined, { duplicateField: field })
    : toPayrollError(error);

  return {
    isDuplicate: true,
    field,
    error: wrappedError,
  };
}

// ============================================================================
// General Payroll Error Handling
// ============================================================================

export interface PayrollErrorResult {
  /** Error code for programmatic handling */
  code: string;
  /** HTTP status code */
  status: number;
  /** Human-readable error message */
  message: string;
  /** Additional context */
  context: Record<string, unknown>;
  /** Whether the error is operational (expected) vs programmer error */
  operational: boolean;
  /** Whether the operation can be retried */
  retryable: boolean;
}

/**
 * Handle any payroll operation error and produce a structured result.
 *
 * Combines error classification from type-guards with PayrollError
 * extraction to produce a unified error result suitable for API responses,
 * logging, or retry decisions.
 *
 * @param error - Unknown error from any payroll operation
 * @param operationName - Name of the operation for context
 * @returns Structured error result
 *
 * @example
 * ```typescript
 * try {
 *   await payroll.processSalary(params);
 * } catch (error) {
 *   const result = handlePayrollError(error, 'processSalary');
 *   logger.error(result.message, { code: result.code, context: result.context });
 *   res.status(result.status).json({ error: result });
 * }
 * ```
 */
export function handlePayrollError(
  error: unknown,
  operationName: string
): PayrollErrorResult {
  const info = extractErrorInfo(error);

  // Determine if retryable
  const retryable =
    isConnectionError(error) ||
    (isTransactionError(error) && !isTransactionUnsupportedError(error));

  // Determine if operational
  const operational = error instanceof PayrollError
    ? error.isOperational()
    : false;

  return {
    code: info.code,
    status: info.status,
    message: info.message,
    context: {
      ...info.context,
      operationName,
    },
    operational,
    retryable,
  };
}

// ============================================================================
// Error Message Formatting
// ============================================================================

/**
 * Format error for user-facing display.
 *
 * Strips internal details and produces a clean message suitable
 * for API responses or UI display.
 *
 * @param error - Unknown error
 * @returns User-safe error message
 */
export function formatUserError(error: unknown): string {
  if (error instanceof PayrollError) {
    // PayrollErrors have controlled messages safe for users
    return error.message;
  }

  if (isDuplicateKeyError(error)) {
    const field = parseDuplicateKeyError(error);
    return `A record with this ${field} already exists`;
  }

  if (isTransactionUnsupportedError(error)) {
    return 'Database does not support transactions. Please use a replica set.';
  }

  if (isConnectionError(error)) {
    return 'Database connection error. Please try again.';
  }

  // Generic fallback - don't expose internal details
  return 'An unexpected error occurred';
}

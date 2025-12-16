/**
 * @classytic/payroll - Error Handling
 *
 * Custom error classes with error codes and HTTP status
 */

import type { ErrorCode, HttpError } from '../types.js';

// ============================================================================
// Base Error Class
// ============================================================================

export class PayrollError extends Error implements HttpError {
  readonly code: ErrorCode;
  readonly status: number;
  readonly context?: Record<string, unknown>;
  readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode = 'PAYROLL_ERROR',
    status = 500,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PayrollError';
    this.code = code;
    this.status = status;
    this.context = context;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PayrollError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// ============================================================================
// Specific Error Classes
// ============================================================================

/**
 * Not initialized error
 */
export class NotInitializedError extends PayrollError {
  constructor(message = 'Payroll not initialized. Call Payroll.initialize() first.') {
    super(message, 'NOT_INITIALIZED', 500);
    this.name = 'NotInitializedError';
  }
}

/**
 * Employee not found error
 */
export class EmployeeNotFoundError extends PayrollError {
  constructor(employeeId?: string, context?: Record<string, unknown>) {
    super(
      employeeId ? `Employee not found: ${employeeId}` : 'Employee not found',
      'EMPLOYEE_NOT_FOUND',
      404,
      context
    );
    this.name = 'EmployeeNotFoundError';
  }
}

/**
 * Invalid employee error
 */
export class InvalidEmployeeError extends PayrollError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_EMPLOYEE', 400, context);
    this.name = 'InvalidEmployeeError';
  }
}

/**
 * Duplicate payroll error
 */
export class DuplicatePayrollError extends PayrollError {
  constructor(
    employeeId: string,
    month: number,
    year: number,
    context?: Record<string, unknown>
  ) {
    super(
      `Payroll already processed for employee ${employeeId} in ${month}/${year}`,
      'DUPLICATE_PAYROLL',
      409,
      { employeeId, month, year, ...context }
    );
    this.name = 'DuplicatePayrollError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends PayrollError {
  readonly errors: string[];

  constructor(errors: string | string[], context?: Record<string, unknown>) {
    const errorArray = Array.isArray(errors) ? errors : [errors];
    super(errorArray.join(', '), 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
    this.errors = errorArray;
  }
}

/**
 * Employee terminated error
 */
export class EmployeeTerminatedError extends PayrollError {
  constructor(employeeId?: string, context?: Record<string, unknown>) {
    super(
      employeeId
        ? `Cannot perform operation on terminated employee: ${employeeId}`
        : 'Cannot perform operation on terminated employee',
      'EMPLOYEE_TERMINATED',
      400,
      context
    );
    this.name = 'EmployeeTerminatedError';
  }
}

/**
 * Already processed error
 */
export class AlreadyProcessedError extends PayrollError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ALREADY_PROCESSED', 409, context);
    this.name = 'AlreadyProcessedError';
  }
}

/**
 * Not eligible error
 */
export class NotEligibleError extends PayrollError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NOT_ELIGIBLE', 400, context);
    this.name = 'NotEligibleError';
  }
}

// ============================================================================
// Error Factory
// ============================================================================

/**
 * Create error from code
 */
export function createError(
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>
): PayrollError {
  const statusMap: Record<ErrorCode, number> = {
    PAYROLL_ERROR: 500,
    NOT_INITIALIZED: 500,
    EMPLOYEE_NOT_FOUND: 404,
    INVALID_EMPLOYEE: 400,
    DUPLICATE_PAYROLL: 409,
    VALIDATION_ERROR: 400,
    EMPLOYEE_TERMINATED: 400,
    ALREADY_PROCESSED: 409,
    NOT_ELIGIBLE: 400,
  };

  return new PayrollError(message, code, statusMap[code] || 500, context);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if error is PayrollError
 */
export function isPayrollError(error: unknown): error is PayrollError {
  return error instanceof PayrollError;
}

/**
 * Check if error has specific code
 */
export function isErrorCode(error: unknown, code: ErrorCode): boolean {
  return isPayrollError(error) && error.code === code;
}

/**
 * Extract error info for logging
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  code?: ErrorCode;
  status?: number;
  context?: Record<string, unknown>;
} {
  if (isPayrollError(error)) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      context: error.context,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: unknown) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        errorHandler(error);
      }
      throw error;
    }
  }) as T;
}

/**
 * Convert unknown error to PayrollError
 */
export function toPayrollError(error: unknown): PayrollError {
  if (isPayrollError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new PayrollError(error.message);
  }

  return new PayrollError(String(error));
}

// ============================================================================
// Legacy Alias
// ============================================================================

export { PayrollError as HRMError };


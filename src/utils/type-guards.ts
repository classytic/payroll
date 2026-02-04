/**
 * @classytic/payroll - Type Guards
 *
 * Type-safe utilities for runtime type checking,
 * especially for error handling and MongoDB errors.
 *
 * @module @classytic/payroll/utils/type-guards
 */

import { MongoServerError } from 'mongodb';
import type { EmployeeDocument } from '../types.js';

/**
 * Check if error is a MongoDB error
 *
 * @param error - Unknown error object
 * @returns True if MongoDB error
 *
 * @example
 * ```typescript
 * try {
 *   await model.create(data);
 * } catch (error) {
 *   if (isMongoError(error)) {
 *     console.log('MongoDB error code:', error.code);
 *   }
 * }
 * ```
 */
export function isMongoError(error: unknown): error is MongoServerError {
  return error instanceof MongoServerError;
}

/**
 * Check if error is a MongoDB duplicate key error (E11000)
 *
 * @param error - Unknown error object
 * @returns True if duplicate key error
 *
 * @example
 * ```typescript
 * try {
 *   await PayrollModel.create(record);
 * } catch (error) {
 *   if (isDuplicateKeyError(error)) {
 *     const field = parseDuplicateKeyError(error);
 *     throw new DuplicatePayrollError(`Duplicate ${field}`);
 *   }
 * }
 * ```
 */
export function isDuplicateKeyError(error: unknown): error is MongoServerError & { code: 11000 } {
  return isMongoError(error) && error.code === 11000;
}

/**
 * Parse field name from MongoDB duplicate key error
 *
 * @param error - MongoDB duplicate key error
 * @returns Field name that caused the duplicate, or 'unknown'
 *
 * @example
 * ```typescript
 * if (isDuplicateKeyError(error)) {
 *   const field = parseDuplicateKeyError(error);
 *   // field might be 'employeeId', 'email', etc.
 * }
 * ```
 */
export function parseDuplicateKeyError(error: MongoServerError): string {
  const message = error.message || '';

  // MongoDB error message format: "E11000 duplicate key error collection: ... dup key: { fieldName: ... }"
  const match = message.match(/dup key: \{ ([^:]+):/);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Fallback: try to extract from errmsg
  const errmsgMatch = message.match(/index: ([^_]+)_/);
  if (errmsgMatch && errmsgMatch[1]) {
    return errmsgMatch[1].trim();
  }

  return 'unknown';
}

/**
 * Check if error is a MongoDB transaction error
 *
 * @param error - Unknown error object
 * @returns True if transaction-related error
 */
export function isTransactionError(error: unknown): error is MongoServerError {
  if (!isMongoError(error)) return false;

  const message = (error.message || '').toLowerCase();
  return (
    message.includes('transaction') ||
    message.includes('session') ||
    message.includes('replica set') ||
    error.code === 251 || // NoSuchTransaction
    error.code === 225 || // TransactionTooOld
    error.code === 244 || // TransactionAborted
    error.code === 256 || // TransactionCommitted
    error.code === 257    // TransactionCoordinatorSteppingDown
  );
}

/**
 * Check if MongoDB transactions are unsupported (standalone server)
 *
 * @param error - Unknown error object
 * @returns True if error indicates transactions are not supported
 */
export function isTransactionUnsupportedError(error: unknown): boolean {
  if (!isMongoError(error)) return false;

  const message = (error.message || '').toLowerCase();
  return (
    message.includes('transaction numbers are only allowed on a replica set member') ||
    message.includes('transactions are only supported on replica sets') ||
    message.includes('mongos') ||
    error.code === 20 // IllegalOperation
  );
}

/**
 * Check if error is a connection error
 *
 * @param error - Unknown error object
 * @returns True if connection error
 */
export function isConnectionError(error: unknown): error is MongoServerError {
  if (!isMongoError(error)) return false;

  return (
    error.code === 11600 || // InterruptedAtShutdown
    error.code === 11602 || // InterruptedDueToReplStateChange
    error.code === 91     || // ShutdownInProgress
    error.code === 89     || // NetworkTimeout
    error.code === 6       // HostUnreachable
  );
}

/**
 * Type guard: Check if employee is a guest employee (no userId)
 *
 * @param employee - Employee document
 * @returns True if guest employee
 *
 * @example
 * ```typescript
 * if (isGuestEmployee(employee)) {
 *   // Handle guest-specific logic
 *   console.log('Guest employee:', employee.email);
 * }
 * ```
 */
export function isGuestEmployee(employee: EmployeeDocument): boolean {
  return !employee.userId;
}

/**
 * Type guard: Check if employee has a user ID
 *
 * @param employee - Employee document
 * @returns True if employee has userId (not guest)
 */
export function hasUserId(employee: EmployeeDocument): employee is EmployeeDocument & { userId: NonNullable<EmployeeDocument['userId']> } {
  return !!employee.userId;
}

/**
 * Type guard: Check if employee has a customer ID (from populated userId)
 *
 * @param employee - Employee document
 * @returns True if customer ID exists
 */
export function hasCustomerId(employee: EmployeeDocument): boolean {
  return !!employee.userId;
}

/**
 * Check if error is a validation error
 *
 * @param error - Unknown error object
 * @returns True if Mongoose/MongoDB validation error
 */
export function isValidationError(error: unknown): error is Error & { name: 'ValidationError' } {
  return error instanceof Error && error.name === 'ValidationError';
}

/**
 * Type guard for Error instances
 *
 * @param error - Unknown value
 * @returns True if Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Safe error message extraction
 *
 * @param error - Unknown error object
 * @returns Error message or generic fallback
 *
 * @example
 * ```typescript
 * try {
 *   await dangerousOperation();
 * } catch (error) {
 *   logger.error(getErrorMessage(error));
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'Unknown error occurred';
}

/**
 * @classytic/payroll - Employee Type Guards
 *
 * Type-safe utilities for accessing employee properties,
 * especially for guest vs. regular employees.
 *
 * @module @classytic/payroll/utils/employee-type-guards
 */

import type { EmployeeDocument } from '../types.js';

/**
 * Safely get email from employee (guest or regular)
 *
 * @param employee - Employee document
 * @returns Email address or undefined
 *
 * @example
 * ```typescript
 * const email = getEmployeeEmail(employee);
 * if (email) {
 *   sendNotification(email, 'Payroll processed');
 * }
 * ```
 */
export function getEmployeeEmail(employee: EmployeeDocument): string | undefined {
  // Guest employee with direct email field
  if ('email' in employee && typeof employee.email === 'string') {
    return employee.email;
  }

  // Regular employee with userId populated
  if (employee.userId && typeof employee.userId === 'object' && 'email' in employee.userId) {
    return (employee.userId as { email?: string }).email;
  }

  return undefined;
}

/**
 * Get employee name (from userId if populated, fallback to employeeId)
 *
 * @param employee - Employee document
 * @returns Employee name or employee ID
 *
 * @example
 * ```typescript
 * const name = getEmployeeName(employee);
 * console.log(`Processing payroll for ${name}`);
 * ```
 */
export function getEmployeeName(employee: EmployeeDocument): string {
  if (employee.userId && typeof employee.userId === 'object' && 'name' in employee.userId) {
    const userName = (employee.userId as { name?: string }).name;
    if (userName) return userName;
  }

  return employee.employeeId;
}

/**
 * Check if employee is a guest employee (no userId)
 *
 * @param employee - Employee document
 * @returns True if guest employee
 *
 * @example
 * ```typescript
 * if (isGuestEmployee(employee)) {
 *   // Handle guest-specific logic
 * }
 * ```
 */
export function isGuestEmployee(employee: EmployeeDocument): boolean {
  return !employee.userId;
}

/**
 * Get phone number from employee (userId or direct field)
 *
 * @param employee - Employee document
 * @returns Phone number or undefined
 */
export function getEmployeePhone(employee: EmployeeDocument): string | undefined {
  if (employee.userId && typeof employee.userId === 'object' && 'phone' in employee.userId) {
    return (employee.userId as { phone?: string }).phone;
  }

  return undefined;
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
 * Safely get user ID (ObjectId) from employee
 *
 * @param employee - Employee document
 * @returns User ObjectId or undefined
 */
export function getEmployeeUserId(employee: EmployeeDocument): import('mongoose').Types.ObjectId | undefined {
  if (!employee.userId) return undefined;

  // userId can be ObjectId or populated user object
  if (typeof employee.userId === 'object' && '_id' in employee.userId) {
    return (employee.userId as { _id: import('mongoose').Types.ObjectId })._id;
  }

  return employee.userId as import('mongoose').Types.ObjectId;
}

/**
 * @classytic/payroll - Validation Utilities
 *
 * Fluent, composable, type-safe validation
 * Clear semantics and helpful error messages
 */

import type {
  EmployeeStatus,
  EmploymentType,
  Compensation,
  BankDetails,
  EmployeeValidationResult,
} from '../types.js';
import {
  EMPLOYEE_STATUS_VALUES,
  EMPLOYMENT_TYPE_VALUES,
} from '../enums.js';
import { diffInMonths } from './date.js';

// ============================================================================
// Employee Status Validators
// ============================================================================

/**
 * Check if employee is active
 */
export function isActive(employee: { status?: EmployeeStatus }): boolean {
  return employee?.status === 'active';
}

/**
 * Check if employee is on leave
 */
export function isOnLeave(employee: { status?: EmployeeStatus }): boolean {
  return employee?.status === 'on_leave';
}

/**
 * Check if employee is suspended
 */
export function isSuspended(employee: { status?: EmployeeStatus }): boolean {
  return employee?.status === 'suspended';
}

/**
 * Check if employee is terminated
 */
export function isTerminated(employee: { status?: EmployeeStatus }): boolean {
  return employee?.status === 'terminated';
}

/**
 * Check if employee is employed (not terminated)
 */
export function isEmployed(employee: { status?: EmployeeStatus }): boolean {
  return (
    isActive(employee) || isOnLeave(employee) || isSuspended(employee)
  );
}

/**
 * Check if employee can receive salary
 */
export function canReceiveSalary(employee: {
  status?: EmployeeStatus;
  compensation?: { baseAmount?: number };
}): boolean {
  return (
    (isActive(employee) || isOnLeave(employee)) &&
    (employee.compensation?.baseAmount ?? 0) > 0
  );
}

/**
 * Check if employment can be updated
 */
export function canUpdateEmployment(employee: { status?: EmployeeStatus }): boolean {
  return !isTerminated(employee);
}

// ============================================================================
// Compensation Validators
// ============================================================================

/**
 * Check if employee has valid compensation
 */
export function hasCompensation(employee: {
  compensation?: { baseAmount?: number };
}): boolean {
  return (employee.compensation?.baseAmount ?? 0) > 0;
}

/**
 * Check if compensation is valid
 */
export function isValidCompensation(compensation?: Compensation): boolean {
  return !!(
    compensation?.baseAmount &&
    compensation.baseAmount > 0 &&
    compensation.frequency &&
    compensation.currency
  );
}

/**
 * Check if bank details are valid
 */
export function isValidBankDetails(bankDetails?: BankDetails): boolean {
  return !!(
    bankDetails?.accountNumber &&
    bankDetails.bankName &&
    bankDetails.accountName
  );
}

// ============================================================================
// Probation Validators
// ============================================================================

/**
 * Check if employee is in probation
 */
export function isInProbation(
  employee: { probationEndDate?: Date | null },
  now = new Date()
): boolean {
  if (!employee?.probationEndDate) return false;
  return new Date(employee.probationEndDate) > now;
}

/**
 * Check if employee has completed probation
 */
export function hasCompletedProbation(
  employee: { probationEndDate?: Date | null },
  now = new Date()
): boolean {
  if (!employee?.probationEndDate) return true;
  return new Date(employee.probationEndDate) <= now;
}

// ============================================================================
// Eligibility Validators
// ============================================================================

/**
 * Check if employee is eligible for bonus
 */
export function isEligibleForBonus(
  employee: { status?: EmployeeStatus; hireDate?: Date },
  requiredMonths = 6
): boolean {
  if (!isActive(employee) || !employee.hireDate) return false;
  const monthsEmployed = diffInMonths(employee.hireDate, new Date());
  return monthsEmployed >= requiredMonths;
}

/**
 * Check if employee is eligible for payroll
 */
export function isEligibleForPayroll(employee: {
  status?: EmployeeStatus;
  compensation?: { baseAmount?: number };
  bankDetails?: BankDetails;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!isActive(employee) && !isOnLeave(employee)) {
    reasons.push('Employee is not in active or on-leave status');
  }

  if (!hasCompensation(employee)) {
    reasons.push('Employee has no valid compensation');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

// ============================================================================
// Field Validators
// ============================================================================

/**
 * Check if value is required
 */
export function required(fieldName: string): (value: unknown) => string | true {
  return (value: unknown) =>
    value !== undefined && value !== null && value !== ''
      ? true
      : `${fieldName} is required`;
}

/**
 * Check minimum value
 */
export function min(
  minValue: number,
  fieldName: string
): (value: number) => string | true {
  return (value: number) =>
    value >= minValue ? true : `${fieldName} must be at least ${minValue}`;
}

/**
 * Check maximum value
 */
export function max(
  maxValue: number,
  fieldName: string
): (value: number) => string | true {
  return (value: number) =>
    value <= maxValue ? true : `${fieldName} must not exceed ${maxValue}`;
}

/**
 * Check value is in range
 */
export function inRange(
  minValue: number,
  maxValue: number,
  fieldName: string
): (value: number) => string | true {
  return (value: number) =>
    value >= minValue && value <= maxValue
      ? true
      : `${fieldName} must be between ${minValue} and ${maxValue}`;
}

/**
 * Check value is positive
 */
export function isPositive(fieldName: string): (value: number) => string | true {
  return (value: number) =>
    value > 0 ? true : `${fieldName} must be positive`;
}

/**
 * Check value is one of allowed values
 */
export function oneOf<T extends string>(
  allowedValues: readonly T[],
  fieldName: string
): (value: T) => string | true {
  return (value: T) =>
    allowedValues.includes(value)
      ? true
      : `${fieldName} must be one of: ${allowedValues.join(', ')}`;
}

// ============================================================================
// Enum Validators
// ============================================================================

/**
 * Check if status is valid
 */
export function isValidStatus(value: string): value is EmployeeStatus {
  return EMPLOYEE_STATUS_VALUES.includes(value as EmployeeStatus);
}

/**
 * Check if employment type is valid
 */
export function isValidEmploymentType(value: string): value is EmploymentType {
  return EMPLOYMENT_TYPE_VALUES.includes(value as EmploymentType);
}

// ============================================================================
// Composite Validators
// ============================================================================

/**
 * Compose multiple validators
 */
export function composeValidators<T>(
  ...validators: Array<(value: T, data?: unknown) => string | true>
): (value: T, data?: unknown) => string | true {
  return (value: T, data?: unknown) => {
    for (const validator of validators) {
      const result = validator(value, data);
      if (result !== true) return result;
    }
    return true;
  };
}

/**
 * Create a validator from validation functions
 */
export function createValidator<T extends Record<string, unknown>>(
  validationFns: Record<string, (value: unknown, data: T) => string | true>
): (data: T) => EmployeeValidationResult {
  return (data: T) => {
    const errors: string[] = [];

    for (const [field, validator] of Object.entries(validationFns)) {
      const result = validator((data as Record<string, unknown>)[field], data);
      if (result !== true) {
        errors.push(result);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };
}

/**
 * Validate required fields exist
 */
export function hasRequiredFields(
  obj: Record<string, unknown>,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing = fields.filter(
    (field) => obj[field] === undefined || obj[field] === null
  );
  return {
    valid: missing.length === 0,
    missing,
  };
}

// ============================================================================
// Aliases for backwards compatibility
// ============================================================================

export const minValue = min;
export const maxValue = max;
export const isInRange = inRange;

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Status validators
  isActive,
  isOnLeave,
  isSuspended,
  isTerminated,
  isEmployed,
  canReceiveSalary,
  canUpdateEmployment,
  // Compensation validators
  hasCompensation,
  isValidCompensation,
  isValidBankDetails,
  // Probation validators
  isInProbation,
  hasCompletedProbation,
  // Eligibility validators
  isEligibleForBonus,
  isEligibleForPayroll,
  // Field validators
  required,
  min,
  max,
  inRange,
  isPositive,
  oneOf,
  // Enum validators
  isValidStatus,
  isValidEmploymentType,
  // Composite validators
  composeValidators,
  createValidator,
  hasRequiredFields,
};


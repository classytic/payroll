/**
 * @classytic/payroll - Attendance Deduction Calculator
 *
 * Pure functions for calculating salary deductions based on attendance.
 * No database dependencies - can be used client-side!
 *
 * All monetary calculations use banker's rounding for financial accuracy.
 *
 * @packageDocumentation
 */

import { roundMoney } from '../utils/money.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for attendance deduction calculation
 */
export interface AttendanceDeductionInput {
  /**
   * Expected working days in the period (for this specific employee)
   * Should account for hire/termination dates
   */
  expectedWorkingDays: number;

  /**
   * Actual working days the employee was present
   */
  actualWorkingDays: number;

  /**
   * Daily salary rate for this employee
   * Calculated as: baseAmount / expectedWorkingDays
   */
  dailyRate: number;
}

/**
 * Result of attendance deduction calculation
 */
export interface AttendanceDeductionResult {
  /**
   * Number of absent days
   */
  absentDays: number;

  /**
   * Total deduction amount
   */
  deductionAmount: number;

  /**
   * Daily rate used for calculation
   */
  dailyRate: number;

  /**
   * Whether any deduction was applied
   */
  hasDeduction: boolean;
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Calculate attendance deduction based on absent days
 *
 * @example
 * ```typescript
 * const result = calculateAttendanceDeduction({
 *   expectedWorkingDays: 22,
 *   actualWorkingDays: 20,  // 2 days absent
 *   dailyRate: 4545,  // 100000 / 22
 * });
 *
 * console.log(result);
 * // {
 * //   absentDays: 2,
 * //   deductionAmount: 9090,
 * //   dailyRate: 4545,
 * //   hasDeduction: true
 * // }
 * ```
 *
 * @param input - Attendance deduction parameters
 * @returns Deduction result with breakdown
 *
 * @pure This function has no side effects
 */
export function calculateAttendanceDeduction(input: AttendanceDeductionInput): AttendanceDeductionResult {
  const { expectedWorkingDays, actualWorkingDays, dailyRate } = input;

  // Guard against negative values
  const expected = Math.max(0, expectedWorkingDays);
  const actual = Math.max(0, actualWorkingDays);
  const rate = Math.max(0, dailyRate);

  // Calculate absent days (cannot be negative)
  const absentDays = Math.max(0, expected - actual);

  // Calculate deduction amount (banker's rounding to cents)
  const deductionAmount = roundMoney(absentDays * rate, 2);

  return {
    absentDays,
    deductionAmount,
    dailyRate: rate,
    hasDeduction: deductionAmount > 0,
  };
}

/**
 * Calculate daily rate from monthly salary and working days
 *
 * @example
 * ```typescript
 * const daily = calculateDailyRate(100000, 22); // 4545
 * ```
 *
 * @param monthlySalary - Monthly base salary
 * @param workingDays - Working days in the month
 * @returns Daily rate (rounded)
 *
 * @pure No side effects
 */
export function calculateDailyRate(monthlySalary: number, workingDays: number): number {
  if (workingDays <= 0) return 0;
  return roundMoney(monthlySalary / workingDays, 2);
}

/**
 * Calculate hourly rate from monthly salary
 *
 * @example
 * ```typescript
 * const hourly = calculateHourlyRate(100000, 22, 8); // 568
 * ```
 *
 * @param monthlySalary - Monthly base salary
 * @param workingDays - Working days in the month
 * @param hoursPerDay - Hours per working day (default: 8)
 * @returns Hourly rate (rounded)
 *
 * @pure No side effects
 */
export function calculateHourlyRate(
  monthlySalary: number,
  workingDays: number,
  hoursPerDay: number = 8
): number {
  const dailyRate = calculateDailyRate(monthlySalary, workingDays);
  if (hoursPerDay <= 0) return 0;
  return roundMoney(dailyRate / hoursPerDay, 2);
}

/**
 * Calculate deduction for partial day absence (half-day, quarter-day, etc.)
 *
 * @example
 * ```typescript
 * // Half-day absence
 * const deduction = calculatePartialDayDeduction(4545, 0.5); // 2272
 * ```
 *
 * @param dailyRate - Daily salary rate
 * @param fractionAbsent - Fraction of day absent (0-1)
 * @returns Deduction amount (rounded)
 *
 * @pure No side effects
 */
export function calculatePartialDayDeduction(dailyRate: number, fractionAbsent: number): number {
  const fraction = Math.min(1, Math.max(0, fractionAbsent));
  return roundMoney(dailyRate * fraction, 2);
}

/**
 * Calculate total attendance deduction including full and partial day absences
 *
 * @example
 * ```typescript
 * const result = calculateTotalAttendanceDeduction({
 *   dailyRate: 4545,
 *   fullDayAbsences: 2,
 *   partialDayAbsences: [0.5, 0.25], // Half-day + quarter-day
 * });
 * 
 * console.log(result);
 * // {
 * //   fullDayDeduction: 9090,
 * //   partialDayDeduction: 3408,
 * //   totalDeduction: 12498
 * // }
 * ```
 *
 * @param input - Absence breakdown
 * @returns Deduction breakdown and total
 *
 * @pure No side effects
 */
export function calculateTotalAttendanceDeduction(input: {
  dailyRate: number;
  fullDayAbsences?: number;
  partialDayAbsences?: number[];
}): {
  fullDayDeduction: number;
  partialDayDeduction: number;
  totalDeduction: number;
} {
  const { dailyRate, fullDayAbsences = 0, partialDayAbsences = [] } = input;

  // Full day deductions (banker's rounding to whole units)
  const fullDayDeduction = roundMoney(dailyRate * Math.max(0, fullDayAbsences), 2);

  // Partial day deductions
  const partialDayDeduction = partialDayAbsences.reduce(
    (sum, fraction) => sum + calculatePartialDayDeduction(dailyRate, fraction),
    0
  );

  return {
    fullDayDeduction,
    partialDayDeduction,
    totalDeduction: fullDayDeduction + partialDayDeduction,
  };
}


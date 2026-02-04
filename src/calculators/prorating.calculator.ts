/**
 * @classytic/payroll - Pro-Rating Calculator
 *
 * Pure functions for salary pro-rating calculations.
 * No database dependencies - can be used client-side!
 *
 * Handles:
 * - Mid-period hires
 * - Mid-period terminations
 * - Working days (not calendar days)
 * - Holidays exclusion
 *
 * @packageDocumentation
 */

import { countWorkingDays } from '../core/config.js';
import { roundMoney } from '../utils/money.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for pro-rating calculation
 */
export interface ProRatingInput {
  /**
   * Employee hire date
   */
  hireDate: Date;

  /**
   * Employee termination date (null if still employed)
   */
  terminationDate: Date | null;

  /**
   * Start of the salary period
   */
  periodStart: Date;

  /**
   * End of the salary period
   */
  periodEnd: Date;

  /**
   * Working days of the week using Date.getDay() convention (0=Sunday, 1=Monday, ..., 6=Saturday)
   * @default [1, 2, 3, 4, 5] (Monday-Friday)
   */
  workingDays: number[];

  /**
   * Public holidays to exclude from working days
   * @default []
   */
  holidays?: Date[];
}

/**
 * Result of pro-rating calculation
 */
export interface ProRatingResult {
  /**
   * Whether the salary needs to be pro-rated
   */
  isProRated: boolean;

  /**
   * Pro-rating ratio (0-1)
   * 1 = full salary, 0.5 = half salary, etc.
   */
  ratio: number;

  /**
   * Total working days in the period
   */
  periodWorkingDays: number;

  /**
   * Working days the employee was actually employed
   */
  effectiveWorkingDays: number;

  /**
   * Effective start date (max of hire date and period start)
   */
  effectiveStart: Date;

  /**
   * Effective end date (min of termination date and period end)
   */
  effectiveEnd: Date;
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Calculate pro-rating for mid-period hires/terminations
 *
 * This function uses WORKING DAYS (not calendar days) for accurate pro-rating.
 *
 * @example
 * ```typescript
 * // Employee hired on March 15th, process March salary
 * const result = calculateProRating({
 *   hireDate: new Date('2024-03-15'),
 *   terminationDate: null,
 *   periodStart: new Date('2024-03-01'),
 *   periodEnd: new Date('2024-03-31'),
 *   workingDays: [1, 2, 3, 4, 5], // Mon-Fri
 * });
 * 
 * console.log(result);
 * // {
 * //   isProRated: true,
 * //   ratio: 0.64,  // Worked 14 out of 22 working days
 * //   periodWorkingDays: 22,
 * //   effectiveWorkingDays: 14
 * // }
 * ```
 *
 * @param input - Pro-rating calculation parameters
 * @returns Pro-rating result with ratio and working days breakdown
 *
 * @pure This function has no side effects and doesn't access external state
 */
export function calculateProRating(input: ProRatingInput): ProRatingResult {
  const { hireDate, terminationDate, periodStart, periodEnd, workingDays, holidays = [] } = input;

  const hire = new Date(hireDate);
  const termination = terminationDate ? new Date(terminationDate) : null;

  // Determine the actual start and end dates for this employee in this period
  const effectiveStart = hire > periodStart ? hire : periodStart;
  const effectiveEnd = termination && termination < periodEnd ? termination : periodEnd;

  // If employee wasn't active during this period at all
  if (effectiveStart > periodEnd || (termination && termination < periodStart)) {
    const periodWorkingDays = countWorkingDays(periodStart, periodEnd, { workingDays, holidays }).workingDays;
    return {
      isProRated: true,
      ratio: 0,
      periodWorkingDays,
      effectiveWorkingDays: 0,
      effectiveStart: periodStart,
      effectiveEnd: periodStart, // Effectively zero days
    };
  }

  // Calculate working days for the full period
  const periodWorkingDays = countWorkingDays(periodStart, periodEnd, { workingDays, holidays }).workingDays;

  // Calculate working days the employee was actually employed
  const effectiveWorkingDays = countWorkingDays(effectiveStart, effectiveEnd, { workingDays, holidays }).workingDays;

  // Calculate ratio
  const ratio = periodWorkingDays > 0 
    ? Math.min(1, Math.max(0, effectiveWorkingDays / periodWorkingDays)) 
    : 0;

  // Is pro-rated if ratio is less than 1
  const isProRated = ratio < 1;

  return {
    isProRated,
    ratio,
    periodWorkingDays,
    effectiveWorkingDays,
    effectiveStart,
    effectiveEnd,
  };
}

/**
 * Calculate pro-rated amount from base amount and ratio
 *
 * @example
 * ```typescript
 * const proRatedSalary = applyProRating(100000, 0.64); // 64000
 * ```
 *
 * @param baseAmount - Original amount
 * @param ratio - Pro-rating ratio (0-1)
 * @returns Pro-rated amount (rounded)
 *
 * @pure No side effects
 */
export function applyProRating(baseAmount: number, ratio: number): number {
  return roundMoney(baseAmount * ratio, 2);
}

/**
 * Check if pro-rating should be applied for a given hire/termination scenario
 *
 * @param hireDate - Employee hire date
 * @param terminationDate - Employee termination date (null if active)
 * @param periodStart - Salary period start
 * @param periodEnd - Salary period end
 * @returns True if pro-rating is needed
 *
 * @pure No side effects
 */
export function shouldProRate(
  hireDate: Date,
  terminationDate: Date | null,
  periodStart: Date,
  periodEnd: Date
): boolean {
  const hire = new Date(hireDate);
  const termination = terminationDate ? new Date(terminationDate) : null;

  // Pro-rate if hired after period start
  if (hire > periodStart) return true;

  // Pro-rate if terminated before period end
  if (termination && termination < periodEnd) return true;

  return false;
}


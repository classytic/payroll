/**
 * @classytic/payroll - Configuration & Calculation Utilities
 *
 * DESIGN PRINCIPLES:
 * 1. Accept data, don't manage it
 * 2. Pure functions - easy to test, no side effects
 * 3. Smart defaults that work out of the box
 * 4. Override at operation time when needed
 *
 * The payroll package CALCULATES, it doesn't STORE calendars/holidays.
 * Your app manages that data and passes it when needed.
 */

import { roundMoney } from '../utils/money.js';
import { toUTCDateString } from '../utils/date.js';

// ============================================================================
// Types
// ============================================================================

/** Work schedule configuration */
export interface WorkSchedule {
  /** Working days (0=Sun, 1=Mon, ..., 6=Sat). Default: Mon-Fri */
  workingDays: number[];
  /** Hours per work day. Default: 8 */
  hoursPerDay: number;
}

/** Options passed when processing payroll */
export interface PayrollProcessingOptions {
  /** Holidays in this period (from YOUR app's holiday model) */
  holidays?: Date[];
  /** Override work schedule for this operation */
  workSchedule?: Partial<WorkSchedule>;
  /** Skip tax calculation */
  skipTax?: boolean;
  /** Skip proration (pay full amount regardless of hire/termination date) */
  skipProration?: boolean;
  /** Skip attendance deduction */
  skipAttendance?: boolean;
}

/** Working days calculation result */
export interface WorkingDaysResult {
  /** Total calendar days in period */
  totalDays: number;
  /** Working days (excluding weekends and holidays) */
  workingDays: number;
  /** Weekend days */
  weekends: number;
  /** Holiday count */
  holidays: number;
}

/** Proration calculation result */
export interface ProrationResult {
  /** Proration ratio (0-1) */
  ratio: number;
  /**
   * Reason for proration:
   * - 'full': Employee worked the entire period (ratio = 1)
   * - 'new_hire': Employee was hired during the period
   * - 'termination': Employee was terminated during the period
   * - 'both': Both hired and terminated within the period
   * - 'not_active': Employee was not active at all during the period (ratio = 0)
   */
  reason: 'full' | 'new_hire' | 'termination' | 'both' | 'not_active';
  /** Whether salary should be prorated */
  isProrated: boolean;
}

/** Attendance data (from YOUR attendance system) */
export interface AttendanceInput {
  /**
   * Expected work days in period.
   * If not provided, derived from employee's workSchedule and period dates.
   */
  expectedDays?: number;
  /** Actual days worked */
  actualDays: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  workingDays: [1, 2, 3, 4, 5], // Monday to Friday
  hoursPerDay: 8,
};

// ============================================================================
// Pure Calculation Functions
// ============================================================================

/**
 * Count working days in a date range
 *
 * @example
 * const result = countWorkingDays(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-31'),
 *   { workingDays: [1,2,3,4,5], holidays: companyHolidays }
 * );
 */
export function countWorkingDays(
  startDate: Date,
  endDate: Date,
  options: {
    workingDays?: number[];
    holidays?: Date[];
  } = {}
): WorkingDaysResult {
  const workDays = options.workingDays || DEFAULT_WORK_SCHEDULE.workingDays;
  const holidaySet = new Set(
    (options.holidays || []).map(d => toUTCDateString(d))
  );

  let totalDays = 0;
  let workingDays = 0;
  let holidays = 0;
  let weekends = 0;

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    totalDays++;
    const isHoliday = holidaySet.has(toUTCDateString(current));
    const isWorkDay = workDays.includes(current.getDay());

    if (isHoliday) {
      holidays++;
    } else if (isWorkDay) {
      workingDays++;
    } else {
      weekends++;
    }

    current.setDate(current.getDate() + 1);
  }

  return { totalDays, workingDays, weekends, holidays };
}

/**
 * Calculate proration ratio for partial months
 *
 * @example
 * const proration = calculateProration(
 *   employee.hireDate,
 *   employee.terminationDate,
 *   periodStart,
 *   periodEnd
 * );
 */
export function calculateProration(
  hireDate: Date,
  terminationDate: Date | null | undefined,
  periodStart: Date,
  periodEnd: Date
): ProrationResult {
  const hire = new Date(hireDate);
  hire.setHours(0, 0, 0, 0);
  const term = terminationDate ? new Date(terminationDate) : null;
  if (term) term.setHours(0, 0, 0, 0);
  const start = new Date(periodStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(periodEnd);
  end.setHours(0, 0, 0, 0);

  // Employee not active in this period
  if (hire > end || (term && term < start)) {
    return { ratio: 0, reason: 'not_active', isProrated: true };
  }

  // Effective dates within the period
  const effectiveStart = hire > start ? hire : start;
  const effectiveEnd = term && term < end ? term : end;

  // Calculate days
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  const actualDays = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1;
  const ratio = Math.min(1, Math.max(0, actualDays / totalDays));

  // Determine reason
  const isNewHire = hire > start;
  const isTermination = term !== null && term < end;
  
  let reason: ProrationResult['reason'] = 'full';
  if (isNewHire && isTermination) {
    reason = 'both';
  } else if (isNewHire) {
    reason = 'new_hire';
  } else if (isTermination) {
    reason = 'termination';
  }

  return { ratio, reason, isProrated: ratio < 1 };
}

// NOTE: calculateAttendanceDeduction has been moved to calculators/attendance.calculator.ts
// The calculator version uses banker's rounding and returns a detailed result object.
// Re-export from core/index.ts for backward compatibility.

/**
 * Get pay period dates for a given month
 *
 * @example
 * const period = getPayPeriod(3, 2024); // March 2024
 */
export function getPayPeriod(
  month: number,
  year: number,
  payDay = 28
): { startDate: Date; endDate: Date; payDate: Date } {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month
  const payDate = new Date(year, month - 1, Math.min(payDay, endDate.getDate()));
  return { startDate, endDate, payDate };
}


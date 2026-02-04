/**
 * @classytic/payroll - Date Utilities
 *
 * Pure, composable, testable date operations
 * No side effects, no mutations
 */

import type { PayPeriodInfo, PaymentFrequency } from '../types.js';

// ============================================================================
// Date Arithmetic
// ============================================================================

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Add years to a date
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Subtract days from a date
 */
export function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

/**
 * Subtract months from a date
 */
export function subMonths(date: Date, months: number): Date {
  return addMonths(date, -months);
}

// ============================================================================
// Date Boundaries
// ============================================================================

/**
 * Get the start of a month
 */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of a month
 */
export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the start of a year
 */
export function startOfYear(date: Date): Date {
  const result = new Date(date);
  result.setMonth(0, 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of a year
 */
export function endOfYear(date: Date): Date {
  const result = new Date(date);
  result.setMonth(11, 31);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the start of a day
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of a day
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

// ============================================================================
// Date Normalization
// ============================================================================

/**
 * Convert a date to a UTC-based date string for consistent comparison.
 *
 * Unlike `Date.toDateString()` which uses the local timezone, this produces
 * a locale-independent string based on the date's year/month/day components.
 * Use this for holiday set lookups to avoid timezone-dependent mismatches.
 */
export function toUTCDateString(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================================================
// Date Differences
// ============================================================================

/**
 * Calculate difference in days between two dates.
 *
 * Normalizes both dates to midnight before computing to avoid
 * inconsistencies from time-of-day differences or DST transitions.
 */
export function diffInDays(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate difference in months between two dates
 */
export function diffInMonths(start: Date, end: Date): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth())
  );
}

/**
 * Calculate difference in years between two dates
 */
export function diffInYears(start: Date, end: Date): number {
  return Math.floor(diffInMonths(start, end) / 12);
}

// Aliases for backwards compatibility
export const daysBetween = diffInDays;
export const monthsBetween = diffInMonths;

// ============================================================================
// Day Type Checks
// ============================================================================

/**
 * Check if date is a weekday (Mon-Fri)
 */
export function isWeekday(date: Date): boolean {
  const day = new Date(date).getDay();
  return day >= 1 && day <= 5;
}

/**
 * Check if date is a weekend (Sat-Sun)
 */
export function isWeekend(date: Date): boolean {
  const day = new Date(date).getDay();
  return day === 0 || day === 6;
}

/**
 * Get day of week (0=Sunday, 6=Saturday)
 */
export function getDayOfWeek(date: Date): number {
  return new Date(date).getDay();
}

/**
 * Get day name
 */
export function getDayName(date: Date): string {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return days[getDayOfWeek(date)];
}

// ============================================================================
// Pay Period Functions
// ============================================================================

/**
 * Get pay period for a given month and year (monthly periods)
 */
export function getPayPeriod(month: number, year: number): PayPeriodInfo {
  const startDate = new Date(year, month - 1, 1);
  return {
    month,
    year,
    startDate: startOfMonth(startDate),
    endDate: endOfMonth(startDate),
  };
}

/**
 * Get pay period based on payment frequency
 *
 * Creates the correct period boundaries based on the employee's payment frequency:
 * - monthly: full calendar month
 * - bi_weekly: 14 days ending on paymentDate
 * - weekly: 7 days ending on paymentDate
 * - daily/hourly: single day (paymentDate)
 *
 * @param frequency - Payment frequency
 * @param paymentDate - Date of payment (used as end of period for non-monthly)
 * @param month - Month (1-12) for accounting purposes
 * @param year - Year for accounting purposes
 * @returns Pay period with appropriate boundaries
 */
export function getPayPeriodForFrequency(
  frequency: PaymentFrequency,
  paymentDate: Date,
  month: number,
  year: number
): PayPeriodInfo & { workingDays: number } {
  switch (frequency) {
    case 'monthly': {
      const period = getPayPeriod(month, year);
      const workingDays = getWorkingDaysInMonth(year, month);
      return { ...period, workingDays };
    }

    case 'bi_weekly': {
      // 14-day period ending on paymentDate
      const endDate = startOfDay(paymentDate);
      const startDate = addDays(endDate, -13); // 14 days total (0-13)
      const workingDays = countWeekdaysInRange(startDate, endDate);
      return { month, year, startDate, endDate, workingDays };
    }

    case 'weekly': {
      // 7-day period ending on paymentDate
      const endDate = startOfDay(paymentDate);
      const startDate = addDays(endDate, -6); // 7 days total (0-6)
      const workingDays = countWeekdaysInRange(startDate, endDate);
      return { month, year, startDate, endDate, workingDays };
    }

    case 'daily':
    case 'hourly': {
      // Single day period
      const date = startOfDay(paymentDate);
      const workingDays = isWeekday(date) ? 1 : 0;
      return { month, year, startDate: date, endDate: date, workingDays };
    }

    default:
      // Fallback to monthly
      return getPayPeriodForFrequency('monthly', paymentDate, month, year);
  }
}

/**
 * Count weekdays (Mon-Fri) in a date range (inclusive)
 */
function countWeekdaysInRange(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isWeekday(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Get current pay period
 */
export function getCurrentPeriod(date = new Date()): { year: number; month: number } {
  const d = new Date(date);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
}

/**
 * Get working days in a month
 */
export function getWorkingDaysInMonth(year: number, month: number): number {
  const start = new Date(year, month - 1, 1);
  const end = endOfMonth(start);
  let count = 0;
  
  const current = new Date(start);
  while (current <= end) {
    if (isWeekday(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Get total days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ============================================================================
// Employment Date Functions
// ============================================================================

/**
 * Calculate probation end date
 */
export function calculateProbationEnd(
  hireDate: Date,
  probationMonths: number
): Date | null {
  if (!probationMonths || probationMonths <= 0) return null;
  return addMonths(hireDate, probationMonths);
}

/**
 * Check if employee is on probation
 */
export function isOnProbation(
  probationEndDate: Date | null | undefined,
  now = new Date()
): boolean {
  if (!probationEndDate) return false;
  return now < new Date(probationEndDate);
}

/**
 * Calculate years of service
 */
export function calculateYearsOfService(
  hireDate: Date,
  terminationDate?: Date | null
): number {
  const end = terminationDate || new Date();
  const days = diffInDays(hireDate, end);
  return Math.max(0, Math.floor((days / 365.25) * 10) / 10);
}

// ============================================================================
// Range Functions
// ============================================================================

/**
 * Check if a date is within a range
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const checkDate = new Date(date);
  return checkDate >= new Date(start) && checkDate <= new Date(end);
}

/**
 * Check if an item with effectiveFrom/effectiveTo dates is effective for a given period.
 *
 * Used for filtering allowances, deductions, and other time-bounded compensation items.
 * An item is considered effective if its date range overlaps with the period.
 *
 * @param item - Object with optional effectiveFrom and effectiveTo dates
 * @param periodStart - Start of the period to check
 * @param periodEnd - End of the period to check
 * @returns true if the item is effective during any part of the period
 *
 * @example
 * ```typescript
 * const allowance = { effectiveFrom: new Date('2024-01-01'), effectiveTo: null };
 * const periodStart = new Date('2024-03-01');
 * const periodEnd = new Date('2024-03-31');
 *
 * isEffectiveForPeriod(allowance, periodStart, periodEnd); // true
 * ```
 */
export function isEffectiveForPeriod(
  item: { effectiveFrom?: Date | null; effectiveTo?: Date | null },
  periodStart: Date,
  periodEnd: Date
): boolean {
  const effectiveFrom = item.effectiveFrom ? new Date(item.effectiveFrom) : new Date(0);
  const effectiveTo = item.effectiveTo ? new Date(item.effectiveTo) : new Date('2099-12-31');

  // Item is effective if its range overlaps with the period
  return effectiveFrom <= periodEnd && effectiveTo >= periodStart;
}

/**
 * Get date range for a pay period
 */
export function getPayPeriodDateRange(
  month: number,
  year: number
): { start: Date; end: Date } {
  const period = getPayPeriod(month, year);
  return { start: period.startDate, end: period.endDate };
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format date for database storage
 */
export function formatDateForDB(date: Date): string {
  if (!date) return '';
  return new Date(date).toISOString();
}

/**
 * Parse date from database
 */
export function parseDBDate(dateString: string): Date | null {
  if (!dateString) return null;
  return new Date(dateString);
}

/**
 * Format period as string (e.g., "01/2025")
 */
export function formatPeriod({ month, year }: { month: number; year: number }): string {
  return `${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Parse period string back to object
 */
export function parsePeriod(periodString: string): { month: number; year: number } {
  const [month, year] = periodString.split('/').map(Number);
  return { month, year };
}

/**
 * Format month name
 */
export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[month - 1] || '';
}

/**
 * Format short month name
 */
export function getShortMonthName(month: number): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return months[month - 1] || '';
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  toUTCDateString,
  addDays,
  addMonths,
  addYears,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  diffInDays,
  diffInMonths,
  diffInYears,
  daysBetween,
  monthsBetween,
  isWeekday,
  isWeekend,
  getDayOfWeek,
  getDayName,
  getPayPeriod,
  getCurrentPeriod,
  getWorkingDaysInMonth,
  getDaysInMonth,
  calculateProbationEnd,
  isOnProbation,
  calculateYearsOfService,
  isDateInRange,
  isEffectiveForPeriod,
  getPayPeriodDateRange,
  formatDateForDB,
  parseDBDate,
  formatPeriod,
  parsePeriod,
  getMonthName,
  getShortMonthName,
};


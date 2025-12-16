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
// Date Differences
// ============================================================================

/**
 * Calculate difference in days between two dates
 */
export function diffInDays(start: Date, end: Date): number {
  return Math.ceil(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  );
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
 * Get pay period for a given month and year
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
  getPayPeriodDateRange,
  formatDateForDB,
  parseDBDate,
  formatPeriod,
  parsePeriod,
  getMonthName,
  getShortMonthName,
};


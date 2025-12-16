/**
 * @classytic/payroll - Calculation Utilities
 *
 * Pure, functional, composable financial calculations
 * No side effects, highly testable
 */

import type {
  Allowance,
  Deduction,
  Compensation,
  TaxCalculationResult,
  CompensationBreakdownResult,
  ProRatingResult,
  PayPeriodInfo,
} from '../types.js';
import { diffInDays } from './date.js';

// ============================================================================
// Basic Math Operations
// ============================================================================

/**
 * Sum array of numbers
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((total, n) => total + n, 0);
}

/**
 * Sum by property
 */
export function sumBy<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((total, item) => total + getter(item), 0);
}

/**
 * Sum allowances
 */
export function sumAllowances(allowances: Array<{ amount: number }>): number {
  return sumBy(allowances, (a) => a.amount);
}

/**
 * Sum deductions
 */
export function sumDeductions(deductions: Array<{ amount: number }>): number {
  return sumBy(deductions, (d) => d.amount);
}

/**
 * Apply percentage to amount
 */
export function applyPercentage(amount: number, percentage: number): number {
  return Math.round(amount * (percentage / 100));
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Round to decimal places
 */
export function roundTo(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// Salary Calculations
// ============================================================================

/**
 * Calculate gross salary from base and allowances
 */
export function calculateGross(
  baseAmount: number,
  allowances: Array<{ amount: number }>
): number {
  return baseAmount + sumAllowances(allowances);
}

/**
 * Calculate net salary from gross and deductions
 */
export function calculateNet(
  gross: number,
  deductions: Array<{ amount: number }>
): number {
  return Math.max(0, gross - sumDeductions(deductions));
}

/**
 * Calculate total compensation
 */
export function calculateTotalCompensation(
  baseAmount: number,
  allowances: Array<{ amount: number }>,
  deductions: Array<{ amount: number }>
): { gross: number; net: number; deductions: number } {
  const gross = calculateGross(baseAmount, allowances);
  const totalDeductions = sumDeductions(deductions);
  const net = calculateNet(gross, deductions);
  return { gross, net, deductions: totalDeductions };
}

// ============================================================================
// Allowance & Deduction Calculation
// ============================================================================

/**
 * Calculate allowance amount (handles percentage-based)
 */
export function calculateAllowanceAmount(
  allowance: Pick<Allowance, 'amount' | 'isPercentage' | 'value'>,
  baseAmount: number
): number {
  if (allowance.isPercentage && allowance.value !== undefined) {
    return applyPercentage(baseAmount, allowance.value);
  }
  return allowance.amount;
}

/**
 * Calculate deduction amount (handles percentage-based)
 */
export function calculateDeductionAmount(
  deduction: Pick<Deduction, 'amount' | 'isPercentage' | 'value'>,
  baseAmount: number
): number {
  if (deduction.isPercentage && deduction.value !== undefined) {
    return applyPercentage(baseAmount, deduction.value);
  }
  return deduction.amount;
}

/**
 * Calculate all allowances with their actual amounts
 */
export function calculateAllowances(
  allowances: Allowance[],
  baseAmount: number
): Array<Allowance & { calculatedAmount: number }> {
  return allowances.map((allowance) => ({
    ...allowance,
    calculatedAmount: calculateAllowanceAmount(allowance, baseAmount),
  }));
}

/**
 * Calculate all deductions with their actual amounts
 */
export function calculateDeductions(
  deductions: Deduction[],
  baseAmount: number
): Array<Deduction & { calculatedAmount: number }> {
  return deductions.map((deduction) => ({
    ...deduction,
    calculatedAmount: calculateDeductionAmount(deduction, baseAmount),
  }));
}

// ============================================================================
// Compensation Breakdown
// ============================================================================

/**
 * Calculate full compensation breakdown
 */
export function calculateCompensationBreakdown(
  compensation: Pick<Compensation, 'baseAmount' | 'allowances' | 'deductions'>
): CompensationBreakdownResult {
  const { baseAmount, allowances = [], deductions = [] } = compensation;

  const calculatedAllowances = calculateAllowances(allowances, baseAmount);
  const calculatedDeductions = calculateDeductions(deductions, baseAmount);

  const grossAmount =
    baseAmount + sumBy(calculatedAllowances, (a) => a.calculatedAmount);
  const netAmount =
    grossAmount - sumBy(calculatedDeductions, (d) => d.calculatedAmount);

  return {
    baseAmount,
    allowances: calculatedAllowances,
    deductions: calculatedDeductions,
    grossAmount,
    netAmount: Math.max(0, netAmount),
  };
}

// ============================================================================
// Pro-Rating Calculations
// ============================================================================

/**
 * Calculate pro-rating for mid-month hires
 */
export function calculateProRating(
  hireDate: Date,
  periodStart: Date,
  periodEnd: Date
): ProRatingResult {
  const totalDays = diffInDays(periodStart, periodEnd) + 1;

  // Hired before period start - no pro-rating
  if (hireDate <= periodStart) {
    return {
      isProRated: false,
      totalDays,
      actualDays: totalDays,
      ratio: 1,
    };
  }

  // Hired during the period - pro-rate
  if (hireDate > periodStart && hireDate <= periodEnd) {
    const actualDays = diffInDays(hireDate, periodEnd) + 1;
    const ratio = actualDays / totalDays;

    return {
      isProRated: true,
      totalDays,
      actualDays,
      ratio,
    };
  }

  // Hired after period - no work days
  return {
    isProRated: false,
    totalDays,
    actualDays: 0,
    ratio: 0,
  };
}

/**
 * Apply pro-rating to an amount
 */
export function applyProRating(
  amount: number,
  proRating: ProRatingResult
): number {
  return Math.round(amount * proRating.ratio);
}

/**
 * Calculate pro-rated salary
 */
export function calculateProRatedSalary(
  baseAmount: number,
  hireDate: Date,
  period: PayPeriodInfo
): { amount: number; proRating: ProRatingResult } {
  const proRating = calculateProRating(hireDate, period.startDate, period.endDate);
  const amount = applyProRating(baseAmount, proRating);
  return { amount, proRating };
}

// ============================================================================
// Tax Calculations
// ============================================================================

/**
 * Apply tax brackets to calculate tax
 */
export function applyTaxBrackets(
  amount: number,
  brackets: Array<{ min: number; max: number; rate: number }>
): number {
  let tax = 0;

  for (const bracket of brackets) {
    if (amount > bracket.min) {
      const taxableAmount = Math.min(amount, bracket.max) - bracket.min;
      tax += taxableAmount * bracket.rate;
    }
  }

  return Math.round(tax);
}

/**
 * Calculate tax with result
 */
export function calculateTax(
  amount: number,
  brackets: Array<{ min: number; max: number; rate: number }>
): TaxCalculationResult {
  const tax = applyTaxBrackets(amount, brackets);
  return {
    gross: amount,
    tax,
    net: amount - tax,
  };
}

// ============================================================================
// Functional Composition
// ============================================================================

/**
 * Pipe functions left-to-right
 * pipe(f, g, h)(x) === h(g(f(x)))
 */
export function pipe<T>(...fns: Array<(value: T) => T>): (value: T) => T {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value);
}

/**
 * Compose functions right-to-left
 * compose(f, g, h)(x) === f(g(h(x)))
 */
export function compose<T>(...fns: Array<(value: T) => T>): (value: T) => T {
  return (value: T) => fns.reduceRight((acc, fn) => fn(acc), value);
}

/**
 * Create an allowance calculator factory
 */
export function createAllowanceCalculator(
  allowances: Allowance[]
): (baseSalary: number) => Array<Allowance & { calculatedAmount: number }> {
  return (baseSalary: number) => calculateAllowances(allowances, baseSalary);
}

/**
 * Create a deduction calculator factory
 */
export function createDeductionCalculator(
  deductions: Deduction[]
): (baseSalary: number) => Array<Deduction & { calculatedAmount: number }> {
  return (baseSalary: number) => calculateDeductions(deductions, baseSalary);
}

// ============================================================================
// Overtime Calculations
// ============================================================================

/**
 * Calculate overtime pay
 */
export function calculateOvertime(
  hourlyRate: number,
  overtimeHours: number,
  multiplier = 1.5
): number {
  return Math.round(hourlyRate * overtimeHours * multiplier);
}

/**
 * Calculate hourly rate from monthly salary
 */
export function calculateHourlyRate(
  monthlySalary: number,
  hoursPerMonth = 176 // 44 hours/week * 4 weeks
): number {
  return Math.round(monthlySalary / hoursPerMonth);
}

/**
 * Calculate daily rate from monthly salary
 */
export function calculateDailyRate(
  monthlySalary: number,
  daysPerMonth = 22
): number {
  return Math.round(monthlySalary / daysPerMonth);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  sum,
  sumBy,
  sumAllowances,
  sumDeductions,
  applyPercentage,
  calculatePercentage,
  roundTo,
  calculateGross,
  calculateNet,
  calculateTotalCompensation,
  calculateAllowanceAmount,
  calculateDeductionAmount,
  calculateAllowances,
  calculateDeductions,
  calculateCompensationBreakdown,
  calculateProRating,
  applyProRating,
  calculateProRatedSalary,
  applyTaxBrackets,
  calculateTax,
  pipe,
  compose,
  createAllowanceCalculator,
  createDeductionCalculator,
  calculateOvertime,
  calculateHourlyRate,
  calculateDailyRate,
};


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
} from '../types.js';
import { roundMoney } from './money.js';

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
 * ROUNDING POLICY FOR FINANCIAL CALCULATIONS
 *
 * Monetary amounts are stored as floating point numbers in major units with
 * decimal precision (e.g., 1000.50 for $1,000.50 or ₹1,000.50).
 *
 * PRECISION: All calculations preserve 2 decimal places (cent/paise precision)
 * to maintain accuracy required for payroll compliance.
 *
 * Rounding Rules:
 * 1. Banker's Rounding (Round Half to Even): Used for fair rounding over many transactions
 * 2. All intermediate calculations maintain full precision
 * 3. Final amounts rounded to 2 decimals using banker's rounding
 * 4. Tax calculations use banker's rounding for compliance
 *
 * Example:
 *   Input: 1000.50 base + 15% tax
 *   Calculation: 1000.50 * 0.15 = 150.075 → rounds to 150.08 (banker's rounding to 2 decimals)
 *   Result: Tax = 150.08
 *
 * @see https://en.wikipedia.org/wiki/Rounding#Round_half_to_even
 */

/**
 * Banker's Rounding (Round Half to Even) - Integer precision
 *
 * Rounds to the nearest integer using banker's rounding (round half to even).
 * This prevents systematic bias in rounding over many transactions.
 *
 * Uses epsilon check for safe floating-point comparison.
 *
 * Examples:
 *   0.5 → 0 (even)
 *   1.5 → 2 (even)
 *   2.5 → 2 (even)
 *   3.5 → 4 (even)
 *
 * @param value - The number to round
 * @returns Rounded integer
 * @note For money calculations with decimal precision, use `roundMoney()` instead
 */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;

  // Use epsilon check for safer floating-point comparison
  if (Math.abs(fraction - 0.5) < Number.EPSILON) {
    // If halfway, round to even
    return floor % 2 === 0 ? floor : floor + 1;
  }

  // Otherwise use standard rounding
  return Math.round(value);
}

/**
 * Apply percentage to amount with banker's rounding (2 decimal precision)
 *
 * @param amount - Amount in major units (e.g., dollars, rupees)
 * @param percentage - Percentage to apply (e.g., 15 for 15%)
 * @param decimals - Decimal places for precision (default: 2 for cent precision)
 * @returns Result in major units, properly rounded to 2 decimals
 * @note Uses banker's rounding (round half to even) to preserve cent precision.
 *       Equivalent to percentageOf() from money.ts.
 */
export function applyPercentage(amount: number, percentage: number, decimals = 2): number {
  // Use centralized roundMoney for consistent banker's rounding across codebase
  const result = (amount * percentage) / 100;
  return roundMoney(result, decimals);
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(part: number, total: number): number {
  return total > 0 ? bankersRound((part / total) * 100) : 0;
}

/**
 * Round to decimal places using banker's rounding
 */
export function roundTo(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return bankersRound(value * factor) / factor;
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
// Tax Calculations
// ============================================================================

/**
 * Apply tax brackets to calculate tax
 *
 * Uses banker's rounding for compliance (rounds to 2 decimal places).
 * Consistent with all other money calculations in the system.
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

  // Use roundMoney for consistency with all other money calculations
  return roundMoney(tax);
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
  return roundMoney(hourlyRate * overtimeHours * multiplier, 2);
}

/**
 * Calculate hourly rate from monthly salary
 */
export function calculateHourlyRate(
  monthlySalary: number,
  hoursPerMonth = 176 // 44 hours/week * 4 weeks
): number {
  return roundMoney(monthlySalary / hoursPerMonth, 2);
}

/**
 * Calculate daily rate from monthly salary
 */
export function calculateDailyRate(
  monthlySalary: number,
  daysPerMonth = 22
): number {
  return roundMoney(monthlySalary / daysPerMonth, 2);
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
  applyTaxBrackets,
  calculateTax,
  calculateOvertime,
  calculateHourlyRate,
  calculateDailyRate,
};


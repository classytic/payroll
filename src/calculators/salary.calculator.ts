/**
 * @classytic/payroll - Salary Calculator
 *
 * Pure functions for complete salary breakdown calculations.
 * No database dependencies - can be used client-side!
 *
 * This is the SINGLE SOURCE OF TRUTH for all salary calculations.
 *
 * @packageDocumentation
 */

import type {
  Compensation,
  PayrollBreakdown,
  Allowance,
  Deduction,
  TaxBracket,
} from '../types.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions, applyTaxBrackets } from '../utils/calculation.js';
import { countWorkingDays } from '../core/config.js';
import { calculateProRating, type ProRatingInput, type ProRatingResult } from './prorating.calculator.js';
import { calculateAttendanceDeduction, calculateDailyRate, type AttendanceDeductionInput } from './attendance.calculator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for salary breakdown calculation
 */
export interface SalaryCalculationInput {
  /**
   * Employee data (minimal subset needed for calculation)
   */
  employee: {
    hireDate: Date;
    terminationDate?: Date | null;
    compensation: Compensation;
    workSchedule?: {
      workingDays?: number[];
      hoursPerDay?: number;
    };
  };

  /**
   * Salary period
   */
  period: {
    month: number;
    year: number;
    startDate: Date;
    endDate: Date;
  };

  /**
   * Attendance data (optional)
   */
  attendance?: {
    expectedDays?: number;
    actualDays?: number;
  } | null;

  /**
   * Processing options
   */
  options?: {
    holidays?: Date[];
    workSchedule?: {
      workingDays?: number[];
      hoursPerDay?: number;
    };
    skipTax?: boolean;
    skipAttendance?: boolean;
    skipProration?: boolean;
  };

  /**
   * Configuration (minimal subset)
   */
  config: {
    allowProRating: boolean;
    autoDeductions: boolean;
    defaultCurrency: string;
    attendanceIntegration: boolean;
  };

  /**
   * Tax brackets for the employee's currency
   */
  taxBrackets: TaxBracket[];
}

/**
 * Processed allowance with calculated amount
 */
export interface ProcessedAllowance {
  type: string;
  amount: number;
  taxable: boolean;
  originalAmount?: number; // Before pro-rating
  isPercentage?: boolean;
  value?: number;
}

/**
 * Processed deduction with calculated amount
 */
export interface ProcessedDeduction {
  type: string;
  amount: number;
  description?: string;
  originalAmount?: number; // Before pro-rating
  isPercentage?: boolean;
  value?: number;
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Calculate complete salary breakdown
 *
 * This is the SINGLE SOURCE OF TRUTH for salary calculations.
 * All payroll processing uses this function.
 *
 * @example
 * ```typescript
 * const breakdown = calculateSalaryBreakdown({
 *   employee: {
 *     hireDate: new Date('2024-01-01'),
 *     compensation: {
 *       baseAmount: 100000,
 *       currency: 'USD',
 *       allowances: [{ type: 'housing', amount: 20000, taxable: true }],
 *       deductions: [{ type: 'insurance', amount: 5000 }],
 *     },
 *   },
 *   period: {
 *     month: 3,
 *     year: 2024,
 *     startDate: new Date('2024-03-01'),
 *     endDate: new Date('2024-03-31'),
 *   },
 *   attendance: {
 *     expectedDays: 22,
 *     actualDays: 20, // 2 days absent
 *   },
 *   options: {
 *     holidays: [new Date('2024-03-26')],
 *   },
 *   config: {
 *     allowProRating: true,
 *     autoDeductions: true,
 *     defaultCurrency: 'USD',
 *     attendanceIntegration: true,
 *   },
 *   taxBrackets: [...],
 * });
 * ```
 *
 * @param input - Salary calculation parameters
 * @returns Complete payroll breakdown
 *
 * @pure This function has no side effects and doesn't access database
 */
export function calculateSalaryBreakdown(input: SalaryCalculationInput): PayrollBreakdown {
  const { employee, period, attendance, options = {}, config, taxBrackets } = input;

  const comp = employee.compensation;
  const originalBaseAmount = comp.baseAmount;

  // 1. Calculate pro-rating (if applicable)
  const proRating = calculateProRatingForSalary(
    employee.hireDate,
    employee.terminationDate || null,
    period.startDate,
    period.endDate,
    options,
    employee.workSchedule
  );

  // 2. Apply pro-rating to base salary
  let baseAmount = originalBaseAmount;
  if (proRating.isProRated && config.allowProRating && !options.skipProration) {
    baseAmount = Math.round(baseAmount * proRating.ratio);
  }

  // 3. Filter allowances by effective date
  const effectiveAllowances = (comp.allowances || [])
    .filter((a) => isEffectiveForPeriod(a, period.startDate, period.endDate));

  // 4. Filter deductions by effective date
  const effectiveDeductions = (comp.deductions || [])
    .filter((d) => isEffectiveForPeriod(d, period.startDate, period.endDate))
    .filter((d) => d.auto || d.recurring);

  // 5. Calculate allowances (handle percentages and pro-rating)
  const allowances = processAllowances(effectiveAllowances, originalBaseAmount, proRating, config);

  // 6. Calculate deductions (handle percentages and pro-rating)
  const deductions = processDeductions(effectiveDeductions, originalBaseAmount, proRating, config);

  // 7. Calculate attendance deduction
  if (!options.skipAttendance && config.attendanceIntegration && attendance) {
    const attendanceDeductionResult = calculateAttendanceDeductionFromData(
      attendance,
      baseAmount,
      proRating.effectiveWorkingDays
    );

    if (attendanceDeductionResult.hasDeduction) {
      deductions.push({
        type: 'absence',
        amount: attendanceDeductionResult.deductionAmount,
        description: `Unpaid leave deduction (${attendanceDeductionResult.absentDays} days)`,
      });
    }
  }

  // 8. Calculate gross salary
  const grossSalary = calculateGross(baseAmount, allowances);

  // 9. Calculate taxable amount (only taxable allowances)
  const taxableAllowances = allowances.filter((a) => a.taxable);
  const taxableAmount = baseAmount + sumAllowances(taxableAllowances);

  // 10. Calculate tax
  let taxAmount = 0;
  if (!options.skipTax && taxBrackets.length > 0 && config.autoDeductions) {
    // Annualize the taxable amount for tax bracket calculation
    const annualTaxable = taxableAmount * 12;
    const annualTax = applyTaxBrackets(annualTaxable, taxBrackets);
    taxAmount = Math.round(annualTax / 12); // Monthly tax
  }

  // Add tax to deductions if applicable
  if (taxAmount > 0) {
    deductions.push({
      type: 'tax',
      amount: taxAmount,
      description: 'Income tax',
    });
  }

  // 11. Calculate net salary
  const netSalary = calculateNet(grossSalary, deductions);

  // 12. Build final breakdown
  return {
    baseAmount,
    allowances,
    deductions,
    grossSalary,
    netSalary,
    taxableAmount,
    taxAmount,
    workingDays: proRating.periodWorkingDays,
    actualDays: proRating.effectiveWorkingDays,
    proRatedAmount: (proRating.isProRated && !options.skipProration) ? baseAmount : 0,
    attendanceDeduction: attendance
      ? deductions.find((d) => d.type === 'absence')?.amount || 0
      : 0,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if allowance/deduction is effective for a given period
 */
function isEffectiveForPeriod(
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
 * Calculate pro-rating for salary calculation
 */
function calculateProRatingForSalary(
  hireDate: Date,
  terminationDate: Date | null,
  periodStart: Date,
  periodEnd: Date,
  options: SalaryCalculationInput['options'],
  employeeWorkSchedule?: { workingDays?: number[] }
): ProRatingResult {
  // Work schedule: prefer operation override, then employee schedule, then Mon-Fri default
  const workingDays =
    options?.workSchedule?.workingDays ||
    employeeWorkSchedule?.workingDays ||
    [1, 2, 3, 4, 5];

  const holidays = options?.holidays || [];

  return calculateProRating({
    hireDate,
    terminationDate,
    periodStart,
    periodEnd,
    workingDays,
    holidays,
  });
}

/**
 * Process allowances (handle percentages and pro-rating)
 */
function processAllowances(
  allowances: Allowance[],
  originalBaseAmount: number,
  proRating: ProRatingResult,
  config: SalaryCalculationInput['config']
): ProcessedAllowance[] {
  return allowances.map((a) => {
    // Calculate from original base (percentage) or use fixed amount
    let amount = a.isPercentage && a.value !== undefined
      ? Math.round((originalBaseAmount * a.value) / 100)
      : a.amount;

    const originalAmount = amount;

    // Apply pro-rating ONCE if needed
    if (proRating.isProRated && config.allowProRating) {
      amount = Math.round(amount * proRating.ratio);
    }

    return {
      type: a.type,
      amount,
      taxable: a.taxable ?? true,
      originalAmount,
      isPercentage: a.isPercentage,
      value: a.value,
    };
  });
}

/**
 * Process deductions (handle percentages and pro-rating)
 */
function processDeductions(
  deductions: Deduction[],
  originalBaseAmount: number,
  proRating: ProRatingResult,
  config: SalaryCalculationInput['config']
): ProcessedDeduction[] {
  return deductions.map((d) => {
    // Calculate from original base (percentage) or use fixed amount
    let amount = d.isPercentage && d.value !== undefined
      ? Math.round((originalBaseAmount * d.value) / 100)
      : d.amount;

    const originalAmount = amount;

    // Apply pro-rating ONCE if needed
    if (proRating.isProRated && config.allowProRating) {
      amount = Math.round(amount * proRating.ratio);
    }

    return {
      type: d.type,
      amount,
      description: d.description,
      originalAmount,
      isPercentage: d.isPercentage,
      value: d.value,
    };
  });
}

/**
 * Calculate attendance deduction from attendance data
 */
function calculateAttendanceDeductionFromData(
  attendance: { expectedDays?: number; actualDays?: number },
  baseAmount: number,
  effectiveWorkingDays: number
): {
  hasDeduction: boolean;
  deductionAmount: number;
  absentDays: number;
} {
  const expectedDays = attendance.expectedDays ?? effectiveWorkingDays;
  const actualDays = attendance.actualDays;

  if (actualDays === undefined) {
    return { hasDeduction: false, deductionAmount: 0, absentDays: 0 };
  }

  // Daily rate based on expected working days for THIS employee in THIS period
  const dailyRate = calculateDailyRate(baseAmount, expectedDays);

  const result = calculateAttendanceDeduction({
    expectedWorkingDays: expectedDays,
    actualWorkingDays: actualDays,
    dailyRate,
  });

  return {
    hasDeduction: result.hasDeduction,
    deductionAmount: result.deductionAmount,
    absentDays: result.absentDays,
  };
}


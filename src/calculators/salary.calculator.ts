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
  TaxCalculationOptions,
  PaymentFrequency,
} from '../types.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions, applyTaxBrackets } from '../utils/calculation.js';
import { roundMoney, percentageOf, prorateAmount } from '../utils/money.js';
import { isEffectiveForPeriod } from '../utils/date.js';
import { countWorkingDays } from '../core/config.js';
import { getPayPeriodsPerYear } from '../config.js';
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

  /**
   * Enhanced tax calculation options (optional)
   *
   * When provided, enables jurisdiction-aware tax calculation with:
   * - Standard deduction / tax-free threshold
   * - Demographic-based thresholds (senior, disabled, etc.)
   * - Pre-tax deductions handling
   * - Tax credits/rebates
   *
   * @example
   * ```typescript
   * taxOptions: {
   *   applyStandardDeduction: true,
   *   taxpayerCategory: 'senior',
   *   preTaxDeductions: [{ type: 'provident_fund', amount: 5000 }],
   *   taxCredits: [{ type: 'investment', amount: 2000 }],
   * }
   * ```
   */
  taxOptions?: TaxCalculationOptions;

  /**
   * Jurisdiction tax configuration (optional)
   *
   * When provided alongside taxOptions, enables lookup of:
   * - standardDeduction from jurisdiction
   * - thresholdsByCategory for taxpayer category
   * - preTaxDeductionTypes for automatic pre-tax detection
   */
  jurisdictionTaxConfig?: {
    /** Standard deduction amount (annual) */
    standardDeduction?: number;
    /** Tax-free thresholds by taxpayer category (annual) */
    thresholdsByCategory?: Record<string, number>;
    /** Recognized pre-tax deduction types */
    preTaxDeductionTypes?: string[];
  };
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
  const { employee, period, attendance, options = {}, config, taxBrackets, taxOptions, jurisdictionTaxConfig } = input;

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
    baseAmount = prorateAmount(baseAmount, proRating.ratio);
  }

  // 3. Filter allowances by effective date
  const effectiveAllowances = (comp.allowances || [])
    .filter((a) => isEffectiveForPeriod(a, period.startDate, period.endDate));

  // 4. Filter deductions by effective date
  const effectiveDeductions = (comp.deductions || [])
    .filter((d) => isEffectiveForPeriod(d, period.startDate, period.endDate))
    .filter((d) => d.auto || d.recurring);

  // 5. Calculate allowances (handle percentages and pro-rating)
  const allowances = processAllowances(effectiveAllowances, originalBaseAmount, proRating, config, options.skipProration);

  // 6. Calculate deductions (handle percentages and pro-rating)
  const deductions = processDeductions(effectiveDeductions, originalBaseAmount, proRating, config, options.skipProration);

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

  // 9. Calculate taxable amount with enhanced tax options
  const taxableAllowances = allowances.filter((a) => a.taxable);
  let taxableAmount = baseAmount + sumAllowances(taxableAllowances);

  // 9a. Apply pre-tax deductions (reduce taxable income)
  const preTaxDeductionAmount = calculatePreTaxDeductions(
    effectiveDeductions,
    deductions,
    taxOptions,
    jurisdictionTaxConfig
  );
  taxableAmount = Math.max(0, taxableAmount - preTaxDeductionAmount);

  // 10. Calculate tax with enhanced options (frequency-aware)
  const frequency = employee.compensation?.frequency || 'monthly';
  let taxAmount = 0;
  if (!options.skipTax && taxBrackets.length > 0 && config.autoDeductions) {
    taxAmount = calculateEnhancedTax(
      taxableAmount,
      taxBrackets,
      taxOptions,
      jurisdictionTaxConfig,
      frequency
    );
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
  config: SalaryCalculationInput['config'],
  skipProration?: boolean
): ProcessedAllowance[] {
  return allowances.map((a) => {
    // Calculate from original base (percentage) or use fixed amount
    let amount = a.isPercentage && a.value !== undefined
      ? percentageOf(originalBaseAmount, a.value)
      : a.amount;

    const originalAmount = amount;

    // Apply pro-rating ONCE if needed (respect skipProration flag)
    if (proRating.isProRated && config.allowProRating && !skipProration) {
      amount = prorateAmount(amount, proRating.ratio);
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
  config: SalaryCalculationInput['config'],
  skipProration?: boolean
): ProcessedDeduction[] {
  return deductions.map((d) => {
    // Calculate from original base (percentage) or use fixed amount
    let amount = d.isPercentage && d.value !== undefined
      ? percentageOf(originalBaseAmount, d.value)
      : d.amount;

    const originalAmount = amount;

    // Apply pro-rating ONCE if needed (respect skipProration flag)
    if (proRating.isProRated && config.allowProRating && !skipProration) {
      amount = prorateAmount(amount, proRating.ratio);
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

/**
 * Calculate total pre-tax deductions (monthly)
 *
 * Pre-tax deductions reduce taxable income before tax brackets are applied.
 * Sources:
 * 1. Employee deductions with reducesTaxableIncome=true
 * 2. Deductions matching jurisdictionTaxConfig.preTaxDeductionTypes
 * 3. Explicit taxOptions.preTaxDeductions
 */
function calculatePreTaxDeductions(
  effectiveDeductions: Deduction[],
  processedDeductions: ProcessedDeduction[],
  taxOptions?: TaxCalculationOptions,
  jurisdictionTaxConfig?: SalaryCalculationInput['jurisdictionTaxConfig']
): number {
  let totalPreTax = 0;

  // NOTE: effectiveDeductions[i] and processedDeductions[i] are 1:1 aligned.
  // processDeductions() builds processedDeductions from effectiveDeductions in order.
  // Attendance deductions are appended to processedDeductions AFTER this array is built,
  // so they won't be iterated here (effectiveDeductions.length < processedDeductions.length
  // when attendance deductions exist, but we only iterate up to effectiveDeductions.length).

  // 1. Sum deductions marked as reducesTaxableIncome
  for (let i = 0; i < effectiveDeductions.length; i++) {
    const original = effectiveDeductions[i];
    const processed = processedDeductions[i];

    if (original.reducesTaxableIncome) {
      totalPreTax += processed?.amount || 0;
    }
  }

  // 2. Sum deductions matching jurisdiction's preTaxDeductionTypes
  if (jurisdictionTaxConfig?.preTaxDeductionTypes?.length) {
    const preTaxTypes = new Set(jurisdictionTaxConfig.preTaxDeductionTypes);

    for (let i = 0; i < effectiveDeductions.length; i++) {
      const original = effectiveDeductions[i];
      const processed = processedDeductions[i];

      // Skip if already counted via reducesTaxableIncome
      if (original.reducesTaxableIncome) continue;

      // Check if deduction type is in pre-tax list
      if (preTaxTypes.has(original.type)) {
        totalPreTax += processed?.amount || 0;
      }
    }
  }

  // 3. Add explicit pre-tax deductions from taxOptions
  if (taxOptions?.preTaxDeductions?.length) {
    for (const deduction of taxOptions.preTaxDeductions) {
      totalPreTax += deduction.amount;
    }
  }

  return roundMoney(totalPreTax);
}

/**
 * Calculate tax with enhanced options
 *
 * Supports:
 * - Standard deduction / tax-free threshold
 * - Demographic-based thresholds (taxpayerCategory)
 * - Tax credits/rebates
 * - Multiple payment frequencies (weekly, bi_weekly, monthly, etc.)
 *
 * @param periodTaxable - Taxable amount for the pay period (after pre-tax deductions)
 * @param taxBrackets - Tax brackets (for annual income)
 * @param taxOptions - Enhanced tax calculation options
 * @param jurisdictionTaxConfig - Jurisdiction tax configuration
 * @param frequency - Payment frequency (determines periods per year)
 * @returns Tax amount for the pay period (after credits)
 */
function calculateEnhancedTax(
  periodTaxable: number,
  taxBrackets: TaxBracket[],
  taxOptions?: TaxCalculationOptions,
  jurisdictionTaxConfig?: SalaryCalculationInput['jurisdictionTaxConfig'],
  frequency: PaymentFrequency = 'monthly'
): number {
  // Get pay periods per year based on frequency
  const periodsPerYear = getPayPeriodsPerYear(frequency);

  // Annualize the taxable amount
  let annualTaxable = periodTaxable * periodsPerYear;

  // Apply standard deduction or threshold
  const threshold = getApplicableThreshold(taxOptions, jurisdictionTaxConfig);
  if (threshold > 0) {
    annualTaxable = Math.max(0, annualTaxable - threshold);
  }

  // Calculate tax using brackets
  let annualTax = applyTaxBrackets(annualTaxable, taxBrackets);

  // Apply tax credits (reduce tax liability)
  if (taxOptions?.taxCredits?.length && annualTax > 0) {
    annualTax = applyTaxCredits(annualTax, taxOptions.taxCredits);
  }

  // Return period tax (banker's rounding)
  return roundMoney(annualTax / periodsPerYear);
}

/**
 * Get applicable tax-free threshold based on options
 *
 * Priority:
 * 1. taxOptions.standardDeductionOverride (explicit override)
 * 2. taxOptions.thresholdOverrides[taxpayerCategory]
 * 3. jurisdictionTaxConfig.thresholdsByCategory[taxpayerCategory]
 * 4. jurisdictionTaxConfig.standardDeduction (if applyStandardDeduction)
 */
function getApplicableThreshold(
  taxOptions?: TaxCalculationOptions,
  jurisdictionTaxConfig?: SalaryCalculationInput['jurisdictionTaxConfig']
): number {
  // 1. Explicit override takes highest priority
  if (taxOptions?.standardDeductionOverride !== undefined) {
    return taxOptions.standardDeductionOverride;
  }

  // 2. Check taxpayer category thresholds
  if (taxOptions?.taxpayerCategory) {
    const category = taxOptions.taxpayerCategory;

    // Check override thresholds first
    if (taxOptions.thresholdOverrides?.[category] !== undefined) {
      return taxOptions.thresholdOverrides[category];
    }

    // Check jurisdiction thresholds
    if (jurisdictionTaxConfig?.thresholdsByCategory?.[category] !== undefined) {
      return jurisdictionTaxConfig.thresholdsByCategory[category];
    }
  }

  // 3. Fall back to standard deduction if enabled
  if (taxOptions?.applyStandardDeduction && jurisdictionTaxConfig?.standardDeduction) {
    return jurisdictionTaxConfig.standardDeduction;
  }

  return 0;
}

/**
 * Apply tax credits to reduce tax liability
 *
 * Credits with maxPercent are capped at that percentage of the original tax.
 * Credits cannot reduce tax below zero.
 */
function applyTaxCredits(
  annualTax: number,
  taxCredits: NonNullable<TaxCalculationOptions['taxCredits']>
): number {
  let remainingTax = annualTax;

  for (const credit of taxCredits) {
    if (remainingTax <= 0) break;

    let creditAmount = credit.amount;

    // Apply maxPercent cap if specified
    if (credit.maxPercent !== undefined && credit.maxPercent > 0) {
      const maxCredit = annualTax * credit.maxPercent;
      creditAmount = Math.min(creditAmount, maxCredit);
    }

    // Credit cannot exceed remaining tax
    creditAmount = Math.min(creditAmount, remainingTax);
    remainingTax -= creditAmount;
  }

  return Math.max(0, remainingTax);
}


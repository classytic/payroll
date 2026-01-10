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
  /** Reason for proration */
  reason: 'full' | 'new_hire' | 'termination' | 'both';
  /** Whether salary should be prorated */
  isProrated: boolean;
}

/** Tax calculation result */
export interface TaxResult {
  /** Tax amount */
  amount: number;
  /** Effective tax rate */
  effectiveRate: number;
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

/** Complete salary calculation result */
export interface SalaryCalculationResult {
  /** Original base salary */
  baseSalary: number;
  /** Prorated base salary */
  proratedBase: number;
  /** Total allowances */
  totalAllowances: number;
  /** Total deductions (excluding tax) */
  totalDeductions: number;
  /** Attendance deduction */
  attendanceDeduction: number;
  /** Gross salary (prorated base + allowances) */
  grossSalary: number;
  /** Tax amount */
  taxAmount: number;
  /** Net salary (gross - all deductions - tax) */
  netSalary: number;
  /** Proration details */
  proration: ProrationResult;
  /** Working days details */
  workingDays: WorkingDaysResult;
  /** Itemized breakdown */
  breakdown: {
    allowances: Array<{ type: string; amount: number; taxable: boolean }>;
    deductions: Array<{ type: string; amount: number }>;
  };
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default tax brackets (US federal example)
 * For multi-jurisdiction support, use the jurisdiction system instead
 */
export const DEFAULT_TAX_BRACKETS: Array<{ min: number; max: number; rate: number }> = [
  { min: 0, max: 10000, rate: 0.10 },
  { min: 10000, max: 40000, rate: 0.12 },
  { min: 40000, max: 85000, rate: 0.22 },
  { min: 85000, max: 165000, rate: 0.24 },
  { min: 165000, max: 215000, rate: 0.32 },
  { min: 215000, max: 540000, rate: 0.35 },
  { min: 540000, max: Infinity, rate: 0.37 },
];

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
    (options.holidays || []).map(d => new Date(d).toDateString())
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
    const isHoliday = holidaySet.has(current.toDateString());
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
    return { ratio: 0, reason: 'full', isProrated: true };
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

/**
 * Internal simple tax calculation
 * For multi-jurisdiction tax, use the jurisdiction system
 * @internal
 */
function calculateSimpleTax(
  monthlyIncome: number,
  brackets: Array<{ min: number; max: number; rate: number }> = DEFAULT_TAX_BRACKETS
): TaxResult {
  const annualIncome = monthlyIncome * 12;
  let annualTax = 0;

  for (const bracket of brackets) {
    if (annualIncome <= bracket.min) continue;
    const taxableInBracket = Math.min(annualIncome, bracket.max) - bracket.min;
    annualTax += taxableInBracket * bracket.rate;
  }

  const monthlyTax = Math.round(annualTax / 12);
  const effectiveRate = monthlyIncome > 0 ? monthlyTax / monthlyIncome : 0;

  return { amount: monthlyTax, effectiveRate };
}

/**
 * Calculate attendance deduction
 *
 * @example
 * const deduction = calculateAttendanceDeduction(22, 20, dailyRate);
 */
export function calculateAttendanceDeduction(
  expectedDays: number,
  actualDays: number,
  dailyRate: number,
  maxDeductionPercent = 100
): number {
  const absentDays = Math.max(0, expectedDays - actualDays);
  const deduction = Math.round(absentDays * dailyRate);
  const maxDeduction = Math.round((dailyRate * expectedDays * maxDeductionPercent) / 100);
  return Math.min(deduction, maxDeduction);
}

/**
 * Calculate complete salary breakdown
 *
 * This is the main function for salary calculation.
 * Pass all data from YOUR app, get back complete breakdown.
 *
 * Note: Uses simple tax calculation. For multi-jurisdiction tax,
 * use the jurisdiction system instead.
 *
 * @example
 * const result = calculateSalaryBreakdown({
 *   baseSalary: 100000,
 *   hireDate: employee.hireDate,
 *   terminationDate: employee.terminationDate,
 *   periodStart: new Date('2024-03-01'),
 *   periodEnd: new Date('2024-03-31'),
 *   allowances: [{ type: 'housing', amount: 20000, taxable: true }],
 *   deductions: [{ type: 'provident_fund', amount: 5000 }],
 *   options: { holidays: companyHolidays },
 *   attendance: { expectedDays: 22, actualDays: 20 },
 * });
 */
export function calculateSalaryBreakdown(params: {
  baseSalary: number;
  hireDate: Date;
  terminationDate?: Date | null;
  periodStart: Date;
  periodEnd: Date;
  allowances?: Array<{ type: string; amount: number; taxable?: boolean }>;
  deductions?: Array<{ type: string; amount: number }>;
  options?: PayrollProcessingOptions;
  attendance?: AttendanceInput;
}): SalaryCalculationResult {
  const {
    baseSalary,
    hireDate,
    terminationDate,
    periodStart,
    periodEnd,
    allowances = [],
    deductions = [],
    options = {},
    attendance,
  } = params;

  // 1. Calculate working days
  const workSchedule = { ...DEFAULT_WORK_SCHEDULE, ...options.workSchedule };
  const workingDays = countWorkingDays(periodStart, periodEnd, {
    workingDays: workSchedule.workingDays,
    holidays: options.holidays,
  });

  // 2. Calculate proration
  const proration = options.skipProration
    ? { ratio: 1, reason: 'full' as const, isProrated: false }
    : calculateProration(hireDate, terminationDate, periodStart, periodEnd);

  // 3. Prorate base salary
  const proratedBase = Math.round(baseSalary * proration.ratio);

  // 4. Process allowances (prorate)
  const processedAllowances = allowances.map(a => ({
    type: a.type,
    amount: Math.round(a.amount * proration.ratio),
    taxable: a.taxable ?? true,
  }));
  const totalAllowances = processedAllowances.reduce((sum, a) => sum + a.amount, 0);

  // 5. Process deductions (prorate)
  const processedDeductions = deductions.map(d => ({
    type: d.type,
    amount: Math.round(d.amount * proration.ratio),
  }));

  // 6. Attendance deduction
  let attendanceDeduction = 0;
  if (attendance && !options.skipAttendance && workingDays.workingDays > 0) {
    // Use expectedDays from attendance if provided, otherwise use working days from schedule
    const expectedDays = attendance.expectedDays ?? workingDays.workingDays;
    const dailyRate = proratedBase / expectedDays;
    attendanceDeduction = calculateAttendanceDeduction(
      expectedDays,
      attendance.actualDays,
      dailyRate
    );
    if (attendanceDeduction > 0) {
      processedDeductions.push({ type: 'attendance', amount: attendanceDeduction });
    }
  }

  // 7. Calculate gross salary
  const grossSalary = proratedBase + totalAllowances;

  // 8. Calculate tax (simple calculation - for multi-jurisdiction, use jurisdiction system)
  let taxAmount = 0;
  if (!options.skipTax) {
    const taxableAllowances = processedAllowances
      .filter(a => a.taxable)
      .reduce((sum, a) => sum + a.amount, 0);
    const taxableIncome = proratedBase + taxableAllowances;
    const taxResult = calculateSimpleTax(taxableIncome);
    taxAmount = taxResult.amount;
    if (taxAmount > 0) {
      processedDeductions.push({ type: 'tax', amount: taxAmount });
    }
  }

  // 9. Calculate net salary
  const totalDeductions = processedDeductions
    .filter(d => d.type !== 'tax')  // Exclude only tax, include attendance
    .reduce((sum, d) => sum + d.amount, 0);
  const netSalary = grossSalary - totalDeductions - taxAmount;

  return {
    baseSalary,
    proratedBase,
    totalAllowances,
    totalDeductions,
    attendanceDeduction,
    grossSalary,
    taxAmount,
    netSalary,
    proration,
    workingDays,
    breakdown: {
      allowances: processedAllowances,
      deductions: processedDeductions,
    },
  };
}

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


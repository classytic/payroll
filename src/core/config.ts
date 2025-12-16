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
  workDays: number[];
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
  /** Expected work days in period */
  expectedDays: number;
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
// Country Defaults
// ============================================================================

export const COUNTRY_DEFAULTS: Record<string, {
  currency: string;
  workDays: number[];
  taxBrackets: Array<{ min: number; max: number; rate: number }>;
}> = {
  US: {
    currency: 'USD',
    workDays: [1, 2, 3, 4, 5], // Mon-Fri
    taxBrackets: [
      { min: 0, max: 11000, rate: 0.10 },
      { min: 11000, max: 44725, rate: 0.12 },
      { min: 44725, max: 95375, rate: 0.22 },
      { min: 95375, max: 182100, rate: 0.24 },
      { min: 182100, max: Infinity, rate: 0.32 },
    ],
  },
  BD: {
    currency: 'BDT',
    workDays: [0, 1, 2, 3, 4], // Sun-Thu
    taxBrackets: [
      { min: 0, max: 350000, rate: 0 },
      { min: 350000, max: 450000, rate: 0.05 },
      { min: 450000, max: 750000, rate: 0.10 },
      { min: 750000, max: 1150000, rate: 0.15 },
      { min: 1150000, max: Infinity, rate: 0.20 },
    ],
  },
  UK: {
    currency: 'GBP',
    workDays: [1, 2, 3, 4, 5],
    taxBrackets: [
      { min: 0, max: 12570, rate: 0 },
      { min: 12570, max: 50270, rate: 0.20 },
      { min: 50270, max: 125140, rate: 0.40 },
      { min: 125140, max: Infinity, rate: 0.45 },
    ],
  },
  IN: {
    currency: 'INR',
    workDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
    taxBrackets: [
      { min: 0, max: 300000, rate: 0 },
      { min: 300000, max: 600000, rate: 0.05 },
      { min: 600000, max: 900000, rate: 0.10 },
      { min: 900000, max: 1200000, rate: 0.15 },
      { min: 1200000, max: Infinity, rate: 0.20 },
    ],
  },
};

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  workDays: [1, 2, 3, 4, 5], // Monday to Friday
  hoursPerDay: 8,
};

export const DEFAULT_TAX_BRACKETS = COUNTRY_DEFAULTS.US.taxBrackets;

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
 *   { workDays: [1,2,3,4,5], holidays: companyHolidays }
 * );
 */
export function countWorkingDays(
  startDate: Date,
  endDate: Date,
  options: {
    workDays?: number[];
    holidays?: Date[];
  } = {}
): WorkingDaysResult {
  const workDays = options.workDays || DEFAULT_WORK_SCHEDULE.workDays;
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
 * Calculate tax using brackets (annualized)
 *
 * @example
 * const tax = calculateTax(monthlyIncome, 'USD');
 */
export function calculateTax(
  monthlyIncome: number,
  currency: string,
  customBrackets?: Array<{ min: number; max: number; rate: number }>
): TaxResult {
  const brackets = customBrackets || COUNTRY_DEFAULTS[currency]?.taxBrackets || DEFAULT_TAX_BRACKETS;
  
  // Annualize for bracket calculation
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
 * @example
 * const result = calculateSalaryBreakdown({
 *   baseSalary: 100000,
 *   currency: 'USD',
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
  currency: string;
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
    currency,
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
    workDays: workSchedule.workDays,
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
    const dailyRate = proratedBase / workingDays.workingDays;
    attendanceDeduction = calculateAttendanceDeduction(
      attendance.expectedDays,
      attendance.actualDays,
      dailyRate
    );
    if (attendanceDeduction > 0) {
      processedDeductions.push({ type: 'attendance', amount: attendanceDeduction });
    }
  }

  // 7. Calculate gross salary
  const grossSalary = proratedBase + totalAllowances;

  // 8. Calculate tax
  let taxAmount = 0;
  if (!options.skipTax) {
    const taxableAllowances = processedAllowances
      .filter(a => a.taxable)
      .reduce((sum, a) => sum + a.amount, 0);
    const taxableIncome = proratedBase + taxableAllowances;
    const taxResult = calculateTax(taxableIncome, currency);
    taxAmount = taxResult.amount;
    if (taxAmount > 0) {
      processedDeductions.push({ type: 'tax', amount: taxAmount });
    }
  }

  // 9. Calculate net salary
  const totalDeductions = processedDeductions
    .filter(d => d.type !== 'tax' && d.type !== 'attendance')
    .reduce((sum, d) => sum + d.amount, 0);
  const netSalary = grossSalary - totalDeductions - attendanceDeduction - taxAmount;

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


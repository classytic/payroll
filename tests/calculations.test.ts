/**
 * @classytic/payroll - Calculation Tests
 *
 * Tests for the simple, pure calculation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  countWorkingDays,
  calculateProration,
  calculateAttendanceDeduction,
  calculateSalaryBreakdown,
  getPayPeriod,
  DEFAULT_WORK_SCHEDULE,
} from '../src/core/index.js';

// ============================================================================
// countWorkingDays Tests
// ============================================================================

describe('countWorkingDays', () => {
  it('should calculate working days for January 2024', () => {
    const result = countWorkingDays(
      new Date('2024-01-01'),
      new Date('2024-01-31')
    );

    expect(result.totalDays).toBe(31);
    expect(result.workingDays).toBe(23); // Jan 2024 has 23 weekdays
    expect(result.weekends).toBe(8);
  });

  it('should calculate working days for February 2024 (leap year)', () => {
    const result = countWorkingDays(
      new Date('2024-02-01'),
      new Date('2024-02-29')
    );

    expect(result.totalDays).toBe(29);
    expect(result.workingDays).toBe(21);
  });

  it('should respect custom work days (Sun-Thu for Bangladesh)', () => {
    const result = countWorkingDays(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      { workingDays: [0, 1, 2, 3, 4] } // Sunday to Thursday
    );

    expect(result.totalDays).toBe(31);
    expect(result.workingDays).toBeGreaterThan(0);
  });

  it('should exclude custom holidays', () => {
    const result = countWorkingDays(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      { 
        holidays: [
          new Date('2024-01-01'), // New Year (Monday)
          new Date('2024-01-15'), // Mid-month (Monday)
        ]
      }
    );

    expect(result.holidays).toBe(2);
    expect(result.workingDays).toBe(21); // 23 - 2 holidays
  });

  it('should handle partial month periods', () => {
    const result = countWorkingDays(
      new Date('2024-01-15'),
      new Date('2024-01-31')
    );

    expect(result.totalDays).toBe(17);
    expect(result.workingDays).toBeGreaterThan(0);
    expect(result.workingDays).toBeLessThan(17);
  });
});

// ============================================================================
// calculateProration Tests
// ============================================================================

describe('calculateProration', () => {
  const periodStart = new Date('2024-03-01');
  const periodEnd = new Date('2024-03-31');

  it('should not prorate for employee hired before period', () => {
    const result = calculateProration(
      new Date('2024-01-01'), // Hired Jan 1
      null,
      periodStart,
      periodEnd
    );

    expect(result.isProrated).toBe(false);
    expect(result.ratio).toBe(1);
    expect(result.reason).toBe('full');
  });

  it('should prorate for mid-month hire', () => {
    const result = calculateProration(
      new Date('2024-03-15'), // Hired March 15
      null,
      periodStart,
      periodEnd
    );

    expect(result.isProrated).toBe(true);
    expect(result.ratio).toBeGreaterThan(0);
    expect(result.ratio).toBeLessThan(1);
    expect(result.reason).toBe('new_hire');
  });

  it('should prorate for termination mid-month', () => {
    const result = calculateProration(
      new Date('2024-01-01'), // Hired Jan 1
      new Date('2024-03-15'), // Terminated March 15
      periodStart,
      periodEnd
    );

    expect(result.isProrated).toBe(true);
    expect(result.reason).toBe('termination');
  });

  it('should prorate for both hire and termination in same month', () => {
    const result = calculateProration(
      new Date('2024-03-10'), // Hired March 10
      new Date('2024-03-20'), // Terminated March 20
      periodStart,
      periodEnd
    );

    expect(result.isProrated).toBe(true);
    expect(result.reason).toBe('both');
  });

  it('should return zero ratio for employee hired after period', () => {
    const result = calculateProration(
      new Date('2024-04-01'), // Hired April 1
      null,
      periodStart,
      periodEnd
    );

    expect(result.ratio).toBe(0);
  });

  it('should return zero ratio for employee terminated before period', () => {
    const result = calculateProration(
      new Date('2024-01-01'),
      new Date('2024-02-15'), // Terminated Feb 15
      periodStart,
      periodEnd
    );

    expect(result.ratio).toBe(0);
  });
});

// ============================================================================
// calculateTax Tests
// ============================================================================

// Legacy calculateTax tests removed - use jurisdiction system instead
// See tests/jurisdiction.test.ts for tax calculation tests

// ============================================================================
// calculateAttendanceDeduction Tests
// ============================================================================

describe('calculateAttendanceDeduction', () => {
  const dailyRate = 5000;

  it('should calculate deduction for absent days', () => {
    const result = calculateAttendanceDeduction({
      expectedWorkingDays: 22,
      actualWorkingDays: 20,
      dailyRate,
    });
    expect(result.deductionAmount).toBe(10000); // 2 days * 5000
    expect(result.absentDays).toBe(2);
    expect(result.hasDeduction).toBe(true);
  });

  it('should return zero when fully present', () => {
    const result = calculateAttendanceDeduction({
      expectedWorkingDays: 22,
      actualWorkingDays: 22,
      dailyRate,
    });
    expect(result.deductionAmount).toBe(0);
    expect(result.absentDays).toBe(0);
    expect(result.hasDeduction).toBe(false);
  });

  it('should calculate full deduction when all days absent', () => {
    const result = calculateAttendanceDeduction({
      expectedWorkingDays: 22,
      actualWorkingDays: 0,
      dailyRate,
    });
    expect(result.deductionAmount).toBe(22 * dailyRate);
    expect(result.absentDays).toBe(22);
    expect(result.hasDeduction).toBe(true);
  });
});

// ============================================================================
// calculateSalaryBreakdown Tests (Production Calculator)
// ============================================================================

describe('calculateSalaryBreakdown', () => {
  // Tax brackets for testing: progressive tax starting at 600k annual
  const testTaxBrackets = [
    { min: 0, max: 600000, rate: 0 },
    { min: 600000, max: 1200000, rate: 0.1 },
    { min: 1200000, max: Infinity, rate: 0.2 },
  ];

  // Base test config
  const baseConfig = {
    allowProRating: true,
    autoDeductions: true,
    defaultCurrency: 'USD',
    attendanceIntegration: true,
  };

  // Base period (March 2024)
  const basePeriod = {
    month: 3,
    year: 2024,
    startDate: new Date('2024-03-01'),
    endDate: new Date('2024-03-31'),
  };

  // Helper to create base params
  const createBaseParams = () => ({
    employee: {
      hireDate: new Date('2024-01-01'),
      compensation: {
        baseAmount: 100000,
        frequency: 'monthly' as const,
        currency: 'USD',
        allowances: [] as Array<{ type: string; amount: number; taxable?: boolean }>,
        deductions: [] as Array<{ type: string; amount: number; auto?: boolean }>,
      },
    },
    period: basePeriod,
    config: baseConfig,
    taxBrackets: testTaxBrackets,
  });

  it('should calculate basic salary correctly', () => {
    const result = calculateSalaryBreakdown(createBaseParams());

    expect(result.baseAmount).toBe(100000);
    expect(result.grossSalary).toBe(100000);
    expect(result.proRatedAmount).toBe(0); // Not prorated
  });

  it('should include allowances in gross', () => {
    const params = createBaseParams();
    params.employee.compensation.allowances = [
      { type: 'housing', amount: 20000, taxable: true },
      { type: 'transport', amount: 5000, taxable: true },
    ];
    const result = calculateSalaryBreakdown(params);

    const totalAllowances = result.allowances.reduce((sum, a) => sum + a.amount, 0);
    expect(totalAllowances).toBe(25000);
    expect(result.grossSalary).toBe(125000);
  });

  it('should apply deductions', () => {
    const params = createBaseParams();
    params.employee.compensation.deductions = [
      { type: 'provident_fund', amount: 5000, auto: true },
    ];
    const result = calculateSalaryBreakdown(params);

    // Deductions include provident_fund and tax
    const nonTaxDeductions = result.deductions.filter(d => d.type !== 'tax');
    const totalNonTax = nonTaxDeductions.reduce((sum, d) => sum + d.amount, 0);
    expect(totalNonTax).toBe(5000);
    expect(result.netSalary).toBeLessThan(result.grossSalary);
  });

  it('should prorate for new hire', () => {
    const params = createBaseParams();
    params.employee.hireDate = new Date('2024-03-15');
    const result = calculateSalaryBreakdown(params);

    expect(result.proRatedAmount).toBeGreaterThan(0);
    expect(result.baseAmount).toBeLessThan(100000);
  });

  it('should prorate allowances', () => {
    const params = createBaseParams();
    params.employee.hireDate = new Date('2024-03-15');
    params.employee.compensation.allowances = [
      { type: 'housing', amount: 20000, taxable: true },
    ];
    const result = calculateSalaryBreakdown(params);

    // Allowances should also be prorated
    const totalAllowances = result.allowances.reduce((sum, a) => sum + a.amount, 0);
    expect(totalAllowances).toBeLessThan(20000);
  });

  it('should apply attendance deduction', () => {
    const params = createBaseParams();
    const result = calculateSalaryBreakdown({
      ...params,
      attendance: { expectedDays: 22, actualDays: 20 },
    });

    expect(result.attendanceDeduction).toBeGreaterThan(0);
  });

  it('should skip tax when requested', () => {
    const params = createBaseParams();
    const withTax = calculateSalaryBreakdown(params);
    const withoutTax = calculateSalaryBreakdown({
      ...params,
      options: { skipTax: true },
    });

    expect(withTax.taxAmount).toBeGreaterThan(0);
    expect(withoutTax.taxAmount).toBe(0);
  });

  it('should skip proration when requested', () => {
    const params = createBaseParams();
    params.employee.hireDate = new Date('2024-03-15');
    const result = calculateSalaryBreakdown({
      ...params,
      options: { skipProration: true },
    });

    expect(result.proRatedAmount).toBe(0);
    expect(result.baseAmount).toBe(100000);
  });

  it('should not tax non-taxable allowances', () => {
    const paramsWithTaxable = createBaseParams();
    paramsWithTaxable.employee.compensation.allowances = [
      { type: 'bonus', amount: 10000, taxable: true },
    ];
    const taxable = calculateSalaryBreakdown(paramsWithTaxable);

    const paramsWithNonTaxable = createBaseParams();
    paramsWithNonTaxable.employee.compensation.allowances = [
      { type: 'meal', amount: 10000, taxable: false },
    ];
    const nonTaxable = calculateSalaryBreakdown(paramsWithNonTaxable);

    // Tax should be lower when allowance is not taxable
    expect(nonTaxable.taxAmount).toBeLessThan(taxable.taxAmount!);
  });

  it('should include attendance deduction in deductions array', () => {
    const params = createBaseParams();
    params.employee.compensation.deductions = [
      { type: 'provident_fund', amount: 5000, auto: true },
    ];
    const result = calculateSalaryBreakdown({
      ...params,
      attendance: { expectedDays: 22, actualDays: 20 }, // 2 days absent
    });

    // Deductions array should include provident_fund, attendance (absence), and tax
    expect(result.attendanceDeduction).toBeGreaterThan(0);
    const nonTaxDeductions = result.deductions.filter(d => d.type !== 'tax');
    const totalNonTax = nonTaxDeductions.reduce((sum, d) => sum + d.amount, 0);
    expect(totalNonTax).toBe(5000 + (result.attendanceDeduction || 0));
  });

  it('should correctly compute netSalary from gross minus all deductions', () => {
    const params = createBaseParams();
    params.employee.compensation.deductions = [
      { type: 'provident_fund', amount: 3000, auto: true },
      { type: 'insurance', amount: 2000, auto: true },
    ];
    const result = calculateSalaryBreakdown({
      ...params,
      attendance: { expectedDays: 22, actualDays: 18 }, // 4 days absent
    });

    // Deductions include provident_fund, insurance, absence, and tax
    const nonTaxDeductions = result.deductions.filter(d => d.type !== 'tax');
    const totalNonTax = nonTaxDeductions.reduce((sum, d) => sum + d.amount, 0);
    const expectedNonTax = 3000 + 2000 + (result.attendanceDeduction || 0);
    expect(totalNonTax).toBe(expectedNonTax);

    // Net salary = gross - all deductions (including tax)
    const totalAllDeductions = result.deductions.reduce((sum, d) => sum + d.amount, 0);
    expect(result.netSalary).toBe(result.grossSalary - totalAllDeductions);
  });
});

// ============================================================================
// getPayPeriod Tests
// ============================================================================

describe('getPayPeriod', () => {
  it('should return correct dates for March 2024', () => {
    const period = getPayPeriod(3, 2024);

    expect(period.startDate.getMonth()).toBe(2); // March (0-indexed)
    expect(period.startDate.getDate()).toBe(1);
    expect(period.endDate.getDate()).toBe(31);
  });

  it('should handle February correctly', () => {
    const period = getPayPeriod(2, 2024);

    expect(period.endDate.getDate()).toBe(29); // Leap year
  });

  it('should use custom pay day', () => {
    const period = getPayPeriod(3, 2024, 15);

    expect(period.payDate.getDate()).toBe(15);
  });
});

// ============================================================================
// Country defaults removed - use jurisdiction system instead

// ============================================================================
// DEFAULT_WORK_SCHEDULE Tests
// ============================================================================

describe('DEFAULT_WORK_SCHEDULE', () => {
  it('should have Mon-Fri as default', () => {
    expect(DEFAULT_WORK_SCHEDULE.workingDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('should have 8 hours per day', () => {
    expect(DEFAULT_WORK_SCHEDULE.hoursPerDay).toBe(8);
  });
});

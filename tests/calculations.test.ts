/**
 * @classytic/payroll - Calculation Tests
 *
 * Tests for the simple, pure calculation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  countWorkingDays,
  calculateProration,
  calculateTax,
  calculateAttendanceDeduction,
  calculateSalaryBreakdown,
  getPayPeriod,
  COUNTRY_DEFAULTS,
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
      { workDays: [0, 1, 2, 3, 4] } // Sunday to Thursday
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

describe('calculateTax', () => {
  describe('USD', () => {
    it('should calculate tax for income in brackets', () => {
      const result = calculateTax(5000, 'USD');
      
      expect(result.amount).toBeGreaterThan(0);
      expect(result.effectiveRate).toBeGreaterThan(0);
    });

    it('should calculate higher tax for higher income', () => {
      const low = calculateTax(3000, 'USD');
      const high = calculateTax(10000, 'USD');
      
      expect(high.amount).toBeGreaterThan(low.amount);
    });
  });

  describe('BDT', () => {
    it('should calculate less tax for lower income in BDT', () => {
      const low = calculateTax(20000, 'BDT');
      const high = calculateTax(50000, 'BDT');
      // Higher income should result in higher tax
      expect(high.amount).toBeGreaterThan(low.amount);
    });

    it('should calculate tax for income in BDT', () => {
      const result = calculateTax(50000, 'BDT');
      // 50000 * 12 = 600000 BDT/year
      expect(result.amount).toBeGreaterThan(0);
    });
  });

  describe('Unknown currency', () => {
    it('should use default (USD) brackets for unknown currency', () => {
      const result = calculateTax(5000, 'XYZ');
      // Falls back to USD brackets
      expect(result.amount).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// calculateAttendanceDeduction Tests
// ============================================================================

describe('calculateAttendanceDeduction', () => {
  const dailyRate = 5000;

  it('should calculate deduction for absent days', () => {
    const result = calculateAttendanceDeduction(22, 20, dailyRate);
    expect(result).toBe(10000); // 2 days * 5000
  });

  it('should return zero when fully present', () => {
    const result = calculateAttendanceDeduction(22, 22, dailyRate);
    expect(result).toBe(0);
  });

  it('should respect maxDeductionPercent', () => {
    // All absent but max 50%
    const result = calculateAttendanceDeduction(22, 0, dailyRate, 50);
    const max = 22 * dailyRate * 0.5;
    expect(result).toBe(max);
  });
});

// ============================================================================
// calculateSalaryBreakdown Tests
// ============================================================================

describe('calculateSalaryBreakdown', () => {
  const baseParams = {
    baseSalary: 100000,
    currency: 'USD',
    hireDate: new Date('2024-01-01'),
    periodStart: new Date('2024-03-01'),
    periodEnd: new Date('2024-03-31'),
  };

  it('should calculate basic salary correctly', () => {
    const result = calculateSalaryBreakdown(baseParams);

    expect(result.baseSalary).toBe(100000);
    expect(result.proratedBase).toBe(100000);
    expect(result.grossSalary).toBe(100000);
    expect(result.proration.isProrated).toBe(false);
  });

  it('should include allowances in gross', () => {
    const result = calculateSalaryBreakdown({
      ...baseParams,
      allowances: [
        { type: 'housing', amount: 20000, taxable: true },
        { type: 'transport', amount: 5000, taxable: true },
      ],
    });

    expect(result.totalAllowances).toBe(25000);
    expect(result.grossSalary).toBe(125000);
  });

  it('should apply deductions', () => {
    const result = calculateSalaryBreakdown({
      ...baseParams,
      deductions: [{ type: 'provident_fund', amount: 5000 }],
    });

    expect(result.totalDeductions).toBe(5000);
    expect(result.netSalary).toBeLessThan(result.grossSalary);
  });

  it('should prorate for new hire', () => {
    const result = calculateSalaryBreakdown({
      ...baseParams,
      hireDate: new Date('2024-03-15'),
    });

    expect(result.proration.isProrated).toBe(true);
    expect(result.proratedBase).toBeLessThan(result.baseSalary);
  });

  it('should prorate allowances', () => {
    const result = calculateSalaryBreakdown({
      ...baseParams,
      hireDate: new Date('2024-03-15'),
      allowances: [{ type: 'housing', amount: 20000 }],
    });

    // Allowances should also be prorated
    expect(result.totalAllowances).toBeLessThan(20000);
  });

  it('should apply attendance deduction', () => {
    const result = calculateSalaryBreakdown({
      ...baseParams,
      attendance: { expectedDays: 22, actualDays: 20 },
    });

    expect(result.attendanceDeduction).toBeGreaterThan(0);
  });

  it('should skip tax when requested', () => {
    const withTax = calculateSalaryBreakdown(baseParams);
    const withoutTax = calculateSalaryBreakdown({
      ...baseParams,
      options: { skipTax: true },
    });

    expect(withTax.taxAmount).toBeGreaterThan(0);
    expect(withoutTax.taxAmount).toBe(0);
  });

  it('should skip proration when requested', () => {
    const result = calculateSalaryBreakdown({
      ...baseParams,
      hireDate: new Date('2024-03-15'),
      options: { skipProration: true },
    });

    expect(result.proration.isProrated).toBe(false);
    expect(result.proratedBase).toBe(100000);
  });

  it('should not tax non-taxable allowances', () => {
    const taxable = calculateSalaryBreakdown({
      ...baseParams,
      allowances: [{ type: 'bonus', amount: 10000, taxable: true }],
    });
    const nonTaxable = calculateSalaryBreakdown({
      ...baseParams,
      allowances: [{ type: 'meal', amount: 10000, taxable: false }],
    });

    // Tax should be lower when allowance is not taxable
    expect(nonTaxable.taxAmount).toBeLessThan(taxable.taxAmount);
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
// Country Defaults Tests
// ============================================================================

describe('COUNTRY_DEFAULTS', () => {
  it('should have US defaults', () => {
    expect(COUNTRY_DEFAULTS.US.currency).toBe('USD');
    expect(COUNTRY_DEFAULTS.US.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('should have BD defaults with Sun-Thu', () => {
    expect(COUNTRY_DEFAULTS.BD.currency).toBe('BDT');
    expect(COUNTRY_DEFAULTS.BD.workDays).toEqual([0, 1, 2, 3, 4]);
  });

  it('should have IN defaults with Mon-Sat', () => {
    expect(COUNTRY_DEFAULTS.IN.currency).toBe('INR');
    expect(COUNTRY_DEFAULTS.IN.workDays).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ============================================================================
// DEFAULT_WORK_SCHEDULE Tests
// ============================================================================

describe('DEFAULT_WORK_SCHEDULE', () => {
  it('should have Mon-Fri as default', () => {
    expect(DEFAULT_WORK_SCHEDULE.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('should have 8 hours per day', () => {
    expect(DEFAULT_WORK_SCHEDULE.hoursPerDay).toBe(8);
  });
});

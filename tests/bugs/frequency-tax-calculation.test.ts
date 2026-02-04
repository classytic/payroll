/**
 * Tests for frequency-aware tax calculation
 *
 * Issue: Tax calculation was hardcoded to monthly (× 12 / 12).
 * Fix: Uses getPayPeriodsPerYear(frequency) for correct annualization.
 *
 * Key insight: Annual tax should be equivalent regardless of payment frequency.
 * Employee earning $104,000/year should pay same annual tax whether paid:
 * - Monthly: $8,666.67 × 12
 * - Weekly: $2,000 × 52
 * - Bi-weekly: $4,000 × 26
 */

import { describe, it, expect } from 'vitest';
import { calculateSalaryBreakdown } from '../../src/calculators/salary.calculator.js';
import { getPayPeriodsPerYear, toAnnualAmount, toMonthlyAmount } from '../../src/config.js';
import { getPayPeriodForFrequency } from '../../src/utils/date.js';
import type { PaymentFrequency } from '../../src/types.js';

// Test tax brackets: progressive tax
const testTaxBrackets = [
  { min: 0, max: 50000, rate: 0.10 },      // 10% on first $50k
  { min: 50000, max: 100000, rate: 0.20 }, // 20% on $50k-$100k
  { min: 100000, max: Infinity, rate: 0.30 }, // 30% above $100k
];

const baseConfig = {
  allowProRating: false,
  autoDeductions: true,
  defaultCurrency: 'USD',
  attendanceIntegration: false,
  taxRounding: 'banker' as const,
  deductionLimits: {},
  allowanceConfig: {},
};

describe('Frequency-Aware Tax Calculation', () => {
  // ============================================================================
  // Unit Tests: getPayPeriodsPerYear
  // ============================================================================
  describe('getPayPeriodsPerYear', () => {
    it('returns correct periods for all frequencies', () => {
      expect(getPayPeriodsPerYear('monthly')).toBe(12);
      expect(getPayPeriodsPerYear('bi_weekly')).toBe(26);
      expect(getPayPeriodsPerYear('weekly')).toBe(52);
      expect(getPayPeriodsPerYear('daily')).toBe(365);
      expect(getPayPeriodsPerYear('hourly')).toBe(2080); // 40h × 52 weeks
    });
  });

  // ============================================================================
  // Unit Tests: toAnnualAmount
  // ============================================================================
  describe('toAnnualAmount', () => {
    it('calculates correct annual amount for monthly frequency', () => {
      // $8,666.67/month × 12 = $104,000.04/year
      expect(toAnnualAmount(8666.67, 'monthly')).toBe(104000.04);
    });

    it('calculates correct annual amount for weekly frequency', () => {
      // $2,000/week × 52 = $104,000/year
      expect(toAnnualAmount(2000, 'weekly')).toBe(104000);
    });

    it('calculates correct annual amount for bi_weekly frequency', () => {
      // $4,000/bi-week × 26 = $104,000/year
      expect(toAnnualAmount(4000, 'bi_weekly')).toBe(104000);
    });

    it('calculates correct annual amount for daily frequency', () => {
      // ~$284.93/day × 365 = $104,000 (approx)
      expect(toAnnualAmount(284.93, 'daily')).toBe(103999.45);
    });

    it('calculates correct annual amount for hourly frequency', () => {
      // $50/hour × 2080 = $104,000/year
      expect(toAnnualAmount(50, 'hourly')).toBe(104000);
    });
  });

  // ============================================================================
  // Unit Tests: toMonthlyAmount
  // ============================================================================
  describe('toMonthlyAmount', () => {
    it('converts weekly to monthly correctly', () => {
      // $2,000/week × 52 / 12 = $8,666.67/month
      expect(toMonthlyAmount(2000, 'weekly')).toBe(8666.67);
    });

    it('converts bi_weekly to monthly correctly', () => {
      // $4,000/bi-week × 26 / 12 = $8,666.67/month
      expect(toMonthlyAmount(4000, 'bi_weekly')).toBe(8666.67);
    });

    it('monthly stays the same', () => {
      expect(toMonthlyAmount(8000, 'monthly')).toBe(8000);
    });
  });

  // ============================================================================
  // Unit Tests: getPayPeriodForFrequency
  // ============================================================================
  describe('getPayPeriodForFrequency', () => {
    const paymentDate = new Date('2024-03-15');

    it('monthly: returns full calendar month', () => {
      const period = getPayPeriodForFrequency('monthly', paymentDate, 3, 2024);
      expect(period.startDate.getDate()).toBe(1);
      expect(period.endDate.getDate()).toBe(31);
      expect(period.workingDays).toBe(21); // March 2024 has 21 weekdays
    });

    it('weekly: returns 7-day period ending on paymentDate', () => {
      const period = getPayPeriodForFrequency('weekly', paymentDate, 3, 2024);
      expect(period.startDate.getDate()).toBe(9); // March 9
      expect(period.endDate.getDate()).toBe(15); // March 15
      expect(period.workingDays).toBe(5); // Mon-Fri
    });

    it('bi_weekly: returns 14-day period ending on paymentDate', () => {
      const period = getPayPeriodForFrequency('bi_weekly', paymentDate, 3, 2024);
      expect(period.startDate.getDate()).toBe(2); // March 2
      expect(period.endDate.getDate()).toBe(15); // March 15
      expect(period.workingDays).toBe(10); // 2 weeks × 5 weekdays
    });

    it('daily: returns single day', () => {
      const period = getPayPeriodForFrequency('daily', paymentDate, 3, 2024);
      expect(period.startDate.getDate()).toBe(15);
      expect(period.endDate.getDate()).toBe(15);
      expect(period.workingDays).toBe(1); // Friday is a weekday
    });

    it('hourly: returns single day (same as daily)', () => {
      const period = getPayPeriodForFrequency('hourly', paymentDate, 3, 2024);
      expect(period.startDate.getDate()).toBe(15);
      expect(period.endDate.getDate()).toBe(15);
      expect(period.workingDays).toBe(1);
    });
  });

  // ============================================================================
  // Integration Tests: calculateSalaryBreakdown with different frequencies
  // ============================================================================
  describe('calculateSalaryBreakdown uses frequency for tax annualization', () => {
    // Helper to create employee params with specific frequency
    function createEmployeeParams(frequency: PaymentFrequency, periodAmount: number) {
      const paymentDate = new Date('2024-03-15');
      const period = getPayPeriodForFrequency(frequency, paymentDate, 3, 2024);

      return {
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: periodAmount,
            frequency,
            currency: 'USD',
            allowances: [],
            deductions: [],
          },
        },
        period: { ...period, payDate: paymentDate },
        config: baseConfig,
        taxBrackets: testTaxBrackets,
      };
    }

    it('monthly frequency: taxes based on annual = periodAmount × 12', () => {
      // $8,666.67/month = $104,000/year
      const params = createEmployeeParams('monthly', 8666.67);
      const result = calculateSalaryBreakdown(params);

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeDefined();

      // Annual tax on $104,000:
      // First $50k at 10% = $5,000
      // Next $50k at 20% = $10,000
      // Remaining $4k at 30% = $1,200
      // Total = $16,200/year = $1,350/month
      const expectedAnnualTax = 5000 + 10000 + 1200.01; // $16,200.01 (due to $104,000.04)
      const expectedMonthlyTax = expectedAnnualTax / 12;

      expect(taxDeduction!.amount).toBeCloseTo(expectedMonthlyTax, 0);
    });

    it('weekly frequency: taxes based on annual = periodAmount × 52', () => {
      // $2,000/week = $104,000/year
      const params = createEmployeeParams('weekly', 2000);
      const result = calculateSalaryBreakdown(params);

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeDefined();

      // Annual tax on $104,000 = $16,200
      // Weekly tax = $16,200 / 52 ≈ $311.54
      const expectedAnnualTax = 16200;
      const expectedWeeklyTax = expectedAnnualTax / 52;

      expect(taxDeduction!.amount).toBeCloseTo(expectedWeeklyTax, 0);
    });

    it('bi_weekly frequency: taxes based on annual = periodAmount × 26', () => {
      // $4,000/bi-week = $104,000/year
      const params = createEmployeeParams('bi_weekly', 4000);
      const result = calculateSalaryBreakdown(params);

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeDefined();

      // Annual tax on $104,000 = $16,200
      // Bi-weekly tax = $16,200 / 26 ≈ $623.08
      const expectedAnnualTax = 16200;
      const expectedBiWeeklyTax = expectedAnnualTax / 26;

      expect(taxDeduction!.amount).toBeCloseTo(expectedBiWeeklyTax, 0);
    });

    it('annual tax is equivalent regardless of payment frequency', () => {
      // All employees earning $104,000/year should have same annual tax
      const frequencies: Array<{ frequency: PaymentFrequency; periodAmount: number; periods: number }> = [
        { frequency: 'monthly', periodAmount: 8666.67, periods: 12 },
        { frequency: 'weekly', periodAmount: 2000, periods: 52 },
        { frequency: 'bi_weekly', periodAmount: 4000, periods: 26 },
      ];

      const annualTaxes: number[] = [];

      for (const { frequency, periodAmount, periods } of frequencies) {
        const params = createEmployeeParams(frequency, periodAmount);
        const result = calculateSalaryBreakdown(params);

        const taxDeduction = result.deductions.find(d => d.type === 'tax');
        const annualTax = (taxDeduction?.amount || 0) * periods;
        annualTaxes.push(annualTax);
      }

      // All annual taxes should be approximately equal (within $100 for rounding)
      const [monthlyAnnual, weeklyAnnual, biWeeklyAnnual] = annualTaxes;

      expect(Math.abs(monthlyAnnual - weeklyAnnual)).toBeLessThan(100);
      expect(Math.abs(monthlyAnnual - biWeeklyAnnual)).toBeLessThan(100);
      expect(Math.abs(weeklyAnnual - biWeeklyAnnual)).toBeLessThan(100);

      // All should be close to expected $16,200
      for (const annualTax of annualTaxes) {
        expect(annualTax).toBeCloseTo(16200, -2); // Within $100
      }
    });

    it('daily frequency: taxes based on annual = periodAmount × 365', () => {
      // ~$285/day = ~$104,025/year
      const params = createEmployeeParams('daily', 285);
      const result = calculateSalaryBreakdown(params);

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeDefined();

      // Annual = 285 × 365 = $104,025
      // Tax: $5,000 + $10,000 + ($4,025 × 0.30) = $16,207.50
      // Daily = $16,207.50 / 365 ≈ $44.40
      const expectedDailyTax = 16207.5 / 365;

      expect(taxDeduction!.amount).toBeCloseTo(expectedDailyTax, 0);
    });

    it('hourly frequency: taxes based on annual = periodAmount × 2080', () => {
      // $50/hour × 2080 = $104,000/year
      const params = createEmployeeParams('hourly', 50);
      const result = calculateSalaryBreakdown(params);

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeDefined();

      // Annual tax on $104,000 = $16,200
      // Hourly tax = $16,200 / 2080 ≈ $7.79
      const expectedAnnualTax = 16200;
      const expectedHourlyTax = expectedAnnualTax / 2080;

      expect(taxDeduction!.amount).toBeCloseTo(expectedHourlyTax, 0);
    });
  });
});

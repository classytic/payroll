/**
 * Regression Test: Double Tax-Free Threshold Bug
 *
 * BUG: When BDT brackets included a 0% bracket ({ min: 0, max: 300000, rate: 0 })
 * AND jurisdictionTaxConfig.standardDeduction was also set (e.g., 350000),
 * the tax-free amount was effectively doubled:
 *
 *   1. standardDeduction subtracts ৳3,50,000 from annual income
 *   2. The 0% bracket then makes another ৳3,00,000 tax-free
 *   → Effective tax-free = ৳6,50,000 instead of the intended ৳3,50,000
 *
 * FIX: Removed the 0% bracket from BDT config. Tax-free thresholds are handled
 * exclusively via jurisdictionTaxConfig.standardDeduction or thresholdsByCategory.
 * Brackets should only contain non-zero progressive rates.
 *
 * @see config.ts TAX_BRACKETS.BDT
 */

import { describe, it, expect } from 'vitest';
import { calculateSalaryBreakdown } from '../../src/calculators/salary.calculator.js';
import { TAX_BRACKETS } from '../../src/config.js';

// ============================================================================
// Test Data
// ============================================================================

/**
 * Correct BDT brackets: progressive rates ONLY, no 0% bracket.
 * The tax-free threshold is handled by standardDeduction.
 */
const correctBrackets = [
  { min: 0, max: 100000, rate: 0.05 },
  { min: 100000, max: 400000, rate: 0.10 },
  { min: 400000, max: 700000, rate: 0.15 },
  { min: 700000, max: 1100000, rate: 0.20 },
  { min: 1100000, max: Infinity, rate: 0.25 },
];

/**
 * BUGGY brackets that caused the double threshold.
 * DO NOT use in production — kept here only for regression testing.
 */
const buggyBracketsWithZeroPercent = [
  { min: 0, max: 300000, rate: 0 },       // ← This caused the double deduction
  { min: 300000, max: 400000, rate: 0.05 },
  { min: 400000, max: 700000, rate: 0.10 },
  { min: 700000, max: 1100000, rate: 0.15 },
  { min: 1100000, max: 1500000, rate: 0.20 },
  { min: 1500000, max: Infinity, rate: 0.25 },
];

const baseConfig = {
  allowProRating: true,
  autoDeductions: true,
  defaultCurrency: 'BDT',
  attendanceIntegration: false,
};

const basePeriod = {
  month: 6,
  year: 2024,
  startDate: new Date('2024-06-01'),
  endDate: new Date('2024-06-30'),
};

function createEmployee(baseAmount: number) {
  return {
    hireDate: new Date('2020-01-01'),
    compensation: {
      baseAmount,
      currency: 'BDT',
      frequency: 'monthly' as const,
      allowances: [],
      deductions: [],
    },
  };
}

// ============================================================================
// Regression Tests
// ============================================================================

describe('Bug Regression: Double Tax-Free Threshold', () => {
  describe('Config validation: BDT brackets should not contain 0% rate', () => {
    it('should not have any 0% rate bracket in TAX_BRACKETS.BDT', () => {
      const bdtBrackets = TAX_BRACKETS['BDT'];
      expect(bdtBrackets).toBeDefined();

      const zeroBracket = bdtBrackets.find((b) => b.rate === 0);
      expect(zeroBracket).toBeUndefined();
    });

    it('BDT brackets should start with a non-zero rate', () => {
      const bdtBrackets = TAX_BRACKETS['BDT'];
      expect(bdtBrackets[0].rate).toBeGreaterThan(0);
    });

    it('all BDT bracket rates should be positive', () => {
      const bdtBrackets = TAX_BRACKETS['BDT'];
      for (const bracket of bdtBrackets) {
        expect(bracket.rate).toBeGreaterThan(0);
      }
    });
  });

  describe('Single tax-free threshold with standardDeduction', () => {
    it('should apply exactly one tax-free threshold (not doubled)', () => {
      // Employee: ৳50,000/month = ৳6,00,000/year
      // Standard deduction: ৳3,50,000
      // Taxable income: ৳6,00,000 - ৳3,50,000 = ৳2,50,000
      // Tax: ৳1,00,000 × 5% + ৳1,50,000 × 10% = ৳5,000 + ৳15,000 = ৳20,000/year
      // Monthly: ৳20,000 / 12 ≈ ৳1,666.67

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      // The key assertion: tax must reflect ৳2,50,000 taxable, NOT ৳0 (double threshold)
      expect(result.taxAmount).toBeCloseTo(1666.67, 0);

      // If the bug existed, tax would be much lower or zero because:
      // ৳6,00,000 - ৳3,50,000 (std deduction) = ৳2,50,000
      // Then 0% bracket would exempt another ৳3,00,000 → effectively -৳50,000 → ৳0 taxable
      expect(result.taxAmount).toBeGreaterThan(0);
    });

    it('should produce exact tax for ৳1,00,000/month with standard deduction', () => {
      // ৳1,00,000/month = ৳12,00,000/year
      // After ৳3,50,000 deduction: ৳8,50,000 taxable
      // Tax: ৳1,00,000×5% + ৳3,00,000×10% + ৳3,00,000×15% + ৳1,50,000×20%
      //    = ৳5,000 + ৳30,000 + ৳45,000 + ৳30,000 = ৳1,10,000/year
      // Monthly: ৳1,10,000 / 12 ≈ ৳9,166.67

      const result = calculateSalaryBreakdown({
        employee: createEmployee(100000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      expect(result.taxAmount).toBeCloseTo(9166.67, 0);
    });

    it('should NOT double-exempt income when standardDeduction is used', () => {
      // The buggy behavior would produce significantly less tax than correct calculation.
      // Compare buggy brackets vs correct brackets with same standardDeduction.

      const correctResult = calculateSalaryBreakdown({
        employee: createEmployee(80000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      const buggyResult = calculateSalaryBreakdown({
        employee: createEmployee(80000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: buggyBracketsWithZeroPercent,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      // Buggy brackets produce less tax because of double exemption
      // ৳80,000/month = ৳9,60,000/year
      // Correct: ৳9,60,000 - ৳3,50,000 = ৳6,10,000 taxable → significant tax
      // Buggy: ৳9,60,000 - ৳3,50,000 = ৳6,10,000, then 0% on first ৳3,00,000
      //        → only ৳3,10,000 effectively taxed
      expect(buggyResult.taxAmount).toBeLessThan(correctResult.taxAmount!);

      // The correct result should be meaningfully higher (not just rounding difference)
      const difference = correctResult.taxAmount! - buggyResult.taxAmount!;
      expect(difference).toBeGreaterThan(100); // Significant difference, not rounding
    });
  });

  describe('Threshold with demographic categories', () => {
    const jurisdictionConfig = {
      standardDeduction: 350000,
      thresholdsByCategory: {
        standard: 350000,
        female: 400000,
        senior: 400000,
        disabled: 475000,
      },
    };

    it('female taxpayer should get exactly ৳4,00,000 threshold (not doubled)', () => {
      // ৳50,000/month = ৳6,00,000/year
      // Female threshold ৳4,00,000 → ৳2,00,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳1,00,000 × 10% = ৳5,000 + ৳10,000 = ৳15,000/year
      // Monthly: ৳15,000 / 12 = ৳1,250

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          taxpayerCategory: 'female',
        },
        jurisdictionTaxConfig: jurisdictionConfig,
      });

      expect(result.taxAmount).toBe(1250);
    });

    it('disabled taxpayer should get exactly ৳4,75,000 threshold (not doubled)', () => {
      // ৳50,000/month = ৳6,00,000/year
      // Disabled threshold ৳4,75,000 → ৳1,25,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳25,000 × 10% = ৳5,000 + ৳2,500 = ৳7,500/year
      // Monthly: ৳7,500 / 12 = ৳625

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          taxpayerCategory: 'disabled',
        },
        jurisdictionTaxConfig: jurisdictionConfig,
      });

      expect(result.taxAmount).toBe(625);
    });

    it('threshold should only be subtracted once regardless of category', () => {
      // All categories should show exactly one threshold subtraction.
      // Test that the difference between categories matches the threshold gap.

      const standardResult = calculateSalaryBreakdown({
        employee: createEmployee(80000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          taxpayerCategory: 'standard',
        },
        jurisdictionTaxConfig: jurisdictionConfig,
      });

      const femaleResult = calculateSalaryBreakdown({
        employee: createEmployee(80000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          taxpayerCategory: 'female',
        },
        jurisdictionTaxConfig: jurisdictionConfig,
      });

      // Female gets ৳50,000 more in threshold (400K vs 350K)
      // At whatever marginal rate that ৳50,000 falls in, the tax saving is predictable.
      // The key point: the difference should be proportional to the threshold gap,
      // NOT to double the gap.
      expect(femaleResult.taxAmount).toBeLessThan(standardResult.taxAmount!);

      // ৳80,000/month = ৳9,60,000/year
      // Standard taxable: ৳9,60,000 - ৳3,50,000 = ৳6,10,000
      // Female taxable: ৳9,60,000 - ৳4,00,000 = ৳5,60,000
      // The ৳50,000 difference falls in the 15% bracket for both
      // Tax saving: ৳50,000 × 15% = ৳7,500/year = ৳625/month
      const monthlySaving = standardResult.taxAmount! - femaleResult.taxAmount!;
      expect(monthlySaving).toBeCloseTo(625, 0);
    });
  });

  describe('Income below threshold', () => {
    it('should yield zero tax when annual income is below standard deduction', () => {
      // ৳25,000/month = ৳3,00,000/year < ৳3,50,000 threshold
      const result = calculateSalaryBreakdown({
        employee: createEmployee(25000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      expect(result.taxAmount).toBe(0);
    });

    it('should yield zero tax at exact threshold boundary', () => {
      // ৳29,166.67/month ≈ ৳3,50,000/year (exactly at threshold)
      const result = calculateSalaryBreakdown({
        employee: createEmployee(29166.67),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      // At exact boundary, taxable income ≈ 0
      expect(result.taxAmount).toBeLessThan(1);
    });

    it('should produce small positive tax just above threshold', () => {
      // ৳30,000/month = ৳3,60,000/year
      // Taxable: ৳3,60,000 - ৳3,50,000 = ৳10,000
      // Tax: ৳10,000 × 5% = ৳500/year = ৳41.67/month
      const result = calculateSalaryBreakdown({
        employee: createEmployee(30000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: correctBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: {
          standardDeduction: 350000,
        },
      });

      expect(result.taxAmount).toBeCloseTo(41.67, 0);
      expect(result.taxAmount).toBeGreaterThan(0);
    });
  });

});

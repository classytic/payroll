/**
 * Enhanced Tax Calculation Tests
 *
 * Tests jurisdiction-aware tax calculation features:
 * - Standard deduction / tax-free thresholds
 * - Demographic-based thresholds (gender, age)
 * - Pre-tax deductions (provident fund, pension)
 * - Tax credits/rebates (investment rebate)
 *
 * Uses Bangladesh (BD) tax rules as example to demonstrate
 * how the package supports country-specific configurations.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { calculateSalaryBreakdown } from '../../src/calculators/salary.calculator.js';
import type { TaxBracket, Deduction } from '../../src/types.js';

// ============================================================================
// Bangladesh Tax Configuration (FY 2024-25)
// ============================================================================

/**
 * Bangladesh income tax brackets (FY 2024-25)
 *
 * Note: These brackets assume income AFTER standard deduction.
 * The tax-free threshold is handled separately via standardDeduction.
 */
const bdTaxBrackets: TaxBracket[] = [
  { min: 0, max: 100000, rate: 0.05 },       // First ৳1,00,000 at 5%
  { min: 100000, max: 400000, rate: 0.10 },  // Next ৳3,00,000 at 10%
  { min: 400000, max: 700000, rate: 0.15 },  // Next ৳3,00,000 at 15%
  { min: 700000, max: 1100000, rate: 0.20 }, // Next ৳4,00,000 at 20%
  { min: 1100000, max: Infinity, rate: 0.25 }, // Remaining at 25%
];

/**
 * Bangladesh jurisdiction tax configuration
 */
const bdJurisdictionConfig = {
  standardDeduction: 350000, // ৳3,50,000 tax-free threshold
  thresholdsByCategory: {
    standard: 350000,  // Regular taxpayers
    female: 400000,    // Women taxpayers
    senior: 400000,    // Citizens 65+
    disabled: 475000,  // Persons with disabilities
    gazetted_hero: 500000, // Freedom fighters (Gazetted)
  },
  preTaxDeductionTypes: ['provident_fund', 'pension', 'gratuity'],
};

/**
 * US jurisdiction tax configuration (for comparison)
 */
const usJurisdictionConfig = {
  standardDeduction: 14600, // 2024 single filer
  thresholdsByCategory: {
    standard: 14600,
    senior: 16550,    // Additional $1,950 for 65+
    blind: 16550,     // Additional $1,950 for blind
    married_filing_jointly: 29200,
  },
  preTaxDeductionTypes: ['401k', 'traditional_ira', 'hsa', 'fsa'],
};

const usTaxBrackets: TaxBracket[] = [
  { min: 0, max: 11600, rate: 0.10 },
  { min: 11600, max: 47150, rate: 0.12 },
  { min: 47150, max: 100525, rate: 0.22 },
  { min: 100525, max: 191950, rate: 0.24 },
  { min: 191950, max: 243725, rate: 0.32 },
  { min: 243725, max: 609350, rate: 0.35 },
  { min: 609350, max: Infinity, rate: 0.37 },
];

// ============================================================================
// Test Helpers
// ============================================================================

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

function createEmployee(baseAmount: number, deductions: Deduction[] = []) {
  return {
    hireDate: new Date('2020-01-01'),
    compensation: {
      baseAmount,
      currency: 'BDT',
      frequency: 'monthly' as const,
      allowances: [],
      deductions,
    },
  };
}

// ============================================================================
// Test Suite: Bangladesh Tax Scenarios
// ============================================================================

describe('Bangladesh Tax Calculation Scenarios', () => {
  describe('1. Standard Tax-Free Threshold (৳3,50,000)', () => {
    it('should apply ৳3,50,000 standard deduction for regular taxpayers', () => {
      // Employee earning ৳50,000/month = ৳6,00,000/year
      // After ৳3,50,000 deduction = ৳2,50,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳1,50,000 × 10% = ৳5,000 + ৳15,000 = ৳20,000/year
      // Monthly: ৳20,000 / 12 = ৳1,666.67

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Verify tax is calculated correctly
      expect(result.taxAmount).toBeCloseTo(1666.67, 0);
      expect(result.taxableAmount).toBe(50000);
    });

    it('should result in zero tax for income below threshold', () => {
      // Employee earning ৳25,000/month = ৳3,00,000/year
      // After ৳3,50,000 deduction = negative, so ৳0 taxable
      // Tax: ৳0

      const result = calculateSalaryBreakdown({
        employee: createEmployee(25000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(0);
    });

    it('should calculate higher tax without standard deduction', () => {
      const withDeduction = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      const withoutDeduction = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        // No taxOptions - no deduction applied
      });

      expect(withoutDeduction.taxAmount).toBeGreaterThan(withDeduction.taxAmount!);
    });
  });

  describe('2. Special Thresholds for Women/Seniors (৳4,00,000)', () => {
    it('should apply ৳4,00,000 threshold for female taxpayers', () => {
      // Employee earning ৳50,000/month = ৳6,00,000/year
      // Female threshold ৳4,00,000 → ৳2,00,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳1,00,000 × 10% = ৳5,000 + ৳10,000 = ৳15,000/year
      // Monthly: ৳15,000 / 12 = ৳1,250

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'female',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(1250);
    });

    it('should apply ৳4,00,000 threshold for senior taxpayers (65+)', () => {
      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'senior',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Same threshold as female
      expect(result.taxAmount).toBe(1250);
    });

    it('should apply ৳4,75,000 threshold for disabled taxpayers', () => {
      // Employee earning ৳50,000/month = ৳6,00,000/year
      // Disabled threshold ৳4,75,000 → ৳1,25,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳25,000 × 10% = ৳5,000 + ৳2,500 = ৳7,500/year
      // Monthly: ৳7,500 / 12 = ৳625

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'disabled',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(625);
    });

    it('should apply highest threshold for gazetted freedom fighters', () => {
      // ৳5,00,000 threshold → ৳1,00,000 taxable
      // Tax: ৳1,00,000 × 5% = ৳5,000/year
      // Monthly: ৳5,000 / 12 ≈ ৳416.67

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'gazetted_hero',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBeCloseTo(416.67, 0);
    });

    it('female taxpayer should pay less tax than standard male taxpayer', () => {
      const standardResult = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'standard',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      const femaleResult = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'female',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(femaleResult.taxAmount).toBeLessThan(standardResult.taxAmount!);
      // Female saves ৳50,000 more in threshold → saves ৳5,000 in tax (10% bracket)
      // Monthly difference: ৳5,000 / 12 ≈ ৳416.67
      expect(standardResult.taxAmount! - femaleResult.taxAmount!).toBeCloseTo(416.67, 0);
    });
  });

  describe('3. Provident Fund Tax Benefit (Pre-Tax Deduction)', () => {
    it('should reduce taxable income by provident fund contribution', () => {
      // Employee earning ৳60,000/month with ৳6,000 PF (10%)
      // Gross: ৳60,000, PF deduction: ৳6,000
      // Taxable after PF: ৳54,000/month = ৳6,48,000/year
      // After standard deduction ৳3,50,000: ৳2,98,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳1,98,000 × 10% = ৳5,000 + ৳19,800 = ৳24,800/year
      // Monthly: ≈ ৳2,066.67

      const result = calculateSalaryBreakdown({
        employee: createEmployee(60000, [
          {
            type: 'provident_fund',
            amount: 6000,
            reducesTaxableIncome: true, // This is the key!
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Taxable amount should be reduced by PF
      expect(result.taxableAmount).toBe(54000);
      expect(result.taxAmount).toBeCloseTo(2066.67, 0);
    });

    it('should auto-detect PF as pre-tax from jurisdiction config', () => {
      // Same scenario but without explicit reducesTaxableIncome flag
      // Jurisdiction config lists 'provident_fund' as pre-tax type

      const result = calculateSalaryBreakdown({
        employee: createEmployee(60000, [
          {
            type: 'provident_fund',
            amount: 6000,
            // No reducesTaxableIncome - will be auto-detected
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxableAmount).toBe(54000);
    });

    it('loan deduction should NOT reduce taxable income', () => {
      const withPF = calculateSalaryBreakdown({
        employee: createEmployee(60000, [
          {
            type: 'provident_fund',
            amount: 6000,
            reducesTaxableIncome: true,
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      const withLoan = calculateSalaryBreakdown({
        employee: createEmployee(60000, [
          {
            type: 'loan',
            amount: 6000,
            // Loan is NOT pre-tax
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Loan doesn't reduce taxable income
      expect(withLoan.taxableAmount).toBe(60000);
      expect(withPF.taxableAmount).toBe(54000);
      expect(withLoan.taxAmount).toBeGreaterThan(withPF.taxAmount!);
    });

    it('should combine PF benefit with female threshold', () => {
      // Female earning ৳60,000 with ৳6,000 PF
      // Taxable after PF: ৳54,000/month = ৳6,48,000/year
      // Female threshold ৳4,00,000: ৳2,48,000 taxable
      // Tax: ৳1,00,000 × 5% + ৳1,48,000 × 10% = ৳5,000 + ৳14,800 = ৳19,800/year
      // Monthly: ৳1,650

      const result = calculateSalaryBreakdown({
        employee: createEmployee(60000, [
          {
            type: 'provident_fund',
            amount: 6000,
            reducesTaxableIncome: true,
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'female',
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(1650);
    });
  });

  describe('4. Investment Rebate (Tax Credit with 15% Cap)', () => {
    it('should apply 15% investment rebate on taxable income', () => {
      // Employee earning ৳80,000/month = ৳9,60,000/year
      // Standard deduction ৳3,50,000 → ৳6,10,000 taxable
      // Tax before rebate: ৳1,00,000×5% + ৳3,00,000×10% + ৳2,10,000×15%
      //                  = ৳5,000 + ৳30,000 + ৳31,500 = ৳66,500/year
      //
      // Investment rebate: Employee declares ৳2,00,000 investment
      // Rebate = 15% of eligible investment = ৳30,000
      // But capped at 15% of tax = ৳66,500 × 15% = ৳9,975
      //
      // Tax after rebate: ৳66,500 - ৳9,975 = ৳56,525/year
      // Monthly: ≈ ৳4,710.42

      const result = calculateSalaryBreakdown({
        employee: createEmployee(80000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
          taxCredits: [
            {
              type: 'investment_rebate',
              amount: 30000, // 15% of ৳2,00,000 investment
              maxPercent: 0.15, // Capped at 15% of tax liability
            },
          ],
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Tax should be reduced by the capped rebate
      expect(result.taxAmount).toBeCloseTo(4710.42, 0);
    });

    it('should allow full rebate when within 15% cap', () => {
      // Lower earner with smaller investment
      // ৳50,000/month = ৳6,00,000/year
      // After ৳3,50,000 deduction = ৳2,50,000 taxable
      // Tax: ৳20,000/year (from earlier test)
      //
      // Small investment rebate: ৳2,000 (already calculated as 15% of investment)
      // 15% cap: ৳20,000 × 15% = ৳3,000
      // Since ৳2,000 < ৳3,000, full rebate applies
      //
      // Tax after rebate: ৳20,000 - ৳2,000 = ৳18,000/year
      // Monthly: ৳1,500

      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
          taxCredits: [
            {
              type: 'investment_rebate',
              amount: 2000,
              maxPercent: 0.15,
            },
          ],
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(1500);
    });

    it('should combine all benefits: female + PF + investment rebate', () => {
      // Ultimate tax optimization scenario
      // Female earning ৳1,00,000/month with ৳10,000 PF
      //
      // Gross: ৳1,00,000, PF: ৳10,000
      // Taxable after PF: ৳90,000/month = ৳10,80,000/year
      // Female threshold ৳4,00,000 → ৳6,80,000 taxable
      //
      // Tax before rebate: ৳1,00,000×5% + ৳3,00,000×10% + ৳2,80,000×15%
      //                  = ৳5,000 + ৳30,000 + ৳42,000 = ৳77,000/year
      //
      // Investment rebate: ৳15,000 (15% of ৳1,00,000 investment)
      // 15% cap: ৳77,000 × 15% = ৳11,550
      // Capped rebate: ৳11,550
      //
      // Tax after rebate: ৳77,000 - ৳11,550 = ৳65,450/year
      // Monthly: ≈ ৳5,454.17

      const result = calculateSalaryBreakdown({
        employee: createEmployee(100000, [
          {
            type: 'provident_fund',
            amount: 10000,
            reducesTaxableIncome: true,
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          taxpayerCategory: 'female',
          taxCredits: [
            {
              type: 'investment_rebate',
              amount: 15000,
              maxPercent: 0.15,
            },
          ],
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxableAmount).toBe(90000); // After PF
      expect(result.taxAmount).toBeCloseTo(5454.17, 0);
    });
  });

  describe('5. Edge Cases & Boundary Conditions', () => {
    it('should handle income exactly at threshold boundary', () => {
      // ৳29,166.67/month = ৳3,50,000/year (exactly at threshold)
      const result = calculateSalaryBreakdown({
        employee: createEmployee(29166.67),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Should be zero or very close to zero
      expect(result.taxAmount).toBeLessThan(1);
    });

    it('should handle income ৳1 above threshold', () => {
      // ৳29,167/month ≈ ৳3,50,004/year
      // Taxable: ৳4 at 5% = ৳0.20/year ≈ ৳0.02/month (rounds to 0)
      const result = calculateSalaryBreakdown({
        employee: createEmployee(29167),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBeGreaterThanOrEqual(0);
    });

    it('should handle very high earners correctly', () => {
      // ৳5,00,000/month = ৳60,00,000/year
      // After ৳3,50,000: ৳56,50,000 taxable
      // Tax: ৳1L×5% + ৳3L×10% + ৳3L×15% + ৳4L×20% + ৳45,50,000×25%
      //    = ৳5K + ৳30K + ৳45K + ৳80K + ৳11,37,500 = ৳12,97,500/year
      // Monthly: ৳1,08,125

      const result = calculateSalaryBreakdown({
        employee: createEmployee(500000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(108125);
    });

    it('should handle multiple pre-tax deductions', () => {
      // PF + Pension contributions
      const result = calculateSalaryBreakdown({
        employee: createEmployee(80000, [
          {
            type: 'provident_fund',
            amount: 8000,
            reducesTaxableIncome: true,
            auto: true,
            recurring: true,
          },
          {
            type: 'pension',
            amount: 4000,
            reducesTaxableIncome: true,
            auto: true,
            recurring: true,
          },
        ]),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Both deductions should reduce taxable income
      expect(result.taxableAmount).toBe(68000); // 80000 - 8000 - 4000
    });

    it('should handle multiple tax credits', () => {
      // Investment rebate + charitable donation credit
      const result = calculateSalaryBreakdown({
        employee: createEmployee(100000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
          taxCredits: [
            { type: 'investment_rebate', amount: 20000, maxPercent: 0.15 },
            { type: 'charitable', amount: 5000 }, // No cap
          ],
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      // Both credits should be applied
      const withoutCredits = calculateSalaryBreakdown({
        employee: createEmployee(100000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBeLessThan(withoutCredits.taxAmount!);
    });

    it('should not allow negative tax from excessive credits', () => {
      // Huge investment declaration
      const result = calculateSalaryBreakdown({
        employee: createEmployee(50000),
        period: basePeriod,
        config: baseConfig,
        taxBrackets: bdTaxBrackets,
        taxOptions: {
          applyStandardDeduction: true,
          taxCredits: [
            { type: 'investment_rebate', amount: 1000000 }, // Way more than tax
          ],
        },
        jurisdictionTaxConfig: bdJurisdictionConfig,
      });

      expect(result.taxAmount).toBe(0);
      expect(result.taxAmount).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// Test Suite: US Tax Scenarios (Cross-Jurisdiction Comparison)
// ============================================================================

describe('US Tax Calculation Scenarios (Comparison)', () => {
  const usConfig = {
    ...baseConfig,
    defaultCurrency: 'USD',
  };

  const usPeriod = {
    ...basePeriod,
  };

  it('should apply US standard deduction for single filer', () => {
    // $5,000/month = $60,000/year
    // Standard deduction $14,600 → $45,400 taxable
    // Tax: $11,600×10% + $33,800×12% = $1,160 + $4,056 = $5,216/year
    // Monthly: ≈ $434.67

    const result = calculateSalaryBreakdown({
      employee: {
        hireDate: new Date('2020-01-01'),
        compensation: {
          baseAmount: 5000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      },
      period: usPeriod,
      config: usConfig,
      taxBrackets: usTaxBrackets,
      taxOptions: {
        taxpayerCategory: 'standard',
      },
      jurisdictionTaxConfig: usJurisdictionConfig,
    });

    expect(result.taxAmount).toBeCloseTo(434.67, 0);
  });

  it('should apply higher deduction for married filing jointly', () => {
    const singleResult = calculateSalaryBreakdown({
      employee: {
        hireDate: new Date('2020-01-01'),
        compensation: {
          baseAmount: 10000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      },
      period: usPeriod,
      config: usConfig,
      taxBrackets: usTaxBrackets,
      taxOptions: {
        taxpayerCategory: 'standard',
      },
      jurisdictionTaxConfig: usJurisdictionConfig,
    });

    const marriedResult = calculateSalaryBreakdown({
      employee: {
        hireDate: new Date('2020-01-01'),
        compensation: {
          baseAmount: 10000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      },
      period: usPeriod,
      config: usConfig,
      taxBrackets: usTaxBrackets,
      taxOptions: {
        taxpayerCategory: 'married_filing_jointly',
      },
      jurisdictionTaxConfig: usJurisdictionConfig,
    });

    // Married should pay less tax
    expect(marriedResult.taxAmount).toBeLessThan(singleResult.taxAmount!);
  });

  it('should handle 401k pre-tax deduction (US equivalent of PF)', () => {
    // $8,000/month with $1,600 401k contribution (20%)
    const result = calculateSalaryBreakdown({
      employee: {
        hireDate: new Date('2020-01-01'),
        compensation: {
          baseAmount: 8000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [
            {
              type: '401k',
              amount: 1600,
              // Will be auto-detected as pre-tax from US jurisdiction config
              auto: true,
              recurring: true,
            },
          ],
        },
      },
      period: usPeriod,
      config: usConfig,
      taxBrackets: usTaxBrackets,
      taxOptions: {
        taxpayerCategory: 'standard',
      },
      jurisdictionTaxConfig: usJurisdictionConfig,
    });

    expect(result.taxableAmount).toBe(6400); // 8000 - 1600
  });
});

// ============================================================================
// Test Suite: Processing Options
// ============================================================================

describe('Processing Options', () => {
  it('should skip tax calculation when skipTax is true', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(50000),
      period: basePeriod,
      config: baseConfig,
      taxBrackets: bdTaxBrackets,
      options: {
        skipTax: true,
      },
      taxOptions: {
        applyStandardDeduction: true,
        taxpayerCategory: 'female',
        taxCredits: [{ type: 'investment', amount: 10000 }],
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    // Tax should be skipped despite all the tax options
    expect(result.taxAmount).toBe(0);
  });

  it('should skip tax when autoDeductions is false', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(50000),
      period: basePeriod,
      config: {
        ...baseConfig,
        autoDeductions: false,
      },
      taxBrackets: bdTaxBrackets,
      taxOptions: {
        applyStandardDeduction: true,
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    expect(result.taxAmount).toBe(0);
  });

  it('should skip tax when no tax brackets provided', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(50000),
      period: basePeriod,
      config: baseConfig,
      taxBrackets: [], // Empty brackets
      taxOptions: {
        applyStandardDeduction: true,
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    expect(result.taxAmount).toBe(0);
  });
});

// ============================================================================
// Test Suite: Error Handling & Invalid Inputs
// ============================================================================

describe('Error Handling & Invalid Inputs', () => {
  it('should handle unknown taxpayer category gracefully', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(50000),
      period: basePeriod,
      config: baseConfig,
      taxBrackets: bdTaxBrackets,
      taxOptions: {
        taxpayerCategory: 'unknown_category',
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    // Should fall back to no threshold (no error)
    expect(result.taxAmount).toBeGreaterThan(0);
  });

  it('should handle empty tax brackets', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(50000),
      period: basePeriod,
      config: baseConfig,
      taxBrackets: [],
      taxOptions: {
        applyStandardDeduction: true,
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    // No brackets = no tax
    expect(result.taxAmount).toBe(0);
  });

  it('should handle zero income', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(0),
      period: basePeriod,
      config: baseConfig,
      taxBrackets: bdTaxBrackets,
      taxOptions: {
        applyStandardDeduction: true,
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    expect(result.taxAmount).toBe(0);
    expect(result.grossSalary).toBe(0);
  });

  it('should handle negative credit amount gracefully', () => {
    const result = calculateSalaryBreakdown({
      employee: createEmployee(50000),
      period: basePeriod,
      config: baseConfig,
      taxBrackets: bdTaxBrackets,
      taxOptions: {
        applyStandardDeduction: true,
        taxCredits: [
          { type: 'invalid', amount: -1000 }, // Negative credit (invalid)
        ],
      },
      jurisdictionTaxConfig: bdJurisdictionConfig,
    });

    // Should handle gracefully (negative credit = increase tax, but shouldn't crash)
    expect(result.taxAmount).toBeDefined();
  });
});

/**
 * Salary Breakdown Calculator Tests
 * 
 * Pure function tests - no database required!
 * This is the SINGLE SOURCE OF TRUTH for salary calculations.
 */

import { describe, it, expect } from 'vitest';
import { calculateSalaryBreakdown } from '../../src/calculators/salary.calculator.js';

describe('Salary Breakdown Calculator', () => {
  const baseConfig = {
    allowProRating: true,
    autoDeductions: true,
    defaultCurrency: 'BDT',
    attendanceIntegration: true,
  };

  // Bangladesh FY 2024-25 brackets (after tax-free threshold)
  // Threshold is handled via jurisdictionTaxConfig.standardDeduction
  const bdtTaxBrackets = [
    { min: 0, max: 100000, rate: 0.05 },
    { min: 100000, max: 400000, rate: 0.10 },
    { min: 400000, max: 700000, rate: 0.15 },
    { min: 700000, max: 1100000, rate: 0.20 },
    { min: 1100000, max: Infinity, rate: 0.25 },
  ];

  describe('Basic Salary Calculation', () => {
    it('should calculate basic salary with no allowances/deductions', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBe(100000);
      expect(result.grossSalary).toBe(100000);
      expect(result.taxAmount).toBeGreaterThan(0); // Has income tax
      expect(result.netSalary).toBeLessThan(100000); // After tax
    });

    it('should handle allowances correctly', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [
              { type: 'housing', amount: 20000, taxable: true, recurring: true },
              { type: 'transport', amount: 10000, taxable: false, recurring: true },
            ],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.allowances).toHaveLength(2);
      expect(result.grossSalary).toBe(130000); // 100000 + 20000 + 10000
    });

    it('should handle percentage-based allowances', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [
              { type: 'housing', amount: 0, isPercentage: true, value: 20, taxable: true, recurring: true }, // 20%
            ],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.allowances[0].amount).toBe(20000); // 20% of 100000
      expect(result.grossSalary).toBe(120000);
    });

    it('should handle percentage-based deductions', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [
              { type: 'insurance', amount: 0, isPercentage: true, value: 5, recurring: true, auto: true }, // 5%
            ],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      const insuranceDeduction = result.deductions.find(d => d.type === 'insurance');
      expect(insuranceDeduction?.amount).toBe(5000); // 5% of 100000
    });
  });

  describe('Pro-Rating', () => {
    it('should pro-rate salary for mid-month hire', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-03-15'), // Hired mid-month
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBeLessThan(100000); // Pro-rated
      expect(result.proRatedAmount).toBeGreaterThan(0);
      expect(result.workingDays).toBeGreaterThan(result.actualDays!);
    });

    it('should not pro-rate when skipProration is true', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-03-15'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        options: {
          skipProration: true,
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBe(100000); // Full salary
      expect(result.proRatedAmount).toBe(0);
    });

    it('should pro-rate allowances along with base salary', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-03-15'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [
              { type: 'housing', amount: 20000, taxable: true, recurring: true },
            ],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      // Both base and allowance should be pro-rated
      expect(result.baseAmount).toBeLessThan(100000);
      expect(result.allowances[0].amount).toBeLessThan(20000);
    });
  });

  describe('Attendance Integration', () => {
    it('should calculate attendance deduction', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        attendance: {
          expectedDays: 22,
          actualDays: 20, // 2 days absent
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      const absenceDeduction = result.deductions.find(d => d.type === 'absence');
      expect(absenceDeduction).toBeDefined();
      expect(absenceDeduction!.amount).toBeGreaterThan(0);
      expect(result.attendanceDeduction).toBeGreaterThan(0);
    });

    it('should skip attendance when skipAttendance is true', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        attendance: {
          expectedDays: 22,
          actualDays: 10, // Major absence
        },
        options: {
          skipAttendance: true,
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      const absenceDeduction = result.deductions.find(d => d.type === 'absence');
      expect(absenceDeduction).toBeUndefined();
      expect(result.attendanceDeduction).toBe(0);
    });

    it('should handle no attendance data provided', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        // No attendance data
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.attendanceDeduction).toBe(0);
    });
  });

  describe('Tax Calculation', () => {
    it('should calculate income tax for taxable income', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeDefined();
      expect(result.taxAmount).toBeGreaterThan(0);
    });

    it('should skip tax when skipTax is true', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        options: {
          skipTax: true,
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      const taxDeduction = result.deductions.find(d => d.type === 'tax');
      expect(taxDeduction).toBeUndefined();
      expect(result.taxAmount).toBe(0);
    });

    it('should only tax taxable allowances', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [
              { type: 'housing', amount: 20000, taxable: true, recurring: true },
              { type: 'transport', amount: 10000, taxable: false, recurring: true }, // Non-taxable
            ],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      // Taxable amount = base (100000) + taxable allowance (20000) = 120000
      expect(result.taxableAmount).toBe(120000);
      // Tax should be calculated on 120000 * 12 = 1,440,000 annual
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mid-month hire with allowances and attendance', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-03-15'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [
              { type: 'housing', amount: 20000, taxable: true, recurring: true },
            ],
            deductions: [
              { type: 'insurance', amount: 5000, recurring: true, auto: true },
            ],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        attendance: {
          expectedDays: 11, // Only worked from 15th
          actualDays: 10, // 1 day absent
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      // Base should be pro-rated
      expect(result.baseAmount).toBeLessThan(100000);
      // Allowances should be pro-rated
      expect(result.allowances[0].amount).toBeLessThan(20000);
      // Deductions should be pro-rated
      const insuranceDeduction = result.deductions.find(d => d.type === 'insurance');
      expect(insuranceDeduction!.amount).toBeLessThan(5000);
      // Attendance deduction should exist
      expect(result.attendanceDeduction).toBeGreaterThan(0);
    });

    it('should handle all options combined', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [
              { type: 'housing', amount: 0, isPercentage: true, value: 20, taxable: true, recurring: true },
            ],
            deductions: [
              { type: 'insurance', amount: 0, isPercentage: true, value: 5, recurring: true, auto: true },
            ],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        attendance: {
          expectedDays: 22,
          actualDays: 20,
        },
        options: {
          holidays: [new Date('2024-03-26')], // Eid holiday
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBe(100000);
      expect(result.allowances[0].amount).toBe(20000); // 20% of base
      const insuranceDeduction = result.deductions.find(d => d.type === 'insurance');
      expect(insuranceDeduction!.amount).toBe(5000); // 5% of base
      expect(result.attendanceDeduction).toBeGreaterThan(0);
      expect(result.taxAmount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero base salary', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 0, // Unpaid intern
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBe(0);
      expect(result.grossSalary).toBe(0);
      expect(result.netSalary).toBe(0);
      expect(result.taxAmount).toBe(0);
    });

    it('should handle employee hired and terminated in same month', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-03-05'),
          terminationDate: new Date('2024-03-25'),
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBeLessThan(100000); // Pro-rated for partial month
      expect(result.proRatedAmount).toBeGreaterThan(0);
    });

    it('should handle employee not active during period', () => {
      const result = calculateSalaryBreakdown({
        employee: {
          hireDate: new Date('2024-04-01'), // Hired after period
          compensation: {
            baseAmount: 100000,
            currency: 'BDT',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        },
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
        },
        config: baseConfig,
        taxBrackets: bdtTaxBrackets,
      });

      expect(result.baseAmount).toBe(0); // Zero salary
      expect(result.netSalary).toBe(0);
    });
  });

  // ============================================================================
  // Enhanced Tax Calculation Tests
  // ============================================================================

  describe('Enhanced Tax Calculation', () => {
    describe('Standard Deduction / Tax-Free Threshold', () => {
      it('should apply standard deduction from jurisdiction config', () => {
        // Annual income: 100000 * 12 = 1,200,000
        // Standard deduction: 350,000
        // Taxable: 850,000
        // Tax: 0 (first 300k) + 5000 (next 100k@5%) + 10000 (next 100k@10%) + 15000 (next 100k@15%) + 50000 (next 250k@20%) = 80,000 annual = 6666.67/month
        const result = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            applyStandardDeduction: true,
          },
          jurisdictionTaxConfig: {
            standardDeduction: 350000,
          },
        });

        // Should have lower tax due to standard deduction
        const resultWithoutDeduction = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        expect(result.taxAmount).toBeLessThan(resultWithoutDeduction.taxAmount!);
      });

      it('should use standardDeductionOverride over jurisdiction config', () => {
        const resultWithOverride = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            applyStandardDeduction: true,
            standardDeductionOverride: 500000, // Higher override
          },
          jurisdictionTaxConfig: {
            standardDeduction: 350000, // Lower in config
          },
        });

        const resultWithConfig = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            applyStandardDeduction: true,
          },
          jurisdictionTaxConfig: {
            standardDeduction: 350000,
          },
        });

        // Override is higher, so tax should be lower
        expect(resultWithOverride.taxAmount).toBeLessThan(resultWithConfig.taxAmount!);
      });
    });

    describe('Demographic-Based Thresholds (taxpayerCategory)', () => {
      const jurisdictionWithCategories = {
        standardDeduction: 350000,
        thresholdsByCategory: {
          standard: 350000,
          senior: 450000,    // Higher threshold for seniors
          disabled: 500000,  // Highest for disabled
          female: 400000,    // Bangladesh-style female threshold
        },
      };

      it('should apply higher threshold for senior citizens', () => {
        const standardResult = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'standard',
          },
          jurisdictionTaxConfig: jurisdictionWithCategories,
        });

        const seniorResult = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'senior',
          },
          jurisdictionTaxConfig: jurisdictionWithCategories,
        });

        // Senior should pay less tax
        expect(seniorResult.taxAmount).toBeLessThan(standardResult.taxAmount!);
      });

      it('should apply highest threshold for disabled taxpayers', () => {
        const standardResult = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'standard',
          },
          jurisdictionTaxConfig: jurisdictionWithCategories,
        });

        const disabledResult = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'disabled',
          },
          jurisdictionTaxConfig: jurisdictionWithCategories,
        });

        expect(disabledResult.taxAmount).toBeLessThan(standardResult.taxAmount!);
      });

      it('should use thresholdOverrides over jurisdiction thresholds', () => {
        const resultWithOverride = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'senior',
            thresholdOverrides: {
              senior: 600000, // Custom higher threshold
            },
          },
          jurisdictionTaxConfig: jurisdictionWithCategories,
        });

        const resultWithJurisdiction = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'senior',
          },
          jurisdictionTaxConfig: jurisdictionWithCategories,
        });

        // Override threshold is higher, so tax should be lower
        expect(resultWithOverride.taxAmount).toBeLessThan(resultWithJurisdiction.taxAmount!);
      });
    });

    describe('Pre-Tax Deductions', () => {
      it('should reduce taxable income for deductions with reducesTaxableIncome flag', () => {
        const resultWithPreTax = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [
                {
                  type: 'provident_fund',
                  amount: 10000,
                  reducesTaxableIncome: true, // Pre-tax
                  auto: true,
                  recurring: true,
                },
              ],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        const resultWithoutPreTax = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [
                {
                  type: 'loan',
                  amount: 10000,
                  // reducesTaxableIncome not set = post-tax
                  auto: true,
                  recurring: true,
                },
              ],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        // Pre-tax deduction should result in lower taxable amount
        expect(resultWithPreTax.taxableAmount).toBeLessThan(resultWithoutPreTax.taxableAmount!);
        // And therefore lower tax
        expect(resultWithPreTax.taxAmount).toBeLessThan(resultWithoutPreTax.taxAmount!);
      });

      it('should auto-detect pre-tax deductions from jurisdiction config', () => {
        const resultWithAutoDetect = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [
                {
                  type: 'provident_fund',
                  amount: 10000,
                  // reducesTaxableIncome NOT set - will be detected from jurisdiction
                  auto: true,
                  recurring: true,
                },
              ],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          jurisdictionTaxConfig: {
            preTaxDeductionTypes: ['provident_fund', 'pension', '401k'],
          },
        });

        const resultWithoutConfig = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [
                {
                  type: 'provident_fund',
                  amount: 10000,
                  auto: true,
                  recurring: true,
                },
              ],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          // No jurisdiction config
        });

        // With jurisdiction config, provident_fund is recognized as pre-tax
        expect(resultWithAutoDetect.taxableAmount).toBeLessThan(resultWithoutConfig.taxableAmount!);
        expect(resultWithAutoDetect.taxAmount).toBeLessThan(resultWithoutConfig.taxAmount!);
      });

      it('should apply explicit preTaxDeductions from taxOptions', () => {
        const resultWithExplicitPreTax = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            preTaxDeductions: [
              { type: 'pension', amount: 15000 },
              { type: 'health_savings', amount: 5000 },
            ],
          },
        });

        const resultWithoutPreTax = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        // Pre-tax deductions reduce taxable amount
        expect(resultWithExplicitPreTax.taxableAmount).toBe(100000 - 15000 - 5000);
        expect(resultWithExplicitPreTax.taxAmount).toBeLessThan(resultWithoutPreTax.taxAmount!);
      });
    });

    describe('Tax Credits / Rebates', () => {
      it('should apply tax credits after tax calculation', () => {
        const resultWithCredit = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxCredits: [
              { type: 'investment', amount: 50000 }, // Annual credit
            ],
          },
        });

        const resultWithoutCredit = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        // Tax credit reduces tax liability
        expect(resultWithCredit.taxAmount).toBeLessThan(resultWithoutCredit.taxAmount!);
      });

      it('should respect maxPercent cap on tax credits', () => {
        // Calculate tax without credit first
        const resultWithoutCredit = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        const resultWithCappedCredit = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxCredits: [
              { type: 'investment', amount: 1000000, maxPercent: 0.15 }, // Huge credit, but capped at 15%
            ],
          },
        });

        // Credit is capped at 15% of tax
        const expectedMaxReduction = resultWithoutCredit.taxAmount! * 0.15;
        const actualReduction = resultWithoutCredit.taxAmount! - resultWithCappedCredit.taxAmount!;

        // Allow small rounding difference
        expect(actualReduction).toBeLessThanOrEqual(expectedMaxReduction + 1);
        expect(actualReduction).toBeGreaterThan(0);
      });

      it('should not reduce tax below zero', () => {
        const result = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 50000, // Lower income, lower tax
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxCredits: [
              { type: 'investment', amount: 500000 }, // Credit exceeds tax
            ],
          },
        });

        expect(result.taxAmount).toBeGreaterThanOrEqual(0);
      });

      it('should apply multiple credits in sequence', () => {
        const result = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxCredits: [
              { type: 'investment', amount: 20000 },
              { type: 'charitable', amount: 10000 },
              { type: 'education', amount: 15000 },
            ],
          },
        });

        const resultWithoutCredit = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        // All credits should be applied
        expect(result.taxAmount).toBeLessThan(resultWithoutCredit.taxAmount!);
      });
    });

    describe('Combined Tax Options', () => {
      it('should handle all tax options together', () => {
        const result = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [
                {
                  type: 'provident_fund',
                  amount: 10000,
                  reducesTaxableIncome: true,
                  auto: true,
                  recurring: true,
                },
              ],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          taxOptions: {
            taxpayerCategory: 'senior',
            preTaxDeductions: [{ type: 'pension', amount: 5000 }],
            taxCredits: [{ type: 'investment', amount: 10000 }],
          },
          jurisdictionTaxConfig: {
            standardDeduction: 350000,
            thresholdsByCategory: {
              standard: 350000,
              senior: 450000,
            },
          },
        });

        const baseline = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
        });

        // Should have significantly lower tax due to all benefits
        expect(result.taxAmount).toBeLessThan(baseline.taxAmount!);
        // Pre-tax deductions reduce taxable amount
        expect(result.taxableAmount).toBeLessThan(baseline.taxableAmount!);
      });

      it('should work correctly with no tax options (backward compatibility)', () => {
        const result = calculateSalaryBreakdown({
          employee: {
            hireDate: new Date('2024-01-01'),
            compensation: {
              baseAmount: 100000,
              currency: 'BDT',
              frequency: 'monthly',
              allowances: [],
              deductions: [],
            },
          },
          period: {
            month: 3,
            year: 2024,
            startDate: new Date('2024-03-01'),
            endDate: new Date('2024-03-31'),
          },
          config: baseConfig,
          taxBrackets: bdtTaxBrackets,
          // No taxOptions or jurisdictionTaxConfig
        });

        // Should work exactly as before
        expect(result.taxableAmount).toBe(100000);
        expect(result.taxAmount).toBeGreaterThan(0);
        expect(result.grossSalary).toBe(100000);
      });
    });
  });
});


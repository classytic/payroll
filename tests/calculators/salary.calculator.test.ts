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

  const bdtTaxBrackets = [
    { min: 0, max: 300000, rate: 0 },
    { min: 300000, max: 400000, rate: 0.05 },
    { min: 400000, max: 500000, rate: 0.1 },
    { min: 500000, max: 600000, rate: 0.15 },
    { min: 600000, max: 3000000, rate: 0.2 },
    { min: 3000000, max: Infinity, rate: 0.25 },
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
});


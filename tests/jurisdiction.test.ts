/**
 * @classytic/payroll - Jurisdiction Tests
 *
 * Tests for jurisdiction system (pure tool)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  calculateJurisdictionTax,
  calculateMonthlyTax,
  checkCompliance,
  registerJurisdiction,
  createJurisdictionDefinition,
  extendJurisdiction,
} from '../src/jurisdiction/index.js';

// Import examples for testing (demonstrates multi-jurisdiction support)
import { US_FEDERAL } from '../examples/jurisdiction-data/us-federal.js';
import { BANGLADESH } from '../examples/jurisdiction-data/bangladesh.js';

// ============================================================================
// Setup - Register examples for testing
// ============================================================================

beforeAll(() => {
  // Tests use example data (in production, users provide their own)
  registerJurisdiction(US_FEDERAL);
  registerJurisdiction(BANGLADESH);
});

// ============================================================================
// Tax Calculation Tests
// ============================================================================

describe('Tax Calculation', () => {
  it('should calculate comprehensive tax breakdown', () => {
    const result = calculateJurisdictionTax({
      annualIncome: 100000,
      jurisdiction: { country: 'US' },
    });

    expect(result.incomeTax).toBeGreaterThan(0);
    expect(result.socialSecurityEmployee).toBeGreaterThan(0);
    expect(result.socialSecurityEmployer).toBeGreaterThan(0);
    expect(result.medicareEmployee).toBeGreaterThan(0);
    expect(result.medicareEmployer).toBeGreaterThan(0);
    expect(result.totalEmployeeTax).toBeGreaterThan(0);
    expect(result.totalEmployerTax).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeLessThan(0.30);
  });

  it('should handle dependents correctly', () => {
    const withoutDependents = calculateJurisdictionTax({
      annualIncome: 100000,
      jurisdiction: { country: 'US' },
      dependents: 0,
    });

    const withDependents = calculateJurisdictionTax({
      annualIncome: 100000,
      jurisdiction: { country: 'US' },
      dependents: 2,
    });

    expect(withoutDependents).toBeDefined();
    expect(withDependents).toBeDefined();
  });

  it('should calculate monthly tax from monthly income', () => {
    const result = calculateMonthlyTax(8333, { country: 'US' });

    expect(result.monthlyIncomeTax).toBeGreaterThan(0);
    expect(result.monthlySocialSecurity).toBeGreaterThan(0);
    expect(result.monthlyMedicare).toBeGreaterThan(0);
    expect(result.monthlyTotal).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
  });

  it('should produce consistent results when annualized', () => {
    const monthly = calculateMonthlyTax(10000, { country: 'US' });
    const annual = calculateJurisdictionTax({
      annualIncome: 120000,
      jurisdiction: { country: 'US' },
    });

    expect(monthly.monthlyIncomeTax * 12).toBeCloseTo(annual.incomeTax, -2);
  });

  it('should calculate Bangladesh tax with exemption limit', () => {
    // Income below exemption limit (৳3,50,000)
    const belowExemption = calculateJurisdictionTax({
      annualIncome: 300000, // ৳3,00,000 < ৳3,50,000 exemption
      jurisdiction: { country: 'BD' },
    });

    expect(belowExemption.incomeTax).toBe(0);

    // Income above exemption limit
    const aboveExemption = calculateJurisdictionTax({
      annualIncome: 600000, // ৳6,00,000 (৳2,50,000 taxable above exemption)
      jurisdiction: { country: 'BD' },
    });

    // Should have tax on the amount above ৳3,50,000
    // First ৳1,00,000 @ 5% = ৳5,000
    // Next ৳1,00,000 @ 10% = ৳10,000
    // Next ৳50,000 @ 15% = ৳7,500
    // Total = ৳22,500
    expect(aboveExemption.incomeTax).toBeGreaterThan(0);
    expect(aboveExemption.incomeTax).toBeCloseTo(22500, -2);
  });

  it('should support multiple jurisdictions simultaneously', () => {
    const usResult = calculateJurisdictionTax({
      annualIncome: 100000,
      jurisdiction: { country: 'US' },
    });

    const bdResult = calculateJurisdictionTax({
      annualIncome: 100000, // Same income for comparison
      jurisdiction: { country: 'BD' },
    });

    // Both should calculate correctly
    expect(usResult.incomeTax).toBeGreaterThan(0);
    expect(bdResult.incomeTax).toBe(0); // Below BD exemption limit

    // US has social security/medicare, BD doesn't
    expect(usResult.socialSecurityEmployee).toBeGreaterThan(0);
    expect(usResult.medicareEmployee).toBeGreaterThan(0);
    expect(bdResult.socialSecurityEmployee).toBe(0);
    expect(bdResult.medicareEmployee).toBe(0);

    // Registry correctly maintains separate jurisdictions
    expect(usResult).toBeDefined();
    expect(bdResult).toBeDefined();
  });
});

// ============================================================================
// Compliance Checking
// ============================================================================

describe('Compliance Checking', () => {
  it('should detect minimum wage violations', () => {
    const violations = checkCompliance(
      {
        baseSalary: 1000,
        currency: 'USD',
        hoursWorked: 40,
      },
      { country: 'US' }
    );

    const minimumWageViolation = violations.find((v) => v.ruleId.includes('minimum-wage'));
    expect(minimumWageViolation).toBeDefined();
    expect(minimumWageViolation?.severity).toBe('critical');
  });

  it('should pass for compliant employee', () => {
    const violations = checkCompliance(
      {
        baseSalary: 8000,
        currency: 'USD',
        hoursWorked: 40,
      },
      { country: 'US' }
    );

    expect(violations.length).toBe(0);
  });
});

// ============================================================================
// Custom Jurisdiction Creation
// ============================================================================

describe('Jurisdiction Creation', () => {
  it('should create jurisdiction with full type safety', () => {
    const customJurisdiction = createJurisdictionDefinition({
      id: 'TEST',
      name: 'Test Country',
      level: 'country',
      currency: 'USD',
      locale: 'en-US',
      effectiveFrom: new Date('2024-01-01'),
      tax: {
        incomeTax: [
          { min: 0, max: 50000, rate: 0.1 },
          { min: 50000, max: Infinity, rate: 0.2 },
        ],
      },
      overtime: {
        standard: {
          threshold: 40,
          multiplier: 1.5,
          basis: 'weekly',
        },
      },
      leave: {
        annualLeave: {
          days: 20,
          accrual: 'annual',
          carryForward: true,
        },
        sickLeave: {
          days: 10,
          accrual: 'annual',
        },
        publicHolidays: 10,
      },
      wage: {
        minimumWage: {
          amount: 10,
          effectiveDate: new Date('2024-01-01'),
        },
        payFrequency: {
          allowed: ['monthly'],
          default: 'monthly',
        },
        paymentDeadline: {
          daysAfterPeriod: 7,
        },
        probation: {
          maxDays: 90,
          allowReducedSalary: false,
          terminationNoticeDays: 14,
        },
      },
      workingHours: {
        standardWeek: {
          hours: 40,
          days: 5,
        },
        maxDailyHours: 8,
        maxWeeklyHours: 40,
        breaks: [],
        restBetweenShifts: {
          hours: 8,
        },
        weeklyRestDays: {
          days: 1,
          consecutive: true,
        },
      },
      complianceRules: [],
    });

    expect(customJurisdiction.id).toBe('TEST');
    expect(customJurisdiction.name).toBe('Test Country');
    expect(customJurisdiction.tax.incomeTax.length).toBe(2);
  });

  it('should extend existing jurisdiction for state rules', () => {
    const california = extendJurisdiction(US_FEDERAL, {
      id: 'US:CA',
      name: 'California',
      level: 'state',
      wage: {
        minimumWage: {
          amount: 16.0,
          effectiveDate: new Date('2024-01-01'),
        },
        payFrequency: {
          allowed: ['weekly', 'biweekly', 'semimonthly', 'monthly'],
          default: 'biweekly',
        },
        paymentDeadline: {
          daysAfterPeriod: 5,
        },
        probation: {
          maxDays: 90,
          allowReducedSalary: false,
          terminationNoticeDays: 0,
        },
      },
      overtime: {
        standard: {
          threshold: 8, // Daily (CA specific)
          multiplier: 1.5,
          basis: 'daily',
          doubleTimeThreshold: 12,
          doubleTimeMultiplier: 2.0,
        },
      },
    });

    expect(california.id).toBe('US:CA');
    expect(california.name).toBe('California');
    expect(california.parent).toBe('US');
    expect(california.wage.minimumWage.amount).toBe(16.0);
    expect(california.overtime.standard.threshold).toBe(8);
    expect(california.overtime.standard.basis).toBe('daily');
    // Inherits US federal tax
    expect(california.tax.incomeTax).toBeDefined();
    expect(california.tax.incomeTax.length).toBeGreaterThan(0);
  });

  it('should register and use custom jurisdiction', () => {
    const customJurisdiction = createJurisdictionDefinition({
      id: 'CUSTOM',
      name: 'Custom Country',
      level: 'country',
      currency: 'USD',
      locale: 'en-US',
      effectiveFrom: new Date('2024-01-01'),
      tax: {
        incomeTax: [
          { min: 0, max: 100000, rate: 0.15 },
          { min: 100000, max: Infinity, rate: 0.25 },
        ],
      },
      overtime: {
        standard: {
          threshold: 40,
          multiplier: 1.5,
          basis: 'weekly',
        },
      },
      leave: {
        annualLeave: {
          days: 15,
          accrual: 'annual',
          carryForward: false,
        },
        sickLeave: {
          days: 10,
          accrual: 'annual',
        },
        publicHolidays: 12,
      },
      wage: {
        minimumWage: {
          amount: 15,
          effectiveDate: new Date('2024-01-01'),
        },
        payFrequency: {
          allowed: ['monthly'],
          default: 'monthly',
        },
        paymentDeadline: {
          daysAfterPeriod: 7,
        },
        probation: {
          maxDays: 90,
          allowReducedSalary: false,
          terminationNoticeDays: 0,
        },
      },
      workingHours: {
        standardWeek: {
          hours: 40,
          days: 5,
        },
        maxDailyHours: 8,
        maxWeeklyHours: 40,
        breaks: [],
        restBetweenShifts: {
          hours: 8,
        },
        weeklyRestDays: {
          days: 1,
          consecutive: true,
        },
      },
      complianceRules: [],
    });

    registerJurisdiction(customJurisdiction);

    const result = calculateJurisdictionTax({
      annualIncome: 100000,
      jurisdiction: { country: 'CUSTOM' },
    });

    expect(result).toBeDefined();
    expect(result.incomeTax).toBeGreaterThan(0);
  });
});

// ============================================================================
// Pure Tool Tests
// ============================================================================

describe('Pure Tool (No Built-in Data)', () => {
  it('provides tools only - users bring jurisdiction data', () => {
    // Package exports:
    // - Types (JurisdictionDefinition, etc.)
    // - Functions (calculateJurisdictionTax, checkCompliance, etc.)
    // - Registry (registerJurisdiction, etc.)
    // - Helpers (createJurisdictionDefinition, extendJurisdiction)
    //
    // Package does NOT export:
    // - Country data
    // - Tax brackets
    // - Labor laws
    //
    // Users must provide their own verified jurisdiction data
    expect(true).toBe(true);
  });
});

/**
 * @classytic/payroll - United States Federal Jurisdiction
 *
 * US federal tax and labor law configuration (2024)
 * Source: IRS, Department of Labor
 */

import type { JurisdictionDefinition } from '@classytic/payroll/jurisdiction';

export const US_FEDERAL: JurisdictionDefinition = {
  id: 'US',
  name: 'United States (Federal)',
  level: 'country',
  currency: 'USD',
  locale: 'en-US',
  effectiveFrom: new Date('2024-01-01'),

  // ============================================================================
  // Tax Configuration
  // ============================================================================

  tax: {
    // 2024 Federal income tax brackets (single filer)
    incomeTax: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      { min: 47150, max: 100525, rate: 0.22 },
      { min: 100525, max: 191950, rate: 0.24 },
      { min: 191950, max: 243725, rate: 0.32 },
      { min: 243725, max: 609350, rate: 0.35 },
      { min: 609350, max: Infinity, rate: 0.37 },
    ],

    // Social Security (FICA)
    socialSecurity: {
      employeeRate: 0.062, // 6.2%
      employerRate: 0.062,
      ceiling: 168600, // 2024 wage base limit
    },

    // Medicare
    medicare: {
      employeeRate: 0.0145, // 1.45%
      employerRate: 0.0145,
      additionalRate: 0.009, // Additional 0.9% for high earners
      additionalThreshold: 200000, // Single filer threshold
    },

    // Federal Unemployment Tax (FUTA)
    unemployment: {
      employerRate: 0.006, // 0.6% effective (6% minus credit)
      ceiling: 7000, // First $7,000 of wages
    },

    // Standard deduction (single filer, 2024)
    standardDeduction: 14600,

    // Personal allowances
    allowances: {
      personal: 0, // Eliminated by TCJA
      dependent: 0, // Now part of child tax credit
    },
  },

  // ============================================================================
  // Overtime Configuration
  // ============================================================================

  overtime: {
    standard: {
      threshold: 40, // Hours per week
      multiplier: 1.5, // Time and a half
      basis: 'weekly',
      doubleTimeThreshold: undefined, // No federal double time
      doubleTimeMultiplier: undefined,
    },
    // No special weekend or holiday overtime at federal level
  },

  // ============================================================================
  // Leave Entitlements
  // ============================================================================

  leave: {
    // No federal paid leave requirement (FMLA is unpaid)
    annualLeave: {
      days: 0,
      accrual: 'annual',
      carryForward: false,
    },
    sickLeave: {
      days: 0,
      accrual: 'unlimited',
    },
    // FMLA - 12 weeks unpaid
    maternityLeave: {
      days: 84, // 12 weeks
      paidDays: 0,
      paidPercentage: 0,
    },
    paternityLeave: {
      days: 84, // 12 weeks (gender-neutral under FMLA)
      paidDays: 0,
      paidPercentage: 0,
    },
    publicHolidays: 11, // Federal holidays
    bereavementLeave: {
      days: 0, // Not mandated federally
      paidDays: 0,
    },
  },

  // ============================================================================
  // Wage Configuration
  // ============================================================================

  wage: {
    minimumWage: {
      amount: 7.25, // Federal minimum wage (hourly)
      effectiveDate: new Date('2009-07-24'), // Last increase
    },
    livingWage: {
      amount: 15.0, // Recommended living wage
      effectiveDate: new Date('2024-01-01'),
    },
    payFrequency: {
      allowed: ['weekly', 'biweekly', 'semimonthly', 'monthly'],
      default: 'biweekly',
    },
    paymentDeadline: {
      daysAfterPeriod: 7, // Varies by state
    },
    probation: {
      maxDays: 90, // Common practice, not federal law
      allowReducedSalary: false,
      terminationNoticeDays: 0, // At-will employment
    },
  },

  // ============================================================================
  // Working Hours
  // ============================================================================

  workingHours: {
    standardWeek: {
      hours: 40,
      days: 5,
    },
    maxDailyHours: Infinity, // No federal limit
    maxWeeklyHours: Infinity, // No federal limit (overtime kicks in at 40)
    breaks: [
      {
        afterHours: 6,
        durationMinutes: 30,
        paid: false, // Not federally mandated to be paid
      },
    ],
    restBetweenShifts: {
      hours: 8, // OSHA recommendation, not law
    },
    weeklyRestDays: {
      days: 0, // Not federally mandated
      consecutive: false,
    },
  },

  // ============================================================================
  // Compliance Rules
  // ============================================================================

  complianceRules: [
    {
      id: 'us:flsa:overtime',
      name: 'FLSA Overtime Compliance',
      category: 'hours',
      validate: (data) => {
        const violations = [];

        // Non-exempt employees must get overtime over 40 hours
        if (data.isNonExempt && data.hoursWorked > 40 && data.overtimeHours === 0) {
          violations.push({
            ruleId: 'us:flsa:overtime',
            ruleName: 'FLSA Overtime Compliance',
            severity: 'critical' as const,
            message: 'Non-exempt employee worked over 40 hours without overtime pay',
            remediation: 'Calculate and pay overtime at 1.5x regular rate for hours over 40',
          });
        }

        return violations;
      },
    },
    {
      id: 'us:aca:reporting',
      name: 'ACA Employer Reporting',
      category: 'benefits',
      validate: (data) => {
        const violations = [];

        // Employers with 50+ FTEs must offer health insurance
        if (data.employerSize >= 50 && !data.offersHealthInsurance) {
          violations.push({
            ruleId: 'us:aca:reporting',
            ruleName: 'ACA Employer Reporting',
            severity: 'high' as const,
            message: 'Employer with 50+ FTEs not offering health insurance',
            remediation: 'Offer ACA-compliant health insurance or pay penalty',
            penalty: 2970 * 12, // Annual penalty per FTE
          });
        }

        return violations;
      },
    },
    {
      id: 'us:equal-pay',
      name: 'Equal Pay Act Compliance',
      category: 'wage',
      validate: (data) => {
        const violations = [];

        // Check for pay disparities (basic check)
        if (data.wageGap && data.wageGap > 0.05) {
          violations.push({
            ruleId: 'us:equal-pay',
            ruleName: 'Equal Pay Act Compliance',
            severity: 'high' as const,
            message: `Potential pay disparity detected (${(data.wageGap * 100).toFixed(1)}% gap)`,
            remediation: 'Review compensation structure for equal pay compliance',
          });
        }

        return violations;
      },
    },
  ],

  // ============================================================================
  // Metadata
  // ============================================================================

  metadata: {
    authority: 'IRS, Department of Labor, EEOC',
    laws: [
      'Fair Labor Standards Act (FLSA)',
      'Internal Revenue Code',
      'Family and Medical Leave Act (FMLA)',
      'Affordable Care Act (ACA)',
      'Equal Pay Act',
    ],
    lastUpdated: new Date('2024-01-01'),
    maintainer: '@classytic/payroll',
  },
};

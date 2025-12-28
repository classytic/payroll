/**
 * Example: California State Jurisdiction
 *
 * This is an EXAMPLE showing how to extend US federal rules for California.
 * Copy this pattern to your app and customize for your needs.
 *
 * DO NOT import this file directly - it's documentation only.
 */

import type { JurisdictionDefinition } from '@classytic/payroll/jurisdiction';

/**
 * California state configuration extending US federal
 *
 * Usage in your app:
 * ```typescript
 * import { extendJurisdiction, registerJurisdiction } from '@classytic/payroll/jurisdiction';
 * import { US_FEDERAL } from './jurisdictions/us-federal';
 *
 * const california = extendJurisdiction(US_FEDERAL, {
 *   id: 'US:CA',
 *   name: 'California',
 *   // ... copy config from below
 * });
 *
 * registerJurisdiction(california);
 * ```
 */
export const CALIFORNIA_EXAMPLE: Partial<JurisdictionDefinition> = {
  id: 'US:CA',
  name: 'California',

  // California state income tax (in addition to federal)
  tax: {
    incomeTax: [
      { min: 0, max: 10412, rate: 0.01 },
      { min: 10412, max: 24684, rate: 0.02 },
      { min: 24684, max: 38959, rate: 0.04 },
      { min: 38959, max: 54081, rate: 0.06 },
      { min: 54081, max: 68350, rate: 0.08 },
      { min: 68350, max: 349137, rate: 0.093 },
      { min: 349137, max: 418961, rate: 0.103 },
      { min: 418961, max: 698271, rate: 0.113 },
      { min: 698271, max: Infinity, rate: 0.123 },
    ],
    socialSecurity: {
      employeeRate: 0.009, // SDI
      employerRate: 0.0,
      ceiling: 153164,
    },
    unemployment: {
      employerRate: 0.034,
      ceiling: 7000,
    },
    otherContributions: [
      {
        name: 'CA Training Tax',
        employerRate: 0.001,
        ceiling: 7000,
      },
    ],
  },

  // California has MORE STRICT overtime rules than federal
  overtime: {
    standard: {
      threshold: 8, // DAILY (not weekly like federal)
      multiplier: 1.5,
      basis: 'daily',
      doubleTimeThreshold: 12, // Over 12 hours = double time
      doubleTimeMultiplier: 2.0,
    },
    weekend: {
      threshold: 0, // 7th consecutive day
      multiplier: 1.5,
      basis: 'weekly',
      doubleTimeThreshold: 8,
      doubleTimeMultiplier: 2.0,
    },
  },

  // California mandates paid sick leave
  leave: {
    annualLeave: {
      days: 0,
      accrual: 'annual',
      carryForward: false,
    },
    sickLeave: {
      days: 5, // Minimum 40 hours/year
      accrual: 'per-hour',
      accrualRate: 1 / 30, // 1 hour per 30 hours worked
      medicalCertificateAfter: 3,
    },
    maternityLeave: {
      days: 84, // 12 weeks
      paidDays: 56, // 8 weeks through PFL
      paidPercentage: 60,
    },
    paternityLeave: {
      days: 84,
      paidDays: 56,
      paidPercentage: 60,
    },
    publicHolidays: 11,
    bereavementLeave: {
      days: 5,
      paidDays: 5,
    },
  },

  // California minimum wage is HIGHER than federal
  wage: {
    minimumWage: {
      amount: 16.0, // $16/hour as of 2024
      effectiveDate: new Date('2024-01-01'),
    },
    payFrequency: {
      allowed: ['weekly', 'biweekly', 'semimonthly', 'monthly'],
      default: 'biweekly',
    },
    paymentDeadline: {
      daysAfterPeriod: 5, // Stricter than federal
    },
    probation: {
      maxDays: 90,
      allowReducedSalary: false,
      terminationNoticeDays: 0,
    },
  },

  // California has STRICTER working hour rules
  workingHours: {
    standardWeek: {
      hours: 40,
      days: 5,
    },
    maxDailyHours: 12, // Over 12 = double time
    maxWeeklyHours: 48,
    breaks: [
      {
        afterHours: 5,
        durationMinutes: 30,
        paid: false, // Meal break
      },
      {
        afterHours: 4,
        durationMinutes: 10,
        paid: true, // Rest break (MUST be paid)
      },
    ],
    restBetweenShifts: {
      hours: 8,
    },
    weeklyRestDays: {
      days: 1,
      consecutive: true,
    },
  },

  // California-specific compliance rules
  complianceRules: [
    {
      id: 'ca:daily-overtime',
      name: 'California Daily Overtime',
      category: 'hours',
      validate: (data) => {
        const violations = [];
        if (data.dailyHours && data.dailyHours > 8) {
          const overtimeHours = Math.min(data.dailyHours - 8, 4);
          if (!data.dailyOvertimePaid || data.dailyOvertimePaid < overtimeHours) {
            violations.push({
              ruleId: 'ca:daily-overtime',
              ruleName: 'California Daily Overtime',
              severity: 'critical' as const,
              message: 'Missing daily overtime pay for hours over 8',
              remediation: 'Pay 1.5x for hours 8-12, 2x for hours over 12',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'ca:meal-break',
      name: 'California Meal Break',
      category: 'hours',
      validate: (data) => {
        const violations = [];
        if (data.shiftLength && data.shiftLength > 5 && !data.mealBreakProvided) {
          violations.push({
            ruleId: 'ca:meal-break',
            ruleName: 'California Meal Break',
            severity: 'high' as const,
            message: 'Missing meal break for shift over 5 hours',
            remediation: 'Provide 30-minute meal break or pay one hour premium',
            penalty: data.hourlyRate || 0,
          });
        }
        return violations;
      },
    },
  ],

  metadata: {
    authority: 'California Franchise Tax Board, DIR',
    laws: [
      'California Labor Code',
      'IWC Wage Orders',
      'Healthy Workplaces, Healthy Families Act',
    ],
    lastUpdated: new Date('2024-01-01'),
    maintainer: 'Your App',
  },
};

/**
 * How to use this in your app:
 *
 * 1. Copy the config above to your app code
 * 2. Use extendJurisdiction() to extend your US federal definition
 * 3. Register it once at app startup
 *
 * @example
 * ```typescript
 * // In your app initialization
 * import { extendJurisdiction, registerJurisdiction } from '@classytic/payroll/jurisdiction';
 * import { US_FEDERAL } from './jurisdictions/us-federal';
 *
 * // Add your state customizations
 * const california = extendJurisdiction(US_FEDERAL, {
 *   id: 'US:CA',
 *   name: 'California',
 *   wage: {
 *     minimumWage: { amount: 16, effectiveDate: new Date('2024-01-01') },
 *   },
 *   // ... more overrides
 * });
 *
 * registerJurisdiction(california);
 *
 * // Now use it
 * import { calculateJurisdictionTax } from '@classytic/payroll/jurisdiction';
 *
 * const tax = calculateJurisdictionTax({
 *   annualIncome: 100000,
 *   jurisdiction: { country: 'US', state: 'CA' },
 * });
 * ```
 */

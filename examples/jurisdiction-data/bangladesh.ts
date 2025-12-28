/**
 * @classytic/payroll - Bangladesh Jurisdiction Example
 *
 * Bangladesh tax and labor law configuration (2024)
 *
 * ⚠️ THIS IS AN EXAMPLE ONLY - NOT LEGAL ADVICE
 *
 * CRITICAL DISCLAIMER:
 * - This example is for reference purposes only
 * - Tax laws change frequently - verify with current Bangladesh tax authorities
 * - Consult with licensed tax professionals before using in production
 * - YOU are responsible for accuracy and compliance
 *
 * Sources to verify:
 * - National Board of Revenue (NBR): https://nbr.gov.bd/
 * - Bangladesh Labour Act, 2006 (amended 2018)
 * - Income Tax Ordinance, 1984
 */

import type { JurisdictionDefinition } from '@classytic/payroll/jurisdiction';

export const BANGLADESH: JurisdictionDefinition = {
  id: 'BD',
  name: 'Bangladesh',
  level: 'country',
  currency: 'BDT',
  locale: 'bn-BD',
  effectiveFrom: new Date('2024-07-01'), // FY 2024-25

  // ============================================================================
  // Tax Configuration
  // ============================================================================

  tax: {
    /**
     * Bangladesh Income Tax Rates (FY 2024-25)
     *
     * First ৳3,50,000 is tax-free for general taxpayers
     * Then progressive rates apply to income ABOVE that threshold
     *
     * VERIFY: Tax rates change annually in the budget
     * Source: NBR Circular
     */
    incomeTax: [
      // First ৳1,00,000 above exemption limit (৳3,50,000 - ৳4,50,000)
      { min: 0, max: 100000, rate: 0.05 }, // 5%
      // Next ৳1,00,000 (৳4,50,000 - ৳5,50,000)
      { min: 100000, max: 200000, rate: 0.10 }, // 10%
      // Next ৳3,00,000 (৳5,50,000 - ৳8,50,000)
      { min: 200000, max: 500000, rate: 0.15 }, // 15%
      // Next ৳4,00,000 (৳8,50,000 - ৳12,50,000)
      { min: 500000, max: 900000, rate: 0.20 }, // 20%
      // Above ৳12,50,000
      { min: 900000, max: Infinity, rate: 0.25 }, // 25%
    ],

    /**
     * Tax Exemption Limit
     *
     * IMPORTANT: This varies by taxpayer category:
     * - General taxpayers: ৳3,50,000
     * - Women/Senior citizens (65+): ৳3,75,000
     * - Persons with disabilities: ৳4,50,000
     * - Gazetted war-wounded freedom fighters: ৳5,00,000
     *
     * This example uses general taxpayer limit
     */
    standardDeduction: 350000, // ৳3,50,000 (FY 2024-25)

    /**
     * Tax Rebates & Investment Allowances
     *
     * Taxpayers can get rebate for:
     * - Life insurance premium: Up to ৳1,50,000 or 10% of total income
     * - Donation to approved institutions
     * - Investment in approved savings certificates
     * - Contribution to provident fund
     * - Zakat Fund
     */
    allowances: {
      investmentRebate: 0.15, // 15% of eligible investment, max ৳15 lakh
      maxInvestmentRebate: 1500000, // ৳15,00,000
    },

    /**
     * Minimum Tax
     *
     * Even if calculated tax is zero, minimum tax may apply:
     * - ৳5,000 for Dhaka/Chittagong city corporations
     * - ৳4,000 for other city corporations
     * - ৳3,000 for other areas
     */
    minimumTax: 5000, // Dhaka/Chittagong

    // Social Security (no standard system like US FICA in Bangladesh)
    // Employers typically contribute to provident funds
  },

  // ============================================================================
  // Overtime Configuration
  // ============================================================================

  overtime: {
    /**
     * Bangladesh Labour Act, 2006 (Section 108)
     *
     * - Overtime rate: 2x normal rate (double time)
     * - Maximum overtime: 2 hours per day
     * - Weekly limit: 8 hours total overtime
     */
    standard: {
      threshold: 8, // Hours per day
      multiplier: 2.0, // Double time (as per Labour Act)
      basis: 'daily',
    },
  },

  // ============================================================================
  // Leave Entitlements
  // ============================================================================

  leave: {
    /**
     * Annual Leave (Casual Leave + Earned Leave)
     *
     * Bangladesh Labour Act provisions:
     * - Casual Leave: 10 days (with pay)
     * - Earned Leave: 1 day per 18 days worked (minimum)
     * - Sick Leave: 14 days (with pay)
     * - Festival holidays: As per government declaration
     */
    annualLeave: {
      days: 10, // Casual leave
      accrual: 'annual',
      carryForward: false,
    },

    sickLeave: {
      days: 14, // With pay
      accrual: 'annual',
      medicalCertificateAfter: 3, // Required after 3 days
    },

    /**
     * Maternity Leave
     *
     * - Duration: 16 weeks (8 weeks before, 8 weeks after delivery)
     * - Payment: Full pay
     * - Conditions: Must have worked for at least 6 months
     */
    maternityLeave: {
      days: 112, // 16 weeks
      paidDays: 112,
      paidPercentage: 100,
    },

    /**
     * Paternity Leave
     *
     * Not mandated by Bangladesh Labour Act
     * Some companies provide as benefit
     */
    paternityLeave: {
      days: 0, // Not mandated
      paidDays: 0,
      paidPercentage: 0,
    },

    /**
     * Public Holidays
     *
     * Bangladesh has approximately 20-22 government holidays per year:
     * - Eid-ul-Fitr: 3-4 days
     * - Eid-ul-Azha: 3-4 days
     * - Durga Puja: 2-3 days
     * - National days (Independence, Victory Day, etc.)
     *
     * Varies by government declaration
     */
    publicHolidays: 21,

    bereavementLeave: {
      days: 0, // Not specifically mandated
      paidDays: 0,
    },
  },

  // ============================================================================
  // Wage Configuration
  // ============================================================================

  wage: {
    /**
     * National Minimum Wage
     *
     * IMPORTANT: Minimum wage varies by sector:
     * - RMG sector: ৳12,500/month (2023)
     * - Other sectors: Varies
     *
     * This is a general example - verify for your industry
     */
    minimumWage: {
      amount: 12500, // Monthly (RMG sector, 2023)
      effectiveDate: new Date('2023-12-01'),
    },

    /**
     * Pay Frequency
     *
     * Bangladesh Labour Act:
     * - Workers: Within 7 days of end of wage period
     * - Employees: By 7th day of following month
     */
    payFrequency: {
      allowed: ['monthly'],
      default: 'monthly',
    },

    paymentDeadline: {
      daysAfterPeriod: 7,
    },

    /**
     * Probation Period
     *
     * Bangladesh Labour Act:
     * - Maximum: 3 months (can be extended to 6 months)
     * - Must be in writing
     */
    probation: {
      maxDays: 90, // 3 months
      allowReducedSalary: false,
      terminationNoticeDays: 14, // 14 days notice
    },
  },

  // ============================================================================
  // Working Hours
  // ============================================================================

  workingHours: {
    /**
     * Standard Working Hours
     *
     * Bangladesh Labour Act:
     * - Maximum: 8 hours per day, 48 hours per week
     * - Working days: Sunday to Thursday (Friday-Saturday weekend)
     */
    standardWeek: {
      hours: 48,
      days: 5, // Sunday-Thursday
    },

    maxDailyHours: 8,
    maxWeeklyHours: 48,

    /**
     * Rest Intervals
     *
     * - After 5 hours: 1 hour rest (unpaid)
     * - Must have 1 weekly holiday (typically Friday)
     */
    breaks: [
      {
        afterHours: 5,
        durationMinutes: 60, // 1 hour lunch break
        paid: false,
      },
    ],

    restBetweenShifts: {
      hours: 8, // Minimum rest between shifts
    },

    weeklyRestDays: {
      days: 1, // Friday (or other designated day)
      consecutive: true,
    },
  },

  // ============================================================================
  // Compliance Rules
  // ============================================================================

  complianceRules: [
    {
      id: 'bd:overtime-limit',
      name: 'Overtime Hour Limit',
      category: 'hours',
      validate: (data) => {
        const violations = [];

        // Maximum 2 hours overtime per day
        if (data.dailyOvertimeHours && data.dailyOvertimeHours > 2) {
          violations.push({
            ruleId: 'bd:overtime-limit',
            ruleName: 'Overtime Hour Limit',
            severity: 'critical' as const,
            message: 'Exceeded maximum 2 hours overtime per day',
            remediation: 'Limit daily overtime to 2 hours as per Labour Act Section 108',
          });
        }

        return violations;
      },
    },
    {
      id: 'bd:weekly-holiday',
      name: 'Weekly Holiday Requirement',
      category: 'hours',
      validate: (data) => {
        const violations = [];

        // Must have at least 1 day off per week
        if (data.consecutiveWorkDays && data.consecutiveWorkDays > 6) {
          violations.push({
            ruleId: 'bd:weekly-holiday',
            ruleName: 'Weekly Holiday Requirement',
            severity: 'high' as const,
            message: 'Employee worked more than 6 consecutive days without weekly holiday',
            remediation: 'Provide weekly holiday as per Labour Act Section 109',
          });
        }

        return violations;
      },
    },
    {
      id: 'bd:minimum-wage',
      name: 'Minimum Wage Compliance',
      category: 'wage',
      validate: (data) => {
        const violations = [];

        // Check minimum wage (sector-specific)
        if (data.monthlyWage && data.monthlyWage < 12500) {
          violations.push({
            ruleId: 'bd:minimum-wage',
            ruleName: 'Minimum Wage Compliance',
            severity: 'critical' as const,
            message: 'Monthly wage below minimum wage',
            remediation: 'Ensure wage meets sector-specific minimum wage requirements',
          });
        }

        return violations;
      },
    },
    {
      id: 'bd:provident-fund',
      name: 'Provident Fund Contribution',
      category: 'benefits',
      validate: (data) => {
        const violations = [];

        // Companies with 50+ workers must have provident fund
        if (data.employerSize >= 50 && !data.hasProvidentFund) {
          violations.push({
            ruleId: 'bd:provident-fund',
            ruleName: 'Provident Fund Contribution',
            severity: 'high' as const,
            message: 'Employer with 50+ workers must maintain provident fund',
            remediation: 'Establish workers\' provident fund as per law',
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
    authority: 'National Board of Revenue (NBR), Ministry of Labour and Employment',
    laws: [
      'Bangladesh Labour Act, 2006 (amended 2018)',
      'Income Tax Ordinance, 1984',
      'Bangladesh Labour Rules, 2015',
      'Payment of Wages Act, 1936',
      'Factories Act, 1965',
    ],
    lastUpdated: new Date('2024-07-01'),
    maintainer: 'Example - Verify with tax professional',
    notes: [
      'Tax year in Bangladesh is July 1 - June 30',
      'Minimum wage varies by sector - verify for your industry',
      'Public holidays vary by government declaration',
      'Always consult with licensed tax professionals',
      'Investment rebate rules change annually in budget',
    ],
  },
};

/**
 * @classytic/payroll - Multi-Jurisdiction Support
 *
 * DESIGN:
 * - Pluggable jurisdiction rules (tax, overtime, leave, compliance)
 * - Pure calculation functions
 * - Smart defaults per country/state/province
 * - Override at runtime when needed
 *
 * Your app passes jurisdiction code, we handle the calculations.
 */

// ============================================================================
// Core Types
// ============================================================================

export type JurisdictionLevel = 'country' | 'state' | 'province' | 'city' | 'custom';

export interface JurisdictionIdentifier {
  /** ISO country code (e.g., 'US', 'GB', 'BD', 'IN') */
  country: string;
  /** State/province code (e.g., 'CA', 'NY', 'ON') */
  state?: string;
  /** City/municipality code */
  city?: string;
  /** Custom jurisdiction identifier */
  custom?: string;
}

// ============================================================================
// Tax Configuration
// ============================================================================

export interface TaxBracket {
  min: number;
  max: number;
  rate: number;
  /** Fixed amount for this bracket (some jurisdictions use fixed + %) */
  fixedAmount?: number;
  /** Start date from which this bracket applies (inclusive) */
  effectiveFrom?: Date;
  /** End date until which this bracket applies (inclusive, null = still active) */
  effectiveTo?: Date | null;
}

export interface TaxConfiguration {
  /** Income tax brackets (annual income) */
  incomeTax: TaxBracket[];
  /** Social security/pension tax rate */
  socialSecurity?: {
    employeeRate: number;
    employerRate: number;
    ceiling?: number; // Max income subject to SS tax
    floor?: number;   // Min income subject to SS tax
  };
  /** Medicare/health insurance tax */
  medicare?: {
    employeeRate: number;
    employerRate: number;
    additionalRate?: number; // For high earners
    additionalThreshold?: number;
  };
  /** Unemployment insurance */
  unemployment?: {
    employerRate: number;
    ceiling?: number;
  };
  /** Other mandatory contributions */
  otherContributions?: Array<{
    name: string;
    employeeRate?: number;
    employerRate?: number;
    ceiling?: number;
  }>;
  /** Tax-free allowances (annual) */
  allowances?: {
    personal: number;
    dependent?: number;
    pension?: number;
  };
  /** Standard deduction (annual) */
  standardDeduction?: number;

  /**
   * Tax-free thresholds by taxpayer category (annual)
   *
   * Different jurisdictions offer varying tax-free amounts based on
   * taxpayer demographics (age, disability status, veteran status, etc.)
   *
   * @example
   * ```typescript
   * thresholdsByCategory: {
   *   standard: 350000,    // Default for regular taxpayers
   *   senior: 450000,      // Citizens 65+
   *   disabled: 500000,    // Disabled persons
   *   veteran: 475000,     // Military veterans
   *   female: 400000,      // Some jurisdictions (e.g., Bangladesh)
   * }
   * ```
   */
  thresholdsByCategory?: Record<string, number>;

  /**
   * Pre-tax deduction types recognized by this jurisdiction
   *
   * Contributions of these types reduce taxable income before tax calculation.
   * Common examples: provident fund, 401k, pension contributions.
   *
   * @example ['provident_fund', 'pension', '401k', 'health_savings']
   */
  preTaxDeductionTypes?: string[];
}

export interface TaxCalculationInput {
  annualIncome: number;
  jurisdiction: JurisdictionIdentifier;
  dependents?: number;
  customAllowances?: number;
  pensionContribution?: number;
}

export interface TaxCalculationResult {
  /** Total income tax (annual) */
  incomeTax: number;
  /** Social security employee contribution (annual) */
  socialSecurityEmployee: number;
  /** Social security employer contribution (annual) */
  socialSecurityEmployer: number;
  /** Medicare employee (annual) */
  medicareEmployee: number;
  /** Medicare employer (annual) */
  medicareEmployer: number;
  /** Unemployment employer (annual) */
  unemploymentEmployer: number;
  /** Other contributions */
  otherContributions: Array<{
    name: string;
    employeeAmount: number;
    employerAmount: number;
  }>;
  /** Total employee tax burden (annual) */
  totalEmployeeTax: number;
  /** Total employer tax burden (annual) */
  totalEmployerTax: number;
  /** Effective tax rate */
  effectiveRate: number;
  /** Taxable income after allowances/deductions */
  taxableIncome: number;
}

// ============================================================================
// Overtime Rules
// ============================================================================

export type OvertimeCalculationBasis = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface OvertimeRule {
  /** Hours threshold before overtime kicks in */
  threshold: number;
  /** Overtime multiplier (1.5 = time and a half) */
  multiplier: number;
  /** Basis for calculation */
  basis: OvertimeCalculationBasis;
  /** Maximum daily hours before double time */
  doubleTimeThreshold?: number;
  /** Double time multiplier */
  doubleTimeMultiplier?: number;
}

export interface OvertimeConfiguration {
  /** Standard overtime rules */
  standard: OvertimeRule;
  /** Weekend overtime (if different) */
  weekend?: OvertimeRule;
  /** Holiday overtime */
  holiday?: OvertimeRule;
  /** Night shift differential */
  nightShift?: {
    startHour: number;  // 22 = 10 PM
    endHour: number;    // 6 = 6 AM
    multiplier: number;
  };
  /** Consecutive days worked bonus */
  consecutiveDays?: {
    threshold: number;  // Days worked in a row
    multiplier: number;
  };
}

// ============================================================================
// Leave Entitlements
// ============================================================================

export interface LeaveEntitlement {
  /** Annual leave days per year */
  annualLeave: {
    days: number;
    /** How it accrues */
    accrual: 'monthly' | 'quarterly' | 'annual' | 'per-hour';
    /** Accrual rate (days per period) */
    accrualRate?: number;
    /** Can it be carried forward */
    carryForward: boolean;
    /** Max carry forward days */
    maxCarryForward?: number;
  };
  /** Sick leave */
  sickLeave: {
    days: number;
    accrual: 'monthly' | 'quarterly' | 'annual' | 'unlimited';
    accrualRate?: number;
    /** Requires medical certificate after X days */
    medicalCertificateAfter?: number;
  };
  /** Maternity leave */
  maternityLeave?: {
    days: number;
    paidDays: number;
    /** Percentage of salary paid */
    paidPercentage: number;
  };
  /** Paternity leave */
  paternityLeave?: {
    days: number;
    paidDays: number;
    paidPercentage: number;
  };
  /** Public holidays (annual count) */
  publicHolidays: number;
  /** Bereavement leave */
  bereavementLeave?: {
    days: number;
    paidDays: number;
  };
  /** Other statutory leaves */
  otherLeaves?: Array<{
    name: string;
    days: number;
    paidDays: number;
    paidPercentage: number;
  }>;
}

// ============================================================================
// Compliance Rules
// ============================================================================

export interface ComplianceRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule category */
  category: 'wage' | 'hours' | 'leave' | 'termination' | 'benefits' | 'safety' | 'other';
  /** Validation function */
  validate: (data: EmploymentData) => ComplianceViolation[];
}

export interface ComplianceViolation {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  /** Suggested remediation */
  remediation?: string;
  /** Monetary penalty (if applicable) */
  penalty?: number;
}

export interface EmploymentData {
  baseSalary: number;
  currency: string;
  hoursWorked: number;
  overtimeHours: number;
  leaveBalance: {
    annual: number;
    sick: number;
  };
  hireDate: Date;
  terminationDate?: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extensible interface with dynamic property access
  [key: string]: any;
}

// ============================================================================
// Wage Rules
// ============================================================================

export interface WageConfiguration {
  /** Minimum wage (hourly) */
  minimumWage: {
    amount: number;
    effectiveDate: Date;
  };
  /** Living wage (recommended, not mandated) */
  livingWage?: {
    amount: number;
    effectiveDate: Date;
  };
  /** Pay frequency requirements */
  payFrequency: {
    allowed: Array<'daily' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'>;
    default: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  };
  /** Salary payment deadline */
  paymentDeadline: {
    /** Days after period end */
    daysAfterPeriod: number;
  };
  /** Probation period rules */
  probation?: {
    maxDays: number;
    /** Can salary be lower during probation */
    allowReducedSalary: boolean;
    /** Termination notice during probation */
    terminationNoticeDays: number;
  };
}

// ============================================================================
// Working Hours
// ============================================================================

export interface WorkingHoursConfiguration {
  /** Standard work week */
  standardWeek: {
    hours: number;  // Usually 40
    days: number;   // Usually 5
  };
  /** Maximum daily hours */
  maxDailyHours: number;
  /** Maximum weekly hours */
  maxWeeklyHours: number;
  /** Required breaks */
  breaks: Array<{
    afterHours: number;
    durationMinutes: number;
    paid: boolean;
  }>;
  /** Rest period between shifts */
  restBetweenShifts: {
    hours: number;
  };
  /** Weekly rest day requirement */
  weeklyRestDays: {
    days: number;
    consecutive: boolean;
  };
}

// ============================================================================
// Jurisdiction Definition
// ============================================================================

export interface JurisdictionDefinition {
  /** Jurisdiction identifier */
  id: string;
  /** Display name */
  name: string;
  /** Level (country, state, etc) */
  level: JurisdictionLevel;
  /** Parent jurisdiction (e.g., US for California) */
  parent?: string;
  /** Currency code */
  currency: string;
  /** Locale code */
  locale: string;
  /** Effective date */
  effectiveFrom: Date;
  /** End date (if jurisdiction rules changed) */
  effectiveTo?: Date;

  // Configurations
  tax: TaxConfiguration;
  overtime: OvertimeConfiguration;
  leave: LeaveEntitlement;
  wage: WageConfiguration;
  workingHours: WorkingHoursConfiguration;

  // Compliance rules
  complianceRules: ComplianceRule[];

  // Metadata
  metadata?: {
    /** Government authority */
    authority?: string;
    /** Reference laws */
    laws?: string[];
    /** Last updated */
    lastUpdated: Date;
    /** Maintained by */
    maintainer?: string;
  };
}

// ============================================================================
// Pay Slip Generation
// ============================================================================

export interface PaySlipData {
  employee: {
    id: string;
    name: string;
    position: string;
    department?: string;
    hireDate: Date;
    taxId?: string;
    socialSecurityNumber?: string;
  };
  employer: {
    name: string;
    address: string;
    taxId?: string;
    registrationNumber?: string;
  };
  period: {
    start: Date;
    end: Date;
    payDate: Date;
  };
  earnings: {
    basic: number;
    allowances: Array<{ name: string; amount: number; taxable: boolean }>;
    overtime: number;
    bonuses: Array<{ name: string; amount: number; taxable: boolean }>;
    other: Array<{ name: string; amount: number; taxable: boolean }>;
  };
  deductions: {
    incomeTax: number;
    socialSecurity: number;
    medicare?: number;
    providentFund?: number;
    loans: Array<{ name: string; amount: number }>;
    advances: number;
    other: Array<{ name: string; amount: number }>;
  };
  totals: {
    grossEarnings: number;
    totalDeductions: number;
    netPay: number;
  };
  yearToDate: {
    grossEarnings: number;
    incomeTax: number;
    socialSecurity: number;
    netPay: number;
  };
  bankDetails?: {
    accountNumber: string;
    bankName: string;
    routingNumber?: string;
  };
}

export interface PaySlipTemplate {
  jurisdiction: JurisdictionIdentifier;
  format: 'pdf' | 'html' | 'json' | 'custom';
  /** Required fields per jurisdiction */
  requiredFields: string[];
  /** Optional fields */
  optionalFields?: string[];
  /** Custom template function */
  customRenderer?: (data: PaySlipData) => unknown;
}

// ============================================================================
// Statutory Filing
// ============================================================================

export interface StatutoryFilingRequirement {
  /** Filing type */
  type: 'monthly' | 'quarterly' | 'annual' | 'event-based';
  /** Filing name */
  name: string;
  /** Due date calculation */
  dueDate: (period: { start: Date; end: Date }) => Date;
  /** Required data */
  requiredData: string[];
  /** Generate filing data */
  generateData: (employees: EmploymentData[], period: { start: Date; end: Date }) => unknown;
  /** Validation rules */
  validate?: (data: unknown) => ComplianceViolation[];
}

export interface FilingCalendar {
  jurisdiction: JurisdictionIdentifier;
  filings: StatutoryFilingRequirement[];
}

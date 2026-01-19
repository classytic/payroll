/**
 * @classytic/payroll - Configuration
 *
 * Centralized configuration with type safety
 * Configurable defaults for different use cases
 */

import type {
  HRMConfig,
  TaxBracket,
  SalaryBandRange,
  RoleMappingConfig,
  OrgRole,
  SalaryBand,
  Department,
  EmploymentType,
  PaymentFrequency,
  DeepPartial,
  EmployeeIdentityMode,
} from './types.js';
import { roundMoney } from './utils/money.js';

// ============================================================================
// Default Configuration
// ============================================================================

export const HRM_CONFIG: HRMConfig = {
  dataRetention: {
    /**
     * Default retention period for payroll records in seconds
     *
     * STANDARD APPROACH: expireAt field + configurable TTL index
     *
     * ## How It Works:
     * 1. Set expireAt date on each payroll record
     * 2. Call PayrollRecord.configureRetention() at app startup
     * 3. MongoDB deletes documents when expireAt is reached
     *
     * ## Usage:
     *
     * @example Configure at initialization
     * ```typescript
     * await payroll.init({ ... });
     * await PayrollRecord.configureRetention(0); // 0 = delete when expireAt reached
     * ```
     *
     * @example Set expireAt per record
     * ```typescript
     * const expireAt = PayrollRecord.calculateExpireAt(7); // 7 years
     * await PayrollRecord.updateOne({ _id }, { expireAt });
     * ```
     *
     * ## Jurisdiction Requirements:
     * - USA: 7 years → 220752000 seconds
     * - EU/UK: 6 years → 189216000 seconds
     * - Germany: 10 years → 315360000 seconds
     * - India: 8 years → 252288000 seconds
     *
     * Set to 0 to disable TTL
     */
    payrollRecordsTTL: 63072000, // 2 years - adjust per jurisdiction
    exportWarningDays: 30,
    archiveBeforeDeletion: true,
  },

  payroll: {
    defaultCurrency: 'USD',
    allowProRating: true,
    attendanceIntegration: true,
    autoDeductions: true,
    overtimeEnabled: false,
    overtimeMultiplier: 1.5,
  },

  salary: {
    minimumWage: 0,
    maximumAllowances: 10,
    maximumDeductions: 10,
    defaultFrequency: 'monthly',
  },

  employment: {
    defaultProbationMonths: 3,
    maxProbationMonths: 6,
    allowReHiring: true,
    trackEmploymentHistory: true,
  },

  validation: {
    requireBankDetails: false,
    requireUserId: false,           // Modern: Allow guest employees by default
    identityMode: 'employeeId',     // Modern: Use human-readable IDs as primary
    identityFallbacks: ['email', 'userId'],  // Smart fallback chain
  },
};

// ============================================================================
// Salary Bands Configuration
// ============================================================================

export const SALARY_BANDS: Record<Exclude<SalaryBand, 'custom'>, SalaryBandRange> = {
  intern: { min: 10000, max: 20000 },
  junior: { min: 20000, max: 40000 },
  mid: { min: 40000, max: 70000 },
  senior: { min: 70000, max: 120000 },
  lead: { min: 100000, max: 200000 },
  executive: { min: 150000, max: 500000 },
};

// ============================================================================
// Tax Brackets Configuration
// ============================================================================

export const TAX_BRACKETS: Record<string, TaxBracket[]> = {
  BDT: [
    { min: 0, max: 300000, rate: 0 },
    { min: 300000, max: 400000, rate: 0.05 },
    { min: 400000, max: 500000, rate: 0.10 },
    { min: 500000, max: 600000, rate: 0.15 },
    { min: 600000, max: 3000000, rate: 0.20 },
    { min: 3000000, max: Infinity, rate: 0.25 },
  ],
  USD: [
    { min: 0, max: 10000, rate: 0.10 },
    { min: 10000, max: 40000, rate: 0.12 },
    { min: 40000, max: 85000, rate: 0.22 },
    { min: 85000, max: 165000, rate: 0.24 },
    { min: 165000, max: 215000, rate: 0.32 },
    { min: 215000, max: 540000, rate: 0.35 },
    { min: 540000, max: Infinity, rate: 0.37 },
  ],
};

// ============================================================================
// Organization Roles Configuration
// ============================================================================

export interface OrgRoleDefinition {
  key: OrgRole;
  label: string;
  description: string;
}

export const ORG_ROLES: Record<Uppercase<OrgRole>, OrgRoleDefinition> = {
  OWNER: {
    key: 'owner',
    label: 'Owner',
    description: 'Full organization access (set by Organization model)',
  },
  MANAGER: {
    key: 'manager',
    label: 'Manager',
    description: 'Management and administrative features',
  },
  TRAINER: {
    key: 'trainer',
    label: 'Trainer',
    description: 'Training and coaching features',
  },
  STAFF: {
    key: 'staff',
    label: 'Staff',
    description: 'General staff access to basic features',
  },
  INTERN: {
    key: 'intern',
    label: 'Intern',
    description: 'Limited access for interns',
  },
  CONSULTANT: {
    key: 'consultant',
    label: 'Consultant',
    description: 'Project-based consultant access',
  },
};

export const ORG_ROLE_KEYS = Object.values(ORG_ROLES).map((role) => role.key);

// ============================================================================
// Role Mapping Configuration
// ============================================================================

export const ROLE_MAPPING: RoleMappingConfig = {
  byDepartment: {
    management: 'manager',
    training: 'trainer',
    sales: 'staff',
    operations: 'staff',
    finance: 'staff',
    hr: 'staff',
    marketing: 'staff',
    it: 'staff',
    support: 'staff',
    maintenance: 'staff',
  },

  byEmploymentType: {
    full_time: 'staff',
    part_time: 'staff',
    contract: 'consultant',
    intern: 'intern',
    consultant: 'consultant',
  },

  default: 'staff',
};

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Calculate tax based on annual income
 *
 * Uses banker's rounding to prevent systematic bias in tax calculations.
 * Tax is calculated progressively across brackets and rounded once at the end.
 *
 * @param annualIncome - Annual income in major units (dollars/rupees/taka)
 * @param currency - Currency code (default: 'USD')
 * @returns Tax amount in major units, properly rounded with banker's rounding
 */
export function calculateTax(annualIncome: number, currency = 'USD'): number {
  const brackets = TAX_BRACKETS[currency];
  if (!brackets) return 0;

  let tax = 0;
  for (const bracket of brackets) {
    if (annualIncome > bracket.min) {
      const taxableAmount = Math.min(annualIncome, bracket.max) - bracket.min;
      tax += taxableAmount * bracket.rate;
    }
  }

  // Use roundMoney for consistency with all other money calculations
  // This ensures identical rounding behavior across all tax calculations
  return roundMoney(tax);
}

/**
 * Get salary band for a given amount
 */
export function getSalaryBand(amount: number): SalaryBand {
  for (const [band, range] of Object.entries(SALARY_BANDS)) {
    if (amount >= range.min && amount <= range.max) {
      return band as SalaryBand;
    }
  }
  return 'custom';
}

/**
 * Determine the appropriate organization role for an employee
 */
export function determineOrgRole(employmentData: {
  department?: Department | string;
  type?: EmploymentType | string;
  position?: string;
}): OrgRole {
  const { department, type: employmentType } = employmentData;

  // Priority 1: Department-based mapping
  if (department && department in ROLE_MAPPING.byDepartment) {
    return ROLE_MAPPING.byDepartment[department as keyof typeof ROLE_MAPPING.byDepartment];
  }

  // Priority 2: Employment type mapping
  if (employmentType && employmentType in ROLE_MAPPING.byEmploymentType) {
    return ROLE_MAPPING.byEmploymentType[employmentType as keyof typeof ROLE_MAPPING.byEmploymentType];
  }

  // Priority 3: Default role
  return ROLE_MAPPING.default;
}

/**
 * Get pay periods per year based on frequency
 */
export function getPayPeriodsPerYear(frequency: PaymentFrequency): number {
  const periodsMap: Record<PaymentFrequency, number> = {
    monthly: 12,
    bi_weekly: 26,
    weekly: 52,
    daily: 365,
    hourly: 2080, // Assuming 40 hours/week * 52 weeks
  };
  return periodsMap[frequency];
}

/**
 * Calculate monthly equivalent from any frequency
 */
export function toMonthlyAmount(amount: number, frequency: PaymentFrequency): number {
  const periodsPerYear = getPayPeriodsPerYear(frequency);
  return Math.round((amount * periodsPerYear) / 12);
}

/**
 * Calculate annual equivalent from any frequency
 */
export function toAnnualAmount(amount: number, frequency: PaymentFrequency): number {
  const periodsPerYear = getPayPeriodsPerYear(frequency);
  return Math.round(amount * periodsPerYear);
}

/**
 * Merge configuration with defaults
 */
export function mergeConfig(
  customConfig: Partial<HRMConfig> | DeepPartial<HRMConfig> | undefined
): HRMConfig {
  if (!customConfig) return HRM_CONFIG;

  return {
    dataRetention: { ...HRM_CONFIG.dataRetention, ...customConfig.dataRetention },
    payroll: { ...HRM_CONFIG.payroll, ...customConfig.payroll },
    salary: { ...HRM_CONFIG.salary, ...customConfig.salary },
    employment: { ...HRM_CONFIG.employment, ...customConfig.employment },
    validation: {
      ...HRM_CONFIG.validation,
      ...customConfig.validation,
      // Ensure fallbacks is always EmployeeIdentityMode[]
      identityFallbacks: (customConfig.validation?.identityFallbacks ?? HRM_CONFIG.validation.identityFallbacks) as EmployeeIdentityMode[]
    },
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  HRM_CONFIG,
  SALARY_BANDS,
  TAX_BRACKETS,
  ORG_ROLES,
  ORG_ROLE_KEYS,
  ROLE_MAPPING,
  calculateTax,
  getSalaryBand,
  determineOrgRole,
  getPayPeriodsPerYear,
  toMonthlyAmount,
  toAnnualAmount,
  mergeConfig,
};


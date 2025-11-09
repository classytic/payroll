export const EMPLOYMENT_TYPE = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACT: 'contract',
  INTERN: 'intern',
  CONSULTANT: 'consultant',
};

export const EMPLOYMENT_TYPE_VALUES = Object.values(EMPLOYMENT_TYPE);

export const EMPLOYEE_STATUS = {
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  SUSPENDED: 'suspended',
  TERMINATED: 'terminated',
};

export const EMPLOYEE_STATUS_VALUES = Object.values(EMPLOYEE_STATUS);

export const DEPARTMENT = {
  MANAGEMENT: 'management',
  TRAINING: 'training',
  SALES: 'sales',
  OPERATIONS: 'operations',
  SUPPORT: 'support',
  HR: 'hr',
  MAINTENANCE: 'maintenance',
  MARKETING: 'marketing',
};

export const DEPARTMENT_VALUES = Object.values(DEPARTMENT);

export const PAYMENT_FREQUENCY = {
  MONTHLY: 'monthly',
  BI_WEEKLY: 'bi_weekly',
  WEEKLY: 'weekly',
  HOURLY: 'hourly',
  DAILY: 'daily',
};

export const PAYMENT_FREQUENCY_VALUES = Object.values(PAYMENT_FREQUENCY);

export const ALLOWANCE_TYPE = {
  HOUSING: 'housing',
  TRANSPORT: 'transport',
  MEAL: 'meal',
  MOBILE: 'mobile',
  MEDICAL: 'medical',
  EDUCATION: 'education',
  OTHER: 'other',
};

export const ALLOWANCE_TYPE_VALUES = Object.values(ALLOWANCE_TYPE);

export const DEDUCTION_TYPE = {
  TAX: 'tax',
  LOAN: 'loan',
  ADVANCE: 'advance',
  PROVIDENT_FUND: 'provident_fund',
  INSURANCE: 'insurance',
  ABSENCE: 'absence',
  OTHER: 'other',
};

export const DEDUCTION_TYPE_VALUES = Object.values(DEDUCTION_TYPE);

export const PAYROLL_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const PAYROLL_STATUS_VALUES = Object.values(PAYROLL_STATUS);

export const TERMINATION_REASON = {
  RESIGNATION: 'resignation',
  RETIREMENT: 'retirement',
  TERMINATION: 'termination',
  CONTRACT_END: 'contract_end',
  MUTUAL_AGREEMENT: 'mutual_agreement',
  OTHER: 'other',
};

export const TERMINATION_REASON_VALUES = Object.values(TERMINATION_REASON);

export const PAYMENT_METHOD = {
  BANK: 'bank',
  CASH: 'cash',
  BKASH: 'bkash',
  NAGAD: 'nagad',
  ROCKET: 'rocket',
};

export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD);

/**
 * HRM Library Transaction Categories
 * Categories managed by HRM workflows (not manually creatable)
 */
export const HRM_TRANSACTION_CATEGORIES = {
  SALARY: 'salary',              // Regular salary payments
  BONUS: 'bonus',                // Performance/festival bonuses
  COMMISSION: 'commission',      // Sales commissions
  OVERTIME: 'overtime',          // Overtime payments
  SEVERANCE: 'severance',        // Severance/termination pay
};

export const HRM_CATEGORY_VALUES = Object.values(HRM_TRANSACTION_CATEGORIES);

/**
 * Check if category is HRM-managed (created by HRM workflows only)
 */
export function isHRMManagedCategory(category) {
  return HRM_CATEGORY_VALUES.includes(category);
}

export default {
  EMPLOYMENT_TYPE,
  EMPLOYMENT_TYPE_VALUES,
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUS_VALUES,
  DEPARTMENT,
  DEPARTMENT_VALUES,
  PAYMENT_FREQUENCY,
  PAYMENT_FREQUENCY_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  ALLOWANCE_TYPE,
  ALLOWANCE_TYPE_VALUES,
  DEDUCTION_TYPE,
  DEDUCTION_TYPE_VALUES,
  PAYROLL_STATUS,
  PAYROLL_STATUS_VALUES,
  TERMINATION_REASON,
  TERMINATION_REASON_VALUES,
  HRM_TRANSACTION_CATEGORIES,
  HRM_CATEGORY_VALUES,
  isHRMManagedCategory,
};

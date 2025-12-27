/**
 * @classytic/payroll - Enums
 *
 * Type-safe enum definitions with const assertions
 * Single source of truth for all enum values
 */

import type {
  EmploymentType,
  EmployeeStatus,
  Department,
  PaymentFrequency,
  PaymentMethod,
  AllowanceType,
  DeductionType,
  PayrollStatus,
  TerminationReason,
  HRMTransactionCategory,
  SalaryBand,
  OrgRole,
} from './types.js';

// ============================================================================
// Employment Type
// ============================================================================

export const EMPLOYMENT_TYPE = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACT: 'contract',
  INTERN: 'intern',
  CONSULTANT: 'consultant',
} as const satisfies Record<string, EmploymentType>;

export const EMPLOYMENT_TYPE_VALUES = Object.values(EMPLOYMENT_TYPE);

export function isValidEmploymentType(value: string): value is EmploymentType {
  return EMPLOYMENT_TYPE_VALUES.includes(value as EmploymentType);
}

// ============================================================================
// Employee Status
// ============================================================================

export const EMPLOYEE_STATUS = {
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  SUSPENDED: 'suspended',
  TERMINATED: 'terminated',
} as const satisfies Record<string, EmployeeStatus>;

export const EMPLOYEE_STATUS_VALUES = Object.values(EMPLOYEE_STATUS);

export function isValidEmployeeStatus(value: string): value is EmployeeStatus {
  return EMPLOYEE_STATUS_VALUES.includes(value as EmployeeStatus);
}

export function isActiveStatus(status: EmployeeStatus): boolean {
  return status === EMPLOYEE_STATUS.ACTIVE;
}

export function isEmployedStatus(status: EmployeeStatus): boolean {
  return status !== EMPLOYEE_STATUS.TERMINATED;
}

export function canReceiveSalaryStatus(status: EmployeeStatus): boolean {
  return status === EMPLOYEE_STATUS.ACTIVE || status === EMPLOYEE_STATUS.ON_LEAVE;
}

// ============================================================================
// Department
// ============================================================================

export const DEPARTMENT = {
  MANAGEMENT: 'management',
  TRAINING: 'training',
  SALES: 'sales',
  OPERATIONS: 'operations',
  SUPPORT: 'support',
  HR: 'hr',
  MAINTENANCE: 'maintenance',
  MARKETING: 'marketing',
  FINANCE: 'finance',
  IT: 'it',
} as const satisfies Record<string, Department>;

export const DEPARTMENT_VALUES = Object.values(DEPARTMENT);

export function isValidDepartment(value: string): value is Department {
  return DEPARTMENT_VALUES.includes(value as Department);
}

// ============================================================================
// Payment Frequency
// ============================================================================

export const PAYMENT_FREQUENCY = {
  MONTHLY: 'monthly',
  BI_WEEKLY: 'bi_weekly',
  WEEKLY: 'weekly',
  HOURLY: 'hourly',
  DAILY: 'daily',
} as const satisfies Record<string, PaymentFrequency>;

export const PAYMENT_FREQUENCY_VALUES = Object.values(PAYMENT_FREQUENCY);

export function isValidPaymentFrequency(value: string): value is PaymentFrequency {
  return PAYMENT_FREQUENCY_VALUES.includes(value as PaymentFrequency);
}

// ============================================================================
// Payment Method
// ============================================================================

export const PAYMENT_METHOD = {
  BANK: 'bank',
  CASH: 'cash',
  MOBILE: 'mobile',
  BKASH: 'bkash',
  NAGAD: 'nagad',
  ROCKET: 'rocket',
  CHECK: 'check',
} as const satisfies Record<string, PaymentMethod>;

export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD);

export function isValidPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_VALUES.includes(value as PaymentMethod);
}

// ============================================================================
// Allowance Type
// ============================================================================

export const ALLOWANCE_TYPE = {
  HOUSING: 'housing',
  TRANSPORT: 'transport',
  MEAL: 'meal',
  MOBILE: 'mobile',
  MEDICAL: 'medical',
  EDUCATION: 'education',
  BONUS: 'bonus',
  OTHER: 'other',
} as const satisfies Record<string, AllowanceType>;

export const ALLOWANCE_TYPE_VALUES = Object.values(ALLOWANCE_TYPE);

export function isValidAllowanceType(value: string): value is AllowanceType {
  return ALLOWANCE_TYPE_VALUES.includes(value as AllowanceType);
}

// ============================================================================
// Deduction Type
// ============================================================================

export const DEDUCTION_TYPE = {
  TAX: 'tax',
  LOAN: 'loan',
  ADVANCE: 'advance',
  PROVIDENT_FUND: 'provident_fund',
  INSURANCE: 'insurance',
  ABSENCE: 'absence',
  OTHER: 'other',
} as const satisfies Record<string, DeductionType>;

export const DEDUCTION_TYPE_VALUES = Object.values(DEDUCTION_TYPE);

export function isValidDeductionType(value: string): value is DeductionType {
  return DEDUCTION_TYPE_VALUES.includes(value as DeductionType);
}

// ============================================================================
// Payroll Status
// ============================================================================

export const PAYROLL_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, PayrollStatus>;

export const PAYROLL_STATUS_VALUES = Object.values(PAYROLL_STATUS);

export function isValidPayrollStatus(value: string): value is PayrollStatus {
  return PAYROLL_STATUS_VALUES.includes(value as PayrollStatus);
}

export function isCompletedPayrollStatus(status: PayrollStatus): boolean {
  return status === PAYROLL_STATUS.PAID;
}

export function isPendingPayrollStatus(status: PayrollStatus): boolean {
  return status === PAYROLL_STATUS.PENDING || status === PAYROLL_STATUS.PROCESSING;
}

// ============================================================================
// Termination Reason
// ============================================================================

export const TERMINATION_REASON = {
  RESIGNATION: 'resignation',
  RETIREMENT: 'retirement',
  TERMINATION: 'termination',
  CONTRACT_END: 'contract_end',
  MUTUAL_AGREEMENT: 'mutual_agreement',
  OTHER: 'other',
} as const satisfies Record<string, TerminationReason>;

export const TERMINATION_REASON_VALUES = Object.values(TERMINATION_REASON);

export function isValidTerminationReason(value: string): value is TerminationReason {
  return TERMINATION_REASON_VALUES.includes(value as TerminationReason);
}

// ============================================================================
// HRM Transaction Categories
// ============================================================================

export const HRM_TRANSACTION_CATEGORIES = {
  SALARY: 'salary',
  BONUS: 'bonus',
  COMMISSION: 'commission',
  OVERTIME: 'overtime',
  SEVERANCE: 'severance',
} as const satisfies Record<string, HRMTransactionCategory>;

export const HRM_CATEGORY_VALUES = Object.values(HRM_TRANSACTION_CATEGORIES);

export function isHRMManagedCategory(category: string): category is HRMTransactionCategory {
  return HRM_CATEGORY_VALUES.includes(category as HRMTransactionCategory);
}

// ============================================================================
// Salary Band
// ============================================================================

export const SALARY_BAND = {
  INTERN: 'intern',
  JUNIOR: 'junior',
  MID: 'mid',
  SENIOR: 'senior',
  LEAD: 'lead',
  EXECUTIVE: 'executive',
  CUSTOM: 'custom',
} as const satisfies Record<string, SalaryBand>;

export const SALARY_BAND_VALUES = Object.values(SALARY_BAND);

export function isValidSalaryBand(value: string): value is SalaryBand {
  return SALARY_BAND_VALUES.includes(value as SalaryBand);
}

// ============================================================================
// Organization Role
// ============================================================================

export const ORG_ROLE = {
  OWNER: 'owner',
  MANAGER: 'manager',
  TRAINER: 'trainer',
  STAFF: 'staff',
  INTERN: 'intern',
  CONSULTANT: 'consultant',
} as const satisfies Record<string, OrgRole>;

export const ORG_ROLE_VALUES = Object.values(ORG_ROLE);

export function isValidOrgRole(value: string): value is OrgRole {
  return ORG_ROLE_VALUES.includes(value as OrgRole);
}

// ============================================================================
// Leave Type
// ============================================================================

import type { LeaveType, LeaveRequestStatus } from './types.js';

export const LEAVE_TYPE = {
  ANNUAL: 'annual',
  SICK: 'sick',
  UNPAID: 'unpaid',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  BEREAVEMENT: 'bereavement',
  COMPENSATORY: 'compensatory',
  OTHER: 'other',
} as const satisfies Record<string, LeaveType>;

export const LEAVE_TYPE_VALUES = Object.values(LEAVE_TYPE);

export function isValidLeaveType(value: string): value is LeaveType {
  return LEAVE_TYPE_VALUES.includes(value as LeaveType);
}

export function isPaidLeaveType(type: LeaveType): boolean {
  return type !== LEAVE_TYPE.UNPAID;
}

// ============================================================================
// Leave Request Status
// ============================================================================

export const LEAVE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, LeaveRequestStatus>;

export const LEAVE_REQUEST_STATUS_VALUES = Object.values(LEAVE_REQUEST_STATUS);

export function isValidLeaveRequestStatus(value: string): value is LeaveRequestStatus {
  return LEAVE_REQUEST_STATUS_VALUES.includes(value as LeaveRequestStatus);
}

export function isPendingLeaveStatus(status: LeaveRequestStatus): boolean {
  return status === LEAVE_REQUEST_STATUS.PENDING;
}

export function isApprovedLeaveStatus(status: LeaveRequestStatus): boolean {
  return status === LEAVE_REQUEST_STATUS.APPROVED;
}

// ============================================================================
// Default Export
// ============================================================================

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
  SALARY_BAND,
  SALARY_BAND_VALUES,
  ORG_ROLE,
  ORG_ROLE_VALUES,
  LEAVE_TYPE,
  LEAVE_TYPE_VALUES,
  LEAVE_REQUEST_STATUS,
  LEAVE_REQUEST_STATUS_VALUES,
};


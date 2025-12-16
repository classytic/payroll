/**
 * @classytic/payroll - Type Definitions
 *
 * Production-grade types for HRM and payroll management
 * Follows industry patterns from Stripe, Netflix, Meta
 *
 * @module @classytic/payroll
 */

import type {
  Model,
  Document,
  ClientSession,
  Types,
  Schema,
  UpdateQuery,
} from 'mongoose';

/** Query filter type */
export type FilterQuery<T> = {
  [P in keyof T]?: T[P] | { $in?: T[P][] } | { $ne?: T[P] } | { $gte?: T[P] } | { $lte?: T[P] };
} & Record<string, unknown>;

// ============================================================================
// Core Types
// ============================================================================

/** Re-export mongoose ObjectId */
export type ObjectId = Types.ObjectId;

/** ObjectId or string representation */
export type ObjectIdLike = ObjectId | string;

/** Generic document type */
export type AnyDocument = Document & Record<string, unknown>;

/** Generic model type */
export type AnyModel = Model<AnyDocument>;

/** Deep partial type for nested objects */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Nullable type helper */
export type Nullable<T> = T | null;

/** Record with string keys */
export type StringRecord<T> = Record<string, T>;

// ============================================================================
// Enum Types (const assertions for better inference)
// ============================================================================

/** Employment type */
export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'intern'
  | 'consultant';

/** Employee status */
export type EmployeeStatus =
  | 'active'
  | 'on_leave'
  | 'suspended'
  | 'terminated';

/** Department type */
export type Department =
  | 'management'
  | 'training'
  | 'sales'
  | 'operations'
  | 'support'
  | 'hr'
  | 'maintenance'
  | 'marketing'
  | 'finance'
  | 'it';

/** Payment frequency */
export type PaymentFrequency =
  | 'monthly'
  | 'bi_weekly'
  | 'weekly'
  | 'hourly'
  | 'daily';

/** Payment method */
export type PaymentMethod =
  | 'bank'
  | 'cash'
  | 'check'
  | 'mobile'  // Generic mobile payment (includes bkash, nagad, rocket)
  | 'bkash'   // Bangladesh specific
  | 'nagad'   // Bangladesh specific
  | 'rocket'; // Bangladesh specific

/** Allowance type */
export type AllowanceType =
  | 'housing'
  | 'transport'
  | 'meal'
  | 'mobile'
  | 'medical'
  | 'education'
  | 'bonus'
  | 'other';

/** Deduction type */
export type DeductionType =
  | 'tax'
  | 'loan'
  | 'advance'
  | 'provident_fund'
  | 'insurance'
  | 'absence'
  | 'other';

/** Payroll status */
export type PayrollStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled';

/** Termination reason */
export type TerminationReason =
  | 'resignation'
  | 'retirement'
  | 'termination'
  | 'contract_end'
  | 'mutual_agreement'
  | 'other';

/** HRM transaction category */
export type HRMTransactionCategory =
  | 'salary'
  | 'bonus'
  | 'commission'
  | 'overtime'
  | 'severance';

/** Salary band */
export type SalaryBand =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'lead'
  | 'executive'
  | 'custom';

/** Organization role */
export type OrgRole =
  | 'owner'
  | 'manager'
  | 'trainer'
  | 'staff'
  | 'intern'
  | 'consultant';

// ============================================================================
// Configuration Types
// ============================================================================

/** Data retention configuration */
export interface DataRetentionConfig {
  /** TTL for payroll records in seconds (default: 2 years) */
  payrollRecordsTTL: number;
  /** Days before TTL to warn (default: 30) */
  exportWarningDays: number;
  /** Archive records before deletion */
  archiveBeforeDeletion: boolean;
}

/** Payroll configuration */
export interface PayrollConfig {
  /** Default currency code */
  defaultCurrency: string;
  /** Allow pro-rating for mid-month hires */
  allowProRating: boolean;
  /** Enable attendance integration */
  attendanceIntegration: boolean;
  /** Auto-apply deductions */
  autoDeductions: boolean;
  /** Enable overtime calculations */
  overtimeEnabled: boolean;
  /** Overtime multiplier (e.g., 1.5 for 150%) */
  overtimeMultiplier: number;
}

/** Salary configuration */
export interface SalaryConfig {
  /** Minimum wage threshold */
  minimumWage: number;
  /** Maximum number of allowances */
  maximumAllowances: number;
  /** Maximum number of deductions */
  maximumDeductions: number;
  /** Default payment frequency */
  defaultFrequency: PaymentFrequency;
}

/** Employment configuration */
export interface EmploymentConfig {
  /** Default probation period in months */
  defaultProbationMonths: number;
  /** Maximum probation period in months */
  maxProbationMonths: number;
  /** Allow re-hiring terminated employees */
  allowReHiring: boolean;
  /** Track employment history */
  trackEmploymentHistory: boolean;
}

/** Validation configuration */
export interface ValidationConfig {
  /** Require bank details for salary payment */
  requireBankDetails: boolean;
  /** Require employee ID */
  requireEmployeeId: boolean;
  /** Enforce unique employee ID per organization */
  uniqueEmployeeIdPerOrg: boolean;
  /** Allow same user in multiple organizations */
  allowMultiTenantEmployees: boolean;
}

/** Tax bracket definition */
export interface TaxBracket {
  /** Minimum income for bracket */
  min: number;
  /** Maximum income for bracket */
  max: number;
  /** Tax rate (0-1) */
  rate: number;
}

/** Salary band range */
export interface SalaryBandRange {
  /** Minimum salary */
  min: number;
  /** Maximum salary */
  max: number;
}

/** Role mapping configuration */
export interface RoleMappingConfig {
  /** Department to role mapping */
  byDepartment: Record<string, OrgRole>;
  /** Employment type to role mapping */
  byEmploymentType: Record<string, OrgRole>;
  /** Default role */
  default: OrgRole;
}

/** Main HRM configuration */
export interface HRMConfig {
  /** Data retention settings */
  dataRetention: DataRetentionConfig;
  /** Payroll settings */
  payroll: PayrollConfig;
  /** Salary settings */
  salary: SalaryConfig;
  /** Employment settings */
  employment: EmploymentConfig;
  /** Validation settings */
  validation: ValidationConfig;
}

/** Single-tenant configuration */
export interface SingleTenantConfig {
  /** Fixed organization ID (optional - will use default if not provided) */
  organizationId?: ObjectIdLike;
  /** Auto-inject organizationId if missing (default: true) */
  autoInject?: boolean;
}

/** Main Payroll initialization config */
export interface PayrollInitConfig {
  /** Employee model (required) */
  EmployeeModel: Model<any>;
  /** Payroll record model (required) */
  PayrollRecordModel: Model<any>;
  /** Transaction model (required) */
  TransactionModel: Model<any>;
  /** Attendance model (optional, for integration) */
  AttendanceModel?: Model<any> | null;
  /** Single-tenant configuration */
  singleTenant?: SingleTenantConfig | null;
  /** Custom logger */
  logger?: Logger;
  /** Custom HRM config overrides */
  config?: DeepPartial<HRMConfig>;
}

// ============================================================================
// Schema Types
// ============================================================================

/** User reference for audit */
export interface UserReference {
  userId?: ObjectId;
  name?: string;
  role?: string;
}

/** Bank details */
export interface BankDetails {
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  branchName?: string;
  routingNumber?: string;
}

/** Allowance entry */
export interface Allowance {
  type: AllowanceType;
  name?: string;
  amount: number;
  /** Whether amount is percentage of base salary */
  isPercentage?: boolean;
  /** Percentage value if isPercentage is true */
  value?: number;
  taxable?: boolean;
  recurring?: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
}

/** Deduction entry */
export interface Deduction {
  type: DeductionType;
  name?: string;
  amount: number;
  /** Whether amount is percentage of base salary */
  isPercentage?: boolean;
  /** Percentage value if isPercentage is true */
  value?: number;
  auto?: boolean;
  recurring?: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
  description?: string;
}

/** Compensation structure */
export interface Compensation {
  /** Base salary amount */
  baseAmount: number;
  /** Payment frequency */
  frequency: PaymentFrequency;
  /** Currency code */
  currency: string;
  /** Allowances array */
  allowances: Allowance[];
  /** Deductions array */
  deductions: Deduction[];
  /** Calculated gross salary */
  grossSalary?: number;
  /** Calculated net salary */
  netSalary?: number;
  /** When compensation became effective */
  effectiveFrom?: Date;
  /** Last modified timestamp */
  lastModified?: Date;
}

/** Work schedule */
export interface WorkSchedule {
  hoursPerWeek?: number;
  hoursPerDay?: number;
  /** Working days (0=Sunday, 6=Saturday) */
  workingDays?: number[];
  shiftStart?: string;
  shiftEnd?: string;
}

/** Employment history entry */
export interface EmploymentHistoryEntry {
  hireDate: Date;
  terminationDate: Date;
  reason?: TerminationReason;
  finalSalary?: number;
  position?: string;
  department?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Payroll stats (pre-calculated) */
export interface PayrollStats {
  totalPaid: number;
  lastPaymentDate?: Date | null;
  nextPaymentDate?: Date | null;
  paymentsThisYear: number;
  averageMonthly: number;
  updatedAt?: Date;
}

/** Employee document structure */
export interface EmployeeDocument extends Document {
  _id: ObjectId;
  userId: ObjectId;
  organizationId: ObjectId;
  employeeId: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  department?: Department;
  position: string;
  hireDate: Date;
  terminationDate?: Date | null;
  probationEndDate?: Date | null;
  employmentHistory: EmploymentHistoryEntry[];
  compensation: Compensation;
  workSchedule?: WorkSchedule;
  bankDetails?: BankDetails;
  payrollStats: PayrollStats;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
  save(options?: { session?: ClientSession }): Promise<this>;
  toObject(): Record<string, unknown>;
}

/** Payroll period */
export interface PayrollPeriod {
  month: number;
  year: number;
  startDate: Date;
  endDate: Date;
  payDate: Date;
}

/** Payroll breakdown */
export interface PayrollBreakdown {
  baseAmount: number;
  allowances: Array<{
    type: string;
    amount: number;
    taxable?: boolean;
  }>;
  deductions: Array<{
    type: string;
    amount: number;
    description?: string;
  }>;
  grossSalary: number;
  netSalary: number;
  /** Taxable amount (base + taxable allowances) */
  taxableAmount?: number;
  /** Calculated tax amount */
  taxAmount?: number;
  workingDays?: number;
  actualDays?: number;
  proRatedAmount?: number;
  attendanceDeduction?: number;
  overtimeAmount?: number;
  bonusAmount?: number;
}

/** Payroll record document */
export interface PayrollRecordDocument extends Document {
  _id: ObjectId;
  organizationId: ObjectId;
  employeeId: ObjectId;
  userId?: ObjectId;
  period: PayrollPeriod;
  breakdown: PayrollBreakdown;
  transactionId?: ObjectId | null;
  status: PayrollStatus;
  paidAt?: Date | null;
  processedAt?: Date | null;
  paymentMethod?: PaymentMethod;
  metadata?: Record<string, unknown>;
  processedBy?: ObjectId;
  notes?: string;
  payslipUrl?: string;
  exported: boolean;
  exportedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  save(options?: { session?: ClientSession }): Promise<this>;
  toObject(): Record<string, unknown>;
}

// ============================================================================
// Operation Types
// ============================================================================

/** Base operation context */
export interface OperationContext {
  /** User performing the operation */
  userId?: ObjectIdLike;
  /** User name */
  userName?: string;
  /** User role */
  userRole?: string;
  /** Organization ID (auto-injected in single-tenant mode) */
  organizationId?: ObjectIdLike;
  /** MongoDB session for transactions */
  session?: ClientSession;
}

/** Hire employee parameters */
export interface HireEmployeeParams {
  /** User ID */
  userId: ObjectIdLike;
  /** Organization ID (optional in single-tenant mode - auto-injected) */
  organizationId?: ObjectIdLike;
  /** Employment details */
  employment: {
    employeeId?: string;
    type?: EmploymentType;
    department?: Department | string;
    position: string;
    hireDate?: Date;
    probationMonths?: number;
    workSchedule?: WorkSchedule;
  };
  /** Compensation details */
  compensation: {
    baseAmount: number;
    frequency?: PaymentFrequency;
    currency?: string;
    allowances?: Array<Partial<Allowance>>;
    deductions?: Array<Partial<Deduction>>;
  };
  /** Bank details */
  bankDetails?: BankDetails;
  /** Operation context */
  context?: OperationContext;
}

/** Update employment parameters */
export interface UpdateEmploymentParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Fields to update */
  updates: {
    department?: Department;
    position?: string;
    employmentType?: EmploymentType;
    status?: EmployeeStatus;
    workSchedule?: WorkSchedule;
  };
  /** Operation context */
  context?: OperationContext;
}

/** Terminate employee parameters */
export interface TerminateEmployeeParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Termination date */
  terminationDate?: Date;
  /** Termination reason */
  reason?: TerminationReason;
  /** Notes */
  notes?: string;
  /** Operation context */
  context?: OperationContext;
}

/** Re-hire employee parameters */
export interface ReHireEmployeeParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** New hire date */
  hireDate?: Date;
  /** New position */
  position?: string;
  /** New department */
  department?: Department;
  /** New compensation */
  compensation?: DeepPartial<Compensation>;
  /** Operation context */
  context?: OperationContext;
}

/** List employees parameters */
export interface ListEmployeesParams {
  /** Organization ID */
  organizationId: ObjectIdLike;
  /** Filters */
  filters?: {
    status?: EmployeeStatus;
    department?: Department;
    employmentType?: EmploymentType;
    minSalary?: number;
    maxSalary?: number;
  };
  /** Pagination */
  pagination?: {
    page?: number;
    limit?: number;
    sort?: Record<string, 1 | -1>;
  };
}

/** Update salary parameters */
export interface UpdateSalaryParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Compensation updates */
  compensation: {
    baseAmount?: number;
    frequency?: PaymentFrequency;
    currency?: string;
  };
  /** Effective from date */
  effectiveFrom?: Date;
  /** Operation context */
  context?: OperationContext;
}

/** Add allowance parameters */
export interface AddAllowanceParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Allowance type */
  type: AllowanceType;
  /** Amount */
  amount: number;
  /** Is taxable */
  taxable?: boolean;
  /** Is recurring */
  recurring?: boolean;
  /** Effective from */
  effectiveFrom?: Date;
  /** Effective to */
  effectiveTo?: Date | null;
  /** Operation context */
  context?: OperationContext;
}

/** Remove allowance parameters */
export interface RemoveAllowanceParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Allowance type to remove */
  type: AllowanceType;
  /** Operation context */
  context?: OperationContext;
}

/** Add deduction parameters */
export interface AddDeductionParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Deduction type */
  type: DeductionType;
  /** Amount */
  amount: number;
  /** Auto-deduct from salary */
  auto?: boolean;
  /** Is recurring */
  recurring?: boolean;
  /** Description */
  description?: string;
  /** Effective from */
  effectiveFrom?: Date;
  /** Effective to */
  effectiveTo?: Date | null;
  /** Operation context */
  context?: OperationContext;
}

/** Remove deduction parameters */
export interface RemoveDeductionParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Deduction type to remove */
  type: DeductionType;
  /** Operation context */
  context?: OperationContext;
}

/** Update bank details parameters */
export interface UpdateBankDetailsParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Bank details */
  bankDetails: BankDetails;
  /** Operation context */
  context?: OperationContext;
}

/** Process salary parameters */
export interface ProcessSalaryParams {
  /** Employee document ID */
  employeeId: ObjectIdLike;
  /** Month (1-12) */
  month: number;
  /** Year */
  year: number;
  /** Payment date */
  paymentDate?: Date;
  /** Payment method */
  paymentMethod?: PaymentMethod;
  /** Operation context */
  context?: OperationContext;
}

/** Process bulk payroll parameters */
export interface ProcessBulkPayrollParams {
  /** Organization ID */
  organizationId: ObjectIdLike;
  /** Month (1-12) */
  month: number;
  /** Year */
  year: number;
  /** Specific employee IDs (empty = all active) */
  employeeIds?: ObjectIdLike[];
  /** Payment date */
  paymentDate?: Date;
  /** Payment method */
  paymentMethod?: PaymentMethod;
  /** Operation context */
  context?: OperationContext;
}

/** Payroll history parameters */
export interface PayrollHistoryParams {
  /** Employee document ID */
  employeeId?: ObjectIdLike;
  /** Organization ID */
  organizationId?: ObjectIdLike;
  /** Month filter */
  month?: number;
  /** Year filter */
  year?: number;
  /** Status filter */
  status?: PayrollStatus;
  /** Pagination */
  pagination?: {
    page?: number;
    limit?: number;
    sort?: Record<string, 1 | -1>;
  };
}

/** Payroll summary parameters */
export interface PayrollSummaryParams {
  /** Organization ID */
  organizationId: ObjectIdLike;
  /** Month */
  month?: number;
  /** Year */
  year?: number;
}

/** Export payroll parameters */
export interface ExportPayrollParams {
  /** Organization ID */
  organizationId: ObjectIdLike;
  /** Start date */
  startDate: Date;
  /** End date */
  endDate: Date;
  /** Export format */
  format?: 'json' | 'csv';
}

// ============================================================================
// Result Types
// ============================================================================

/** Process salary result */
export interface ProcessSalaryResult {
  payrollRecord: PayrollRecordDocument;
  transaction: AnyDocument;
  employee: EmployeeDocument;
}

/** Bulk payroll result */
export interface BulkPayrollResult {
  successful: Array<{
    employeeId: string;
    amount: number;
    transactionId: ObjectId;
  }>;
  failed: Array<{
    employeeId: string;
    error: string;
  }>;
  total: number;
}

/** Payroll summary result */
export interface PayrollSummaryResult {
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  employeeCount: number;
  paidCount: number;
  pendingCount: number;
}

/** Tax calculation result */
export interface TaxCalculationResult {
  gross: number;
  tax: number;
  net: number;
}

/** Compensation breakdown result */
export interface CompensationBreakdownResult {
  baseAmount: number;
  allowances: Array<Allowance & { calculatedAmount: number }>;
  deductions: Array<Deduction & { calculatedAmount: number }>;
  grossAmount: number;
  netAmount: number;
}

// ============================================================================
// Plugin Types
// ============================================================================

/** Payroll instance for plugin reference */
export interface PayrollInstance {
  /** Models container */
  _models: {
    EmployeeModel: Model<any>;
    PayrollRecordModel: Model<any>;
    TransactionModel: Model<any>;
    AttendanceModel?: Model<any> | null;
  } | null;
  /** Event hooks */
  _hooks: Map<string, Array<(data: unknown) => void | Promise<void>>>;
  /** Is initialized */
  _initialized: boolean;
  /** Register event listener */
  on(event: string, listener: (data: unknown) => void | Promise<void>): this;
  /** Emit event */
  emit(event: string, data: unknown): void;
  /** Extended properties from plugins */
  [key: string]: unknown;
}

/** Plugin interface */
export interface PayrollPlugin {
  /** Plugin name */
  name: string;
  /** Apply plugin to Payroll instance */
  apply(payroll: PayrollInstance): void;
}

/** Plugin function signature */
export type PluginFunction = (payroll: PayrollInstance) => void;

/** Plugin type (object or function) */
export type PluginType = PayrollPlugin | PluginFunction;

// ============================================================================
// Event Types
// ============================================================================

/** Event names */
export type PayrollEvent =
  | 'employee:hired'
  | 'employee:terminated'
  | 'employee:rehired'
  | 'salary:updated'
  | 'salary:processed'
  | 'salary:failed'
  | 'payroll:completed'
  | 'payroll:exported'
  | 'compensation:changed'
  | 'milestone:achieved';

/** Event payload base */
export interface EventPayloadBase {
  type: PayrollEvent;
  timestamp: Date;
}

/** Employee hired event */
export interface EmployeeHiredEvent extends EventPayloadBase {
  type: 'employee:hired';
  data: {
    employee: {
      id: ObjectId;
      employeeId: string;
      position: string;
      department?: string;
    };
    organizationId: ObjectId;
    context?: OperationContext;
  };
}

/** Salary processed event */
export interface SalaryProcessedEvent extends EventPayloadBase {
  type: 'salary:processed';
  data: {
    employee: {
      id: ObjectId;
      employeeId: string;
      name?: string;
    };
    payroll: {
      id: ObjectId;
      period: { month: number; year: number };
      amount: number;
    };
    transactionId: ObjectId;
    context?: OperationContext;
  };
}

/** All event payloads union */
export type EventPayload =
  | EmployeeHiredEvent
  | SalaryProcessedEvent;

// ============================================================================
// Logger Types
// ============================================================================

/** Logger interface */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Error Types
// ============================================================================

/** Error codes */
export type ErrorCode =
  | 'PAYROLL_ERROR'
  | 'NOT_INITIALIZED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'INVALID_EMPLOYEE'
  | 'DUPLICATE_PAYROLL'
  | 'VALIDATION_ERROR'
  | 'EMPLOYEE_TERMINATED'
  | 'ALREADY_PROCESSED'
  | 'NOT_ELIGIBLE';

/** HTTP error with status code */
export interface HttpError extends Error {
  code: ErrorCode;
  status: number;
  context?: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// Utility Types
// ============================================================================

/** Pro-rating calculation result */
export interface ProRatingResult {
  isProRated: boolean;
  totalDays: number;
  actualDays: number;
  ratio: number;
}

/** Pay period info */
export interface PayPeriodInfo {
  month: number;
  year: number;
  startDate: Date;
  endDate: Date;
}

/** Employee validation result */
export interface EmployeeValidationResult {
  valid: boolean;
  errors: string[];
}

/** Query builder options */
export interface QueryOptions {
  session?: ClientSession;
  lean?: boolean;
}

// ============================================================================
// Member Type Helpers
// ============================================================================

/**
 * Base employee interface that Payroll expects
 * Extend this in your application
 */
export interface PayrollEmployee {
  _id: ObjectId;
  userId: ObjectId;
  organizationId: ObjectId;
  employeeId: string;
  status: EmployeeStatus;
  compensation: Compensation;
  payrollStats?: PayrollStats;
  bankDetails?: BankDetails;
}

/**
 * Employee model with Payroll fields applied
 * Use this to type your employee model
 */
export type WithPayroll<TEmployee> = TEmployee & {
  compensation: Compensation;
  payrollStats: PayrollStats;
  employmentHistory: EmploymentHistoryEntry[];
};


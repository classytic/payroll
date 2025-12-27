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
} from 'mongoose';
import type { AttendanceInput, PayrollProcessingOptions } from './core/config.js';
import type { PayrollPluginDefinition } from './core/plugin.js';
import type { PayrollEventMap, PayrollEventType } from './core/events.js';

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

/** Leave type */
export type LeaveType =
  | 'annual'
  | 'sick'
  | 'unpaid'
  | 'maternity'
  | 'paternity'
  | 'bereavement'
  | 'compensatory'
  | 'other';

/** Leave request status */
export type LeaveRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

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

/** Main Payroll initialization config with strong generics */
export interface PayrollInitConfig<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> {
  /** Employee model (required) - strongly typed */
  EmployeeModel: Model<TEmployee>;
  /** Payroll record model (required) - strongly typed */
  PayrollRecordModel: Model<TPayrollRecord>;
  /** Transaction model (required) - strongly typed */
  TransactionModel: Model<TTransaction>;
  /** Attendance model (optional, for integration) - strongly typed */
  AttendanceModel?: Model<TAttendance> | null;
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
  /**
   * User reference. In real Mongoose usage this can be either:
   * - an ObjectId
   * - a populated user document containing at least `_id`
   */
  userId: ObjectId | { _id: ObjectId; name?: string; email?: string; phone?: string };
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
  userId: ObjectId;
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
  /** Amount (fixed or ignored if isPercentage is true) */
  amount: number;
  /** Whether amount is percentage of base salary */
  isPercentage?: boolean;
  /** Percentage value if isPercentage is true */
  value?: number;
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
  /** Amount (fixed or ignored if isPercentage is true) */
  amount: number;
  /** Whether amount is percentage of base salary */
  isPercentage?: boolean;
  /** Percentage value if isPercentage is true */
  value?: number;
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
  /**
   * Optional attendance override (useful when embedding into any HRM system).
   * If provided, payroll will use this instead of querying AttendanceModel.
   */
  attendance?: AttendanceInput | null;
  /**
   * Optional processing options (holidays/work schedule/skip flags).
   * This aligns with the pure functions in `@classytic/payroll/core`.
   */
  options?: PayrollProcessingOptions;
  /** Operation context */
  context?: OperationContext;
}

/** Bulk payroll progress information */
export interface BulkPayrollProgress {
  /** Number of employees processed so far */
  processed: number;
  /** Total number of employees to process */
  total: number;
  /** Number of successful processings */
  successful: number;
  /** Number of failed processings */
  failed: number;
  /** Currently processing employee ID (optional) */
  currentEmployee?: string;
  /** Completion percentage (0-100) */
  percentage?: number;
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
  /**
   * Optional processing options (holidays/work schedule/skip flags).
   * Passed through to each employee's salary processing.
   */
  options?: PayrollProcessingOptions;
  /** Operation context */
  context?: OperationContext;
  /**
   * Progress callback - called after each employee is processed
   * Useful for updating job queue progress, UI updates, etc.
   * @example
   * onProgress: async (progress) => {
   *   await Job.findByIdAndUpdate(jobId, { progress });
   * }
   */
  onProgress?: (progress: BulkPayrollProgress) => void | Promise<void>;
  /**
   * Cancellation signal - check signal.aborted to allow graceful cancellation
   * @example
   * const controller = new AbortController();
   * processBulkPayroll({ ..., signal: controller.signal });
   * // Later: controller.abort();
   */
  signal?: AbortSignal;
  /**
   * Batch size - number of employees to process before pausing (default: 10)
   * Helps prevent resource exhaustion and allows event loop to process other tasks
   */
  batchSize?: number;
  /**
   * Batch delay in milliseconds - pause between batches (default: 0)
   * Useful for rate limiting or preventing database connection pool exhaustion
   */
  batchDelay?: number;
  /**
   * Concurrency - number of employees to process in parallel (default: 1)
   * - 1: Sequential processing (safest, default)
   * - 2-5: Moderate parallelism (faster, uses more resources)
   * - 10+: High parallelism (fastest, requires robust infrastructure)
   */
  concurrency?: number;
  /**
   * Use cursor-based streaming for processing (default: auto)
   * - false: Load all into memory (fast for <10k employees)
   * - true: Stream via cursor (scales to millions, constant memory)
   * - undefined/auto: Automatically use streaming for >10k employees
   */
  useStreaming?: boolean;
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

/** Process salary result (generic for best DX) */
export interface ProcessSalaryResult<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
> {
  payrollRecord: TPayrollRecord;
  transaction: TTransaction;
  employee: TEmployee;
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

/**
 * Payroll instance interface (public surface) used for plugin typing.
 * This matches the actual `Payroll` class and keeps generics flowing.
 */
export interface PayrollInstance<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> {
  /** Check if initialized */
  isInitialized(): boolean;

  // ========================================
  // Plugin & Events
  // ========================================

  /** Register a plugin */
  use(plugin: PayrollPluginDefinition): Promise<this>;

  /** Subscribe to typed payroll events */
  on<K extends PayrollEventType>(
    event: K,
    handler: (payload: PayrollEventMap[K]) => void | Promise<void>
  ): () => void;

  // ========================================
  // Employment Lifecycle
  // ========================================

  hire(params: HireEmployeeParams): Promise<TEmployee>;
  getEmployee(params: {
    employeeId: ObjectIdLike;
    populateUser?: boolean;
    session?: ClientSession;
  }): Promise<TEmployee>;
  updateEmployment(params: UpdateEmploymentParams): Promise<TEmployee>;
  terminate(params: TerminateEmployeeParams): Promise<TEmployee>;
  reHire(params: ReHireEmployeeParams): Promise<TEmployee>;
  listEmployees(params: ListEmployeesParams): Promise<{
    docs: TEmployee[];
    totalDocs: number;
    page: number;
    limit: number;
  }>;

  // ========================================
  // Compensation Management
  // ========================================

  updateSalary(params: UpdateSalaryParams): Promise<TEmployee>;
  addAllowance(params: AddAllowanceParams): Promise<TEmployee>;
  removeAllowance(params: RemoveAllowanceParams): Promise<TEmployee>;
  addDeduction(params: AddDeductionParams): Promise<TEmployee>;
  removeDeduction(params: RemoveDeductionParams): Promise<TEmployee>;
  updateBankDetails(params: UpdateBankDetailsParams): Promise<TEmployee>;

  // ========================================
  // Payroll Processing
  // ========================================

  processSalary(
    params: ProcessSalaryParams
  ): Promise<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>>;

  processBulkPayroll(params: ProcessBulkPayrollParams): Promise<BulkPayrollResult>;

  payrollHistory(params: PayrollHistoryParams): Promise<TPayrollRecord[]>;
  payrollSummary(params: PayrollSummaryParams): Promise<PayrollSummaryResult>;
  exportPayroll(params: ExportPayrollParams): Promise<TPayrollRecord[]>;

  /** Extended properties from plugins */
  [key: string]: unknown;
}

/**
 * @deprecated Use `PayrollPluginDefinition` from `@classytic/payroll/core`.
 * This legacy plugin shape is kept for compatibility with older code.
 */
export interface PayrollPlugin {
  name: string;
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

// ============================================================================
// Leave Management Types
// ============================================================================

/** Leave balance entry (embedded in Employee) */
export interface LeaveBalance {
  /** Leave type */
  type: LeaveType;
  /** Allocated days for the year */
  allocated: number;
  /** Used days */
  used: number;
  /** Pending days (requested but not yet approved) */
  pending: number;
  /** Days carried over from previous year */
  carriedOver: number;
  /** When carried-over days expire */
  expiresAt?: Date | null;
  /** Year this balance applies to */
  year: number;
}

/** Leave request document */
export interface LeaveRequestDocument extends Document {
  _id: ObjectId;
  organizationId?: ObjectId; // Optional for single-tenant mode
  employeeId: ObjectId;
  userId: ObjectId;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  halfDay?: boolean;
  reason?: string;
  status: LeaveRequestStatus;
  reviewedBy?: ObjectId | null;
  reviewedAt?: Date | null;
  reviewNotes?: string;
  attachments?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  save(options?: { session?: ClientSession }): Promise<this>;
  toObject(): Record<string, unknown>;
}

/** Request leave input */
export interface RequestLeaveInput {
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  halfDay?: boolean;
  reason?: string;
  attachments?: string[];
}

/** Review leave request input */
export interface ReviewLeaveRequestInput {
  requestId: ObjectIdLike;
  action: 'approve' | 'reject';
  notes?: string;
}

/** Leave history filters */
export interface LeaveHistoryFilters {
  type?: LeaveType;
  status?: LeaveRequestStatus;
  startDate?: Date;
  endDate?: Date;
  year?: number;
}

/** Accrue leave options */
export interface AccrueLeaveOptions {
  type?: LeaveType;
  amount?: number;
  proRate?: boolean;
  asOfDate?: Date;
}

/** Reset annual leave options */
export interface ResetAnnualLeaveOptions {
  year?: number;
  carryOverLimit?: number;
  leaveTypes?: LeaveType[];
}

/** Leave summary result */
export interface LeaveSummaryResult {
  year: number;
  balances: LeaveBalance[];
  totalAllocated: number;
  totalUsed: number;
  totalPending: number;
  totalAvailable: number;
  byType: Record<LeaveType, {
    allocated: number;
    used: number;
    pending: number;
    available: number;
  }>;
}

/** Leave initialization config */
export interface LeaveInitConfig {
  /** Default leave allocations by type */
  defaultAllocations?: Partial<Record<LeaveType, number>>;
  /** Whether to pro-rate for mid-year hires */
  proRateNewHires?: boolean;
  /** Fiscal year start month (1-12, default: 1 for January) */
  fiscalYearStartMonth?: number;
  /** Maximum carry-over days by type */
  maxCarryOver?: Partial<Record<LeaveType, number>>;
}

/** Working days calculation options */
export interface WorkingDaysOptions {
  /** Working days of week (0=Sunday, 6=Saturday). Default: [1,2,3,4,5] */
  workDays?: number[];
  /** Holiday dates to exclude */
  holidays?: Date[];
  /** Include end date in calculation (default: true) */
  includeEndDate?: boolean;
}


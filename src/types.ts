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
  | 'voided'
  | 'reversed';

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

/** Organization role (app-defined) */
export type OrgRole = string;

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

/** Employee identity mode - how employees are identified and looked up */
export type EmployeeIdentityMode = 'userId' | 'employeeId' | 'email' | 'any';

/** Validation configuration */
export interface ValidationConfig {
  /** Require bank details for salary payment */
  requireBankDetails: boolean;
  /** Require userId for all employees (false = allow guest employees) */
  requireUserId: boolean;
  /** Primary identity mode for lookups */
  identityMode: EmployeeIdentityMode;
  /** Fallback modes if primary lookup fails */
  identityFallbacks: EmployeeIdentityMode[];
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
   * User reference (optional - guest employees don't have user accounts)
   * In real Mongoose usage this can be either:
   * - an ObjectId
   * - a populated user document containing at least `_id`
   * - undefined (guest employee)
   */
  userId?: ObjectId | { _id: ObjectId; name?: string; email?: string; phone?: string };
  /** Email for guest employees (when userId is not present) */
  email?: string;
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

/** Payroll correction entry */
export interface PayrollCorrection {
  previousAmount: number;
  newAmount: number;
  reason: string;
  correctedBy: ObjectId;
  correctedAt: Date;
}

/** Payroll record document */
export interface PayrollRecordDocument extends Document {
  _id: ObjectId;
  organizationId: ObjectId;
  employeeId: ObjectId;
  userId?: ObjectId;  // Optional for guest employees
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
  corrections?: PayrollCorrection[];

  /**
   * Payroll run type (regular, off-cycle, supplemental, retroactive)
   * Default: 'regular'
   */
  payrollRunType?: PayrollRunType;

  /**
   * Retroactive adjustment details (for back-pay or corrections)
   * Only populated when payrollRunType is 'retroactive'
   */
  retroactiveAdjustment?: RetroactiveAdjustment;

  /**
   * Employer contributions for this payroll
   * Costs borne by employer (not deducted from employee pay)
   */
  employerContributions?: EmployerContribution[];

  // Soft delete / void / reversal fields (v2.4.0+)
  /** Whether this record has been voided or reversed */
  isVoided?: boolean;
  /** When the record was voided/reversed */
  voidedAt?: Date | null;
  /** User who voided/reversed the record */
  voidedBy?: ObjectId | null;
  /** Reason for voiding/reversing */
  voidReason?: string | null;
  /** When the record was reversed (for REVERSED status) */
  reversedAt?: Date | null;
  /** User who reversed the record */
  reversedBy?: ObjectId | null;
  /** Reason for reversing the record */
  reversalReason?: string | null;
  /** For reversed payrolls: ID of the reversal transaction */
  reversalTransactionId?: ObjectId | null;
  /** For reversal records: ID of the original payroll record being reversed */
  originalPayrollId?: ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;

  /**
   * Optional per-document expiration date for MongoDB TTL index.
   *
   * When set, this document will be automatically deleted by MongoDB at this date,
   * overriding the global TTL configuration. Use for jurisdiction-specific retention.
   *
   * @example 7-year retention for USA
   * expireAt: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000)
   *
   * @example Never expire
   * expireAt: undefined
   */
  expireAt?: Date | null;
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

/**
 * Base parameters for all employee operations
 * Enforces multi-tenant isolation and supports dual identity
 */
/**
 * Employee ID resolution mode
 * 
 * @example
 * // Auto-detect (recommended)
 * { employeeId: 'EMP-001' } // Treated as business ID
 * 
 * @example
 * // Force business ID (for 24-hex IDs that look like ObjectId)
 * { employeeId: '000000000000000000000001', employeeIdMode: 'businessId' }
 * 
 * @example
 * // Force ObjectId lookup
 * { employeeId: employee._id, employeeIdMode: 'objectId' }
 */
export type EmployeeIdMode = 'auto' | 'objectId' | 'businessId';

export interface EmployeeOperationParams {
  /**
   * Employee identifier (supports both formats):
   * - ObjectId: employee._id (MongoDB document ID)
   * - String: "EMP-001" (business identifier)
   */
  employeeId: ObjectIdLike | string;

  /**
   * How to interpret employeeId (explicit control for edge cases)
   * 
   * @default 'auto' - Smart detection
   *
   * Explicit mode hint for employeeId disambiguation
   *
   * - 'auto' (default): Auto-detect via isValidObjectId()
   * - 'objectId': Force treat as MongoDB _id (ObjectId)
   * - 'businessId': Force treat as business employeeId string
   *
   * Use 'businessId' if your employeeIds are 24-hex strings like
   * "507f1f77bcf86cd799439011" to prevent ObjectId collision.
   *
   * @default 'auto'
   * @since v2.3.0
   *
   * @example
   * // Force treat as business ID (prevents ObjectId collision)
   * await payroll.processSalary({
   *   employeeId: "507f1f77bcf86cd799439011",
   *   employeeIdMode: 'businessId',
   *   organizationId: org._id,
   *   month: 3, year: 2024
   * });
   */
  employeeIdMode?: EmployeeIdMode;

  /**
   * Organization ID for multi-tenant isolation
   *
   * **Multi-tenant mode:** REQUIRED (enforced at runtime)
   * **Single-tenant mode:** Optional (auto-injected if autoInject=true)
   *
   * **Resolution Priority:**
   * 1. This explicit value (highest)
   * 2. context.organizationId (from middleware/auth)
   * 3. Single-tenant config (if autoInject enabled)
   * 4. Error thrown (if none found in multi-tenant mode)
   *
   * @example
   * // Multi-tenant: explicit organizationId
   * await payroll.processSalary({
   *   employeeId: emp._id,
   *   organizationId: org._id,  // Required
   *   month: 3, year: 2024
   * });
   *
   * @example
   * // Multi-tenant: via context
   * await payroll.processSalary({
   *   employeeId: emp._id,
   *   month: 3, year: 2024,
   *   context: { organizationId: org._id }  // From middleware
   * });
   *
   * @example
   * // Single-tenant: auto-injected
   * const payroll = createPayrollInstance()
   *   .forSingleTenant({ organizationId: myOrg._id, autoInject: true })
   *   .build();
   *
   * await payroll.processSalary({
   *   employeeId: emp._id,
   *   // organizationId auto-injected ✨
   *   month: 3, year: 2024
   * });
   */
  organizationId?: ObjectIdLike;

  /**
   * Operation context (auth, session, metadata)
   */
  context?: OperationContext;
}

/** Hire employee parameters */
export interface HireEmployeeParams {
  /** User ID (optional - for guest employees without user account) */
  userId?: ObjectIdLike;
  /** Organization ID (optional in single-tenant mode - auto-injected) */
  organizationId?: ObjectIdLike;
  /** Employment details */
  employment: {
    employeeId?: string;
    /** Email for guest employees (when userId is not provided) */
    email?: string;
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
export interface UpdateEmploymentParams extends EmployeeOperationParams {
  /** Fields to update */
  updates: {
    department?: Department;
    position?: string;
    employmentType?: EmploymentType;
    status?: EmployeeStatus;
    workSchedule?: WorkSchedule;
  };
}

/** Terminate employee parameters */
export interface TerminateEmployeeParams extends EmployeeOperationParams {
  /** Termination date */
  terminationDate?: Date;
  /** Termination reason */
  reason?: TerminationReason;
  /** Notes */
  notes?: string;
}

/** Re-hire employee parameters */
export interface ReHireEmployeeParams extends EmployeeOperationParams {
  /** New hire date */
  hireDate?: Date;
  /** New position */
  position?: string;
  /** New department */
  department?: Department;
  /** New compensation */
  compensation?: DeepPartial<Compensation>;
}

/** Update salary parameters */
export interface UpdateSalaryParams extends EmployeeOperationParams {
  /** Compensation updates */
  compensation: {
    baseAmount?: number;
    frequency?: PaymentFrequency;
    currency?: string;
  };
  /** Effective from date */
  effectiveFrom?: Date;
}

/** Add allowance parameters */
export interface AddAllowanceParams extends EmployeeOperationParams {
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
}

/** Remove allowance parameters */
export interface RemoveAllowanceParams extends EmployeeOperationParams {
  /** Allowance type to remove */
  type: AllowanceType;
}

/** Add deduction parameters */
export interface AddDeductionParams extends EmployeeOperationParams {
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
}

/** Remove deduction parameters */
export interface RemoveDeductionParams extends EmployeeOperationParams {
  /** Deduction type to remove */
  type: DeductionType;
}

/** Update bank details parameters */
export interface UpdateBankDetailsParams extends EmployeeOperationParams {
  /** Bank details */
  bankDetails: BankDetails;
}

/** Get employee parameters */
export interface GetEmployeeParams extends EmployeeOperationParams {
  /** Whether to populate user reference */
  populateUser?: boolean;
  /** MongoDB session for transactions */
  session?: import('mongoose').ClientSession;
}

/**
 * Payroll run types
 *
 * - `regular`: Normal monthly/bi-weekly payroll cycle
 * - `off-cycle`: Unscheduled payroll run (bonuses, corrections, missed payments)
 * - `supplemental`: Additional payment outside regular cycle (commissions, one-time bonuses)
 * - `retroactive`: Adjustment for previous period (back-pay, corrections)
 */
export type PayrollRunType = 'regular' | 'off-cycle' | 'supplemental' | 'retroactive';

/**
 * Retroactive adjustment details
 *
 * Used when correcting payroll from a previous period
 */
export interface RetroactiveAdjustment {
  /** Original period being adjusted */
  originalPeriod: {
    month: number;
    year: number;
  };
  /** Original payroll record ID being corrected */
  originalPayrollId?: ObjectId;
  /** Reason for retroactive adjustment */
  reason: string;
  /** Adjustment amount (positive for back-pay, negative for recovery) */
  adjustmentAmount: number;
  /** Whether this was approved by management */
  approved?: boolean;
  /** Approver user ID */
  approvedBy?: ObjectId;
  /** Approval date */
  approvedAt?: Date;
}

/**
 * Employer contributions (beyond employee tax withholding)
 *
 * These are costs borne by the employer, not deducted from employee pay.
 * Examples: Social security (employer portion), pension matching, unemployment insurance
 */
export interface EmployerContribution {
  /** Type of contribution */
  type: 'social_security' | 'pension' | 'unemployment' | 'health_insurance' | 'other';
  /** Contribution amount */
  amount: number;
  /** Description */
  description?: string;
  /** Whether this is mandatory by law */
  mandatory?: boolean;
  /** Reference number for filing */
  referenceNumber?: string;
}

/** Process salary parameters */
export interface ProcessSalaryParams extends EmployeeOperationParams {
  /** Month (1-12) */
  month: number;
  /** Year */
  year: number;
  /** Payment date */
  paymentDate?: Date;
  /** Payment method */
  paymentMethod?: PaymentMethod;
  /**
   * Payroll run type (default: 'regular')
   *
   * Use for off-cycle payments, supplemental runs, or retroactive adjustments
   */
  payrollRunType?: PayrollRunType;
  /**
   * Retroactive adjustment details
   *
   * Required when payrollRunType is 'retroactive'
   */
  retroactiveAdjustment?: RetroactiveAdjustment;
  /**
   * Employer contributions for this payroll
   *
   * These are costs borne by the employer (not deducted from employee pay)
   */
  employerContributions?: EmployerContribution[];
  /**
   * Idempotency key (Stripe-style)
   * If provided, duplicate calls with same key return cached result
   * Auto-generated if not provided: `payroll:{orgId}:{empId}:{year}-{month}`
   */
  idempotencyKey?: string;
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
  /** Employee identifier (ObjectId _id or string business ID like "EMP-001") */
  employeeId?: ObjectIdLike | string;
  /** Explicit mode hint for employeeId disambiguation @since v2.3.0 */
  employeeIdMode?: EmployeeIdMode;
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
// Void / Reversal Types (v2.4.0+)
// ============================================================================

/**
 * Void payroll parameters
 *
 * Use this for payrolls that haven't been paid yet (pending, processing, failed).
 * Voiding marks the record as invalid without creating a reversal transaction.
 *
 * @example
 * ```typescript
 * await payroll.voidPayroll({
 *   organizationId: org._id,
 *   payrollRecordId: record._id,
 *   reason: 'Test payroll - not intended for production',
 *   context: { userId: admin._id },
 * });
 * ```
 */
export interface VoidPayrollParams {
  /** Organization ID for multi-tenant isolation */
  organizationId: ObjectIdLike;
  /** Payroll record ID to void */
  payrollRecordId: ObjectIdLike;
  /** Reason for voiding (required for audit trail) */
  reason: string;
  /** Operation context */
  context?: OperationContext;
  /** Also void/cancel the associated transaction */
  voidTransaction?: boolean;
}

/**
 * Reverse payroll parameters
 *
 * Use this for payrolls that have already been paid.
 * Creates a reversal (negative) transaction to offset the original payment.
 *
 * @example
 * ```typescript
 * const result = await payroll.reversePayroll({
 *   organizationId: org._id,
 *   payrollRecordId: record._id,
 *   reason: 'Duplicate payment - reversing',
 *   createReversalTransaction: true,
 *   context: { userId: admin._id },
 * });
 * console.log(result.reversalTransaction); // Negative amount transaction
 * ```
 */
export interface ReversePayrollParams {
  /** Organization ID for multi-tenant isolation */
  organizationId: ObjectIdLike;
  /** Payroll record ID to reverse */
  payrollRecordId: ObjectIdLike;
  /** Reason for reversal (required for audit trail) */
  reason: string;
  /** Create a reversal (negative) transaction (default: true) */
  createReversalTransaction?: boolean;
  /** Operation context */
  context?: OperationContext;
}

/**
 * Restore payroll parameters
 *
 * Restores a voided (not reversed) payroll record.
 * Cannot restore reversed payrolls as they have financial transactions.
 */
export interface RestorePayrollParams {
  /** Organization ID for multi-tenant isolation */
  organizationId: ObjectIdLike;
  /** Payroll record ID to restore */
  payrollRecordId: ObjectIdLike;
  /** Reason for restoration */
  reason?: string;
  /** Operation context */
  context?: OperationContext;
}

/** Result of voiding a payroll */
export interface VoidPayrollResult {
  /** The voided payroll record */
  payrollRecord: PayrollRecordDocument;
  /** Whether the transaction was also voided */
  transactionVoided: boolean;
  /** Number of tax withholdings voided */
  taxWithholdingsVoided: number;
}

/** Result of reversing a payroll */
export interface ReversePayrollResult {
  /** The reversed payroll record */
  payrollRecord: PayrollRecordDocument;
  /** The reversal transaction (if createReversalTransaction was true) */
  reversalTransaction?: AnyDocument;
  /** Number of tax withholdings cancelled */
  taxWithholdingsCancelled: number;
}

/** Result of restoring a payroll */
export interface RestorePayrollResult {
  /** The restored payroll record */
  payrollRecord: PayrollRecordDocument;
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

  /** Register webhook (Stripe-style) */
  registerWebhook(config: import('./core/webhooks.js').WebhookConfig): void;

  /** Unregister webhook */
  unregisterWebhook(url: string): void;

  /** Get webhook delivery log */
  getWebhookDeliveries(options?: { event?: PayrollEventType; status?: 'pending' | 'sent' | 'failed'; limit?: number }): import('./core/webhooks.js').WebhookDelivery[];

  // ========================================
  // Employment Lifecycle
  // ========================================

  hire(params: HireEmployeeParams): Promise<TEmployee>;
  getEmployee(params: GetEmployeeParams): Promise<TEmployee>;
  updateEmployment(params: UpdateEmploymentParams): Promise<TEmployee>;
  terminate(params: TerminateEmployeeParams): Promise<TEmployee>;
  reHire(params: ReHireEmployeeParams): Promise<TEmployee>;

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

  // ========================================
  // Void / Reversal (v2.4.0+)
  // ========================================

  /**
   * Void a payroll record (before payment)
   *
   * Use for: pending, processing, or failed payrolls
   * Creates audit trail but no reversal transaction
   */
  voidPayroll(params: VoidPayrollParams): Promise<VoidPayrollResult>;

  /**
   * Reverse a paid payroll
   *
   * Creates a reversal (negative) transaction to offset the original
   * Required for compliance: maintains full audit trail
   */
  reversePayroll(params: ReversePayrollParams): Promise<ReversePayrollResult>;

  /**
   * Restore a voided payroll
   *
   * Only works for voided payrolls (not reversed)
   */
  restorePayroll(params: RestorePayrollParams): Promise<RestorePayrollResult>;

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
  | 'NOT_ELIGIBLE'
  | 'SECURITY_ERROR';

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
  userId?: ObjectId;  // Optional for guest employees
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
  workingDays?: number[];
  /** Holiday dates to exclude */
  holidays?: Date[];
  /** Include end date in calculation (default: true) */
  includeEndDate?: boolean;
}

// ============================================================================
// Tax Withholding Types
// ============================================================================

/** Tax types supported by the system */
export type TaxType =
  | 'income_tax'
  | 'social_security'
  | 'health_insurance'
  | 'pension'
  | 'employment_insurance'
  | 'local_tax'
  | 'other';

/** Tax withholding status */
export type TaxStatus = 'pending' | 'submitted' | 'paid' | 'cancelled';

/** Tax withholding document */
export interface TaxWithholdingDocument extends Document {
  _id: ObjectId;
  organizationId: ObjectId;
  employeeId: ObjectId;
  userId?: ObjectId;
  payrollRecordId: ObjectId;
  transactionId: ObjectId;

  period: PayrollPeriod;

  amount: number;
  currency: string;

  taxType: TaxType;
  taxRate: number;
  taxableAmount: number;

  status: TaxStatus;

  submittedAt?: Date;
  paidAt?: Date;
  governmentTransactionId?: ObjectId;
  referenceNumber?: string;

  notes?: string;
  metadata?: Record<string, unknown>;

  // Void fields (v2.4.0+)
  voidedAt?: Date;
  voidedBy?: ObjectId;
  voidReason?: string;
  voidMetadata?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;

  // Instance methods
  markAsSubmitted(submittedAt?: Date): void;
  markAsPaid(transactionId?: ObjectId, referenceNumber?: string, paidAt?: Date): void;

  save(options?: { session?: ClientSession }): Promise<this>;
  toObject(): Record<string, unknown>;
}

/** Parameters for querying pending tax withholdings */
export interface GetPendingTaxParams {
  organizationId: ObjectIdLike;
  fromPeriod?: { month: number; year: number };
  toPeriod?: { month: number; year: number };
  taxType?: TaxType;
  employeeId?: ObjectIdLike;
}

/** Parameters for tax summary aggregation */
export interface TaxSummaryParams {
  organizationId: ObjectIdLike;
  fromPeriod: { month: number; year: number };
  toPeriod: { month: number; year: number };
  groupBy?: 'type' | 'period' | 'employee';
}

/** Tax summary grouped by type */
export interface TaxSummaryByType {
  taxType: TaxType;
  totalAmount: number;
  count: number;
  withholdingIds: ObjectId[];
}

/** Tax summary result */
export interface TaxSummaryResult {
  totalAmount: number;
  count: number;
  byType: TaxSummaryByType[];
  period: { fromMonth: number; fromYear: number; toMonth: number; toYear: number };
}

/** Parameters for marking tax withholdings as paid */
export interface MarkTaxPaidParams {
  organizationId: ObjectIdLike;
  withholdingIds: ObjectIdLike[];
  createTransaction?: boolean;
  referenceNumber?: string;
  paidAt?: Date;
  notes?: string;
  context?: OperationContext;
}

// ============================================================================
// Pagination Types (Mongokit Integration)
// ============================================================================

/** Offset-based pagination result (re-exported from mongokit) */
export type {
  OffsetPaginationResult,
  KeysetPaginationResult,
} from '@classytic/mongokit';

// ============================================================================
// Repository Types (Mongokit Integration)
// ============================================================================

/** Repository instance from @classytic/mongokit */
export type { Repository } from '@classytic/mongokit';

/** Repository plugin context for multi-tenancy */
export interface RepositoryPluginContext {
  organizationId?: ObjectId;
  userId?: ObjectId;
}

/** Repository instances used internally by Payroll */
export interface PayrollRepositories<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTransaction extends AnyDocument = AnyDocument,
> {
  /** Employee repository */
  employee: import('@classytic/mongokit').Repository<TEmployee>;
  /** Payroll record repository */
  payrollRecord: import('@classytic/mongokit').Repository<TPayrollRecord>;
  /** Leave request repository (optional) */
  leaveRequest?: import('@classytic/mongokit').Repository<TLeaveRequest>;
  /** Transaction repository (optional) */
  transaction?: import('@classytic/mongokit').Repository<TTransaction>;
}

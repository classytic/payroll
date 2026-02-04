/**
 * @classytic/payroll
 *
 * Enterprise-grade HRM and Payroll Management for MongoDB/Mongoose
 * One clear way: Payroll class + schemas + utilities
 *
 * ## Public API
 *
 * - **Payroll class**: Single entry point with full org isolation
 * - **Schemas, Types, Utilities**: For extending and customizing
 *
 * All services (Employee, Payroll, Compensation, Leave, TaxWithholding) are
 * internal-only. Use Payroll class methods for multi-tenant safe operations.
 *
 * @packageDocumentation
 */

// ============================================================================
// Main API (Payroll Class - Single Entry Point)
// ============================================================================

/**
 * The Payroll class is the ONLY way to interact with payroll operations.
 * All employee, payroll, compensation, leave, and tax operations go through
 * this orchestrated API with built-in multi-tenant isolation.
 */
export {
  Payroll,
  PayrollBuilder,
  createPayrollInstance,
} from './payroll.js';

// ============================================================================
// Types (common)
// ============================================================================

export type {
  // Core types
  ObjectIdLike,
  AnyDocument,
  AnyModel,
  DeepPartial,
  Nullable,
  FilterQuery,

  // Configuration types
  PayrollInitConfig,
  HRMConfig,
  SingleTenantConfig,
  OperationContext,
  PayrollInstance,
  Logger,
  DataRetentionConfig,
  PayrollConfig,
  SalaryConfig,
  EmploymentConfig,
  ValidationConfig,
  EmployeeIdentityMode,
  EmployeeIdMode,
  TaxBracket,
  TaxCalculationOptions,
  PreTaxDeductionInput,
  TaxCreditInput,
  SalaryBandRange,
  RoleMappingConfig,

  // Document types
  EmployeeDocument,
  PayrollRecordDocument,

  // Sub-document / Schema types
  Compensation,
  BankDetails,
  Allowance,
  Deduction,
  WorkSchedule,
  PayrollStats,
  PayrollPeriod,
  PayrollBreakdown,
  PayrollCorrection,
  EmploymentHistoryEntry,
  UserReference,

  // Enum types
  AllowanceType,
  DeductionType,
  EmploymentType,
  EmployeeStatus,
  Department,
  TerminationReason,
  PaymentMethod,
  PayrollStatus,
  PaymentFrequency,
  SalaryBand,
  OrgRole,
  HRMTransactionCategory,
  LeaveType,
  LeaveRequestStatus,

  // Leave types
  LeaveBalance,
  LeaveRequestDocument,
  RequestLeaveInput,
  ReviewLeaveRequestInput,
  LeaveHistoryFilters,
  LeaveInitConfig,
  LeaveSummaryResult,
  WorkingDaysOptions,
  AccrueLeaveOptions,
  ResetAnnualLeaveOptions,

  // Operation parameter types
  EmployeeOperationParams,  // v2.3.0: Base interface for all employee operations
  HireEmployeeParams,
  GetEmployeeParams,  // v2.3.0: Includes organizationId, employeeIdMode
  UpdateEmploymentParams,
  TerminateEmployeeParams,
  ReHireEmployeeParams,
  UpdateSalaryParams,
  AddAllowanceParams,
  RemoveAllowanceParams,
  AddDeductionParams,
  RemoveDeductionParams,
  UpdateBankDetailsParams,
  ProcessSalaryParams,
  ProcessBulkPayrollParams,
  PayrollHistoryParams,
  PayrollSummaryParams,
  ExportPayrollParams,

  // Void / Reversal types (v2.4.0+)
  VoidPayrollParams,
  ReversePayrollParams,
  RestorePayrollParams,
  VoidPayrollResult,
  ReversePayrollResult,
  RestorePayrollResult,

  // Result types
  ProcessSalaryResult,
  BulkPayrollResult,
  BulkPayrollProgress,
  PayrollSummaryResult,
  TaxCalculationResult,
  CompensationBreakdownResult,

  // Plugin types (legacy - prefer PayrollPluginDefinition)
  PayrollPlugin,
  PluginFunction,
  PluginType,

  // Event types
  PayrollEvent,
  EventPayloadBase,
  EmployeeHiredEvent,
  SalaryProcessedEvent,
  EventPayload,

  // Error types
  ErrorCode,
  HttpError,

  // Utility types
  PayPeriodInfo,
  EmployeeValidationResult,
  QueryOptions,
  PayrollEmployee,
  WithPayroll,
} from './types.js';

// ============================================================================
// TRANSACTION INTERFACE (aligned with @classytic/shared-types)
// ============================================================================

/**
 * Use @classytic/shared-types for transaction interfaces
 * This ensures alignment between payroll and revenue packages
 * 
 * import type { ITransaction, ITransactionCreateInput } from '@classytic/shared-types';
 */

export type {
  IPayrollTransaction,
  IPayrollTransactionCreateInput,
} from './types/transaction.interface.js';

export {
  isPayrollTransaction,
} from './types/transaction.interface.js';

// Transaction factory for creating consistent transactions
export {
  createPayrollTransaction,
  createTaxPaymentTransaction,
  TransactionFactory,
  type CreatePayrollTransactionInput,
  type CreateTaxPaymentTransactionInput,
} from './factories/transaction.factory.js';

// ============================================================================
// Idempotency & Webhooks (Stripe-level features)
// ============================================================================

export {
  IdempotencyManager,
  generatePayrollIdempotencyKey,
  type IdempotentResult,
} from './core/idempotency.js';

export {
  WebhookManager,
  type WebhookConfig,
  type WebhookDelivery,
} from './core/webhooks.js';

// ============================================================================
// Repository Plugins (Mongokit Integration - v2.4.0+)
// ============================================================================

export {
  multiTenantPlugin,
} from './core/repository-plugins.js';

// ============================================================================
// Plugin System (v2.4.0+)
// ============================================================================

export {
  type PayrollPluginDefinition,
  type PluginContext,
  type PluginHooks,
  definePlugin,
} from './core/plugin.js';

// ============================================================================
// Timeline Audit Integration (@classytic/mongoose-timeline-audit)
// ============================================================================

export {
  PAYROLL_EVENTS,
  type PayrollTimelineEvent,
  EMPLOYEE_TIMELINE_CONFIG,
  PAYROLL_RECORD_TIMELINE_CONFIG,
  LEAVE_REQUEST_TIMELINE_CONFIG,
  buildTimelineMetadata,
  buildRequestContext,
} from './core/timeline-audit.js';

// ============================================================================
// State Machines (v2.4.0+)
// ============================================================================

export {
  // State machine utility
  StateMachine,
  createStateMachine,
  type StateMachineConfig,
  type StateTransition,
  type TransitionResult,
  // Status-specific state machines
  PayrollStatusMachine,
  TaxStatusMachine,
  LeaveRequestStatusMachine,
  EmployeeStatusMachine,
  // State types
  type PayrollStatusState,
  type TaxStatusState,
  type LeaveRequestStatusState,
  type EmployeeStatusState,
} from './core/payroll-states.js';

// ============================================================================
// Enums / Constants (common)
// ============================================================================

export {
  EMPLOYMENT_TYPE,
  EMPLOYEE_STATUS,
  DEPARTMENT,
  PAYMENT_FREQUENCY,
  ALLOWANCE_TYPE,
  DEDUCTION_TYPE,
  PAYROLL_STATUS,
  TERMINATION_REASON,
  LEAVE_TYPE,
  LEAVE_REQUEST_STATUS,
  isValidLeaveType,
  isPaidLeaveType,
  isValidLeaveRequestStatus,
  isPendingLeaveStatus,
  isApprovedLeaveStatus,
  // Payroll status helpers (v2.4.0+)
  isVoidablePayrollStatus,
  requiresReversalPayrollStatus,
  isVoidedOrReversedStatus,
} from './enums.js';

// ============================================================================
// Configuration (optional)
// ============================================================================

export {
  HRM_CONFIG,
  mergeConfig,
  determineOrgRole,
} from './config.js';

// ============================================================================
// Schemas (required)
// ============================================================================

export {
  // Schema options (multi-tenant / multi-branch flexibility)
  type PayrollSchemaOptions,
  // Sub-schemas
  allowanceSchema,
  deductionSchema,
  compensationSchema,
  workScheduleSchema,
  bankDetailsSchema,
  employmentHistorySchema,
  payrollStatsSchema,
  // Configurable field creators (for multi-branch/tenant setups)
  createEmploymentFields,
  createPayrollRecordFields,
  // Index helpers
  employeeIndexes,
  payrollRecordIndexes,
  applyEmployeeIndexes,
  applyPayrollRecordIndexes,
  // Schema factory functions
  createEmployeeSchema,
  createPayrollRecordSchema,
  // Leave schemas (utilities only - model exports are below)
  leaveBalanceSchema,
  leaveBalanceFields,
  leaveRequestIndexes,
  applyLeaveRequestIndexes,
  getLeaveRequestFields,
} from './schemas/index.js';

// ============================================================================
// Plugins (recommended)
// ============================================================================

export {
  employeePlugin,
  type EmployeePluginOptions,
} from './plugins/index.js';

// ============================================================================
// Factories (data builders)
// ============================================================================

export {
  EmployeeFactory,
  EmployeeBuilder,
  createEmployee,
} from './factories/employee.factory.js';

export type {
  CreateEmployeeParams,
  EmployeeData,
  TerminationData,
} from './factories/employee.factory.js';

// ============================================================================
// Errors
// ============================================================================

export {
  PayrollError,
  NotInitializedError,
  EmployeeNotFoundError,
  InvalidEmployeeError,
  DuplicatePayrollError,
  NotEligibleError,
  EmployeeTerminatedError,
  AlreadyProcessedError,
  ValidationError,
  SecurityError,
  createError,
  isPayrollError,
  extractErrorInfo,
  toPayrollError,
} from './errors/index.js';

// ============================================================================
// Attendance (ClockIn integration)
// ============================================================================

export {
  getAttendance,
  batchGetAttendance,
} from './attendance.js';

// ============================================================================
// Holidays
// ============================================================================

export {
  createHolidaySchema,
  getHolidays,
  type Holiday,
} from './holidays.js';

// ============================================================================
// Leave Management
// ============================================================================

export {
  leaveRequestSchema,
  getLeaveRequestModel,
  type LeaveRequestModel,
} from './models/index.js';

export {
  DEFAULT_LEAVE_ALLOCATIONS,
  DEFAULT_CARRY_OVER,
  calculateLeaveDays,
  hasLeaveBalance,
  getLeaveBalance,
  getLeaveBalances,
  getAvailableDays,
  getLeaveSummary,
  initializeLeaveBalances,
  proRateAllocation,
  calculateUnpaidLeaveDeduction,
  getUnpaidLeaveDays,
  calculateCarryOver,
  accrueLeaveToBalance,
} from './utils/index.js';

// ============================================================================
// Leave Service (INTERNAL ONLY - NOT EXPORTED)
// ============================================================================

// LeaveService is internal-only. Use Payroll class leave methods:
//   payroll.requestLeave(), payroll.reviewLeaveRequest(),
//   payroll.cancelLeaveRequest(), payroll.getLeaveHistory()

// ============================================================================
// Pure Calculators
// ============================================================================

/**
 * @since v2.3.0
 * Pure calculation functions with no database dependencies.
 * 
 * Perfect for:
 * - Client-side salary previews
 * - Testing without DB setup
 * - Microservices/serverless
 * - Documentation examples
 * 
 * All calculators are pure (no side effects) and can run in browser.
 */
export {
  // Salary breakdown calculator (main)
  calculateSalaryBreakdown,
  type SalaryCalculationInput,
  type ProcessedAllowance,
  type ProcessedDeduction,

  // Pro-rating calculator
  calculateProRating,
  applyProRating,
  shouldProRate,
  type ProRatingInput,
  type ProRatingResult,

  // Attendance deduction calculator
  calculateAttendanceDeduction,
  calculateDailyRate,
  calculateHourlyRate,
  calculatePartialDayDeduction,
  calculateTotalAttendanceDeduction,
  type AttendanceDeductionInput,
  type AttendanceDeductionResult,
} from './calculators/index.js';

// ============================================================================
// Shift Compliance (NEW)
// ============================================================================

export {
  // Main calculator
  calculateShiftCompliance,

  // Individual calculators (for advanced usage)
  calculateLatePenalty,
  calculateOvertimeBonus,

  // Granular calculation functions
  calculateFlatPenalty,
  calculatePerMinutePenalty,
  calculatePercentagePenalty,
  calculateTieredPenalty,
  calculateDailyOvertime,
  calculateWeeklyOvertime,
  calculateMonthlyOvertime,
  calculateWeekendPremium,
  calculateNightShiftDifferential,

  // Preset policies
  createPolicyFromPreset,
  DEFAULT_ATTENDANCE_POLICY,
  MANUFACTURING_POLICY,
  RETAIL_POLICY,
  OFFICE_POLICY,
  HEALTHCARE_POLICY,
  HOSPITALITY_POLICY,

  // Fluent builders
  AttendancePolicyBuilder,
  createLatePolicyBuilder,
  createOvertimePolicyBuilder,
  createClockRoundingPolicyBuilder,
  LatePolicyBuilder,
  TieredPenaltyBuilder,
  OvertimePolicyBuilder,
  ClockRoundingPolicyBuilder,

  // Mongoose schemas (optional)
  AttendancePolicySchema,
  AttendancePolicySchemaDefinition,
  LateArrivalPolicySchema,
  LateArrivalPolicySchemaDefinition,
  EarlyDeparturePolicySchema,
  EarlyDeparturePolicySchemaDefinition,
  OvertimePolicySchema,
  OvertimePolicySchemaDefinition,
  ClockRoundingPolicySchema,
  ClockRoundingPolicySchemaDefinition,
  PenaltyTierSchema,
  PenaltyTierSchemaDefinition,
  MaxPenaltiesSchema,
  MaxPenaltiesSchemaDefinition,
  WeekendPremiumSchema,
  WeekendPremiumSchemaDefinition,
  NightShiftDifferentialSchema,
  NightShiftDifferentialSchemaDefinition,

  // Main types
  type AttendancePolicy,
  type ShiftComplianceData,
  type ShiftComplianceResult,
  type CalculateShiftComplianceInput,

  // Policy types
  type LateArrivalPolicy,
  type EarlyDeparturePolicy,
  type OvertimePolicy,
  type ClockRoundingPolicy,

  // Mode and configuration types
  type PenaltyMode,
  type OvertimeMode,
  type ResetPeriod,
  type RoundingMode,

  // Supporting types
  type PenaltyTier,
  type MaxPenaltiesPerPeriod,
  type WeekendPremium,
  type NightShiftDifferential,

  // Occurrence types
  type LateOccurrence,
  type EarlyOccurrence,
  type OvertimeOccurrence,

  // Result types
  type LatePenaltyResult,
  type EarlyDeparturePenaltyResult,
  type OvertimeBonusResult,
  type ShiftDifferentialResult,

  // Manager override types
  type PenaltyOverride,

  // Schema model interfaces
  type AttendancePolicyDocument,
  type AttendancePolicyModel,
} from './shift-compliance/index.js';

// ============================================================================
// Tax Withholding
// ============================================================================

export type {
  TaxWithholdingDocument,
  TaxType,
  TaxStatus,
  GetPendingTaxParams,
  TaxSummaryParams,
  TaxSummaryResult,
  TaxSummaryByType,
  MarkTaxPaidParams,
} from './types.js';

export {
  TAX_TYPE,
  TAX_STATUS,
  TAX_TYPE_VALUES,
  TAX_STATUS_VALUES,
  isValidTaxType,
  isValidTaxStatus,
  isPendingTaxStatus,
  isPaidTaxStatus,
  isCancelledTaxStatus,
} from './enums.js';

export {
  taxWithholdingSchema,
  getTaxWithholdingModel,
  type TaxWithholdingModel,
} from './models/index.js';

export {
  taxWithholdingIndexes,
  applyTaxWithholdingIndexes,
  getTaxWithholdingFields,
} from './schemas/index.js';

// ============================================================================
// Tax Withholding Service (INTERNAL ONLY - NOT EXPORTED)
// ============================================================================

// TaxWithholdingService is internal-only. Use Payroll class methods:
//   payroll.getPendingTaxWithholdings(), payroll.getTaxSummary(),
//   payroll.markTaxWithholdingsPaid()

// ============================================================================
// Security Utilities (Multi-Tenant Isolation)
// ============================================================================

/**
 * @since v2.3.0
 * Secure employee lookup utilities that enforce organizationId isolation
 */
export {
  findEmployeeSecure,
  employeeExistsSecure,
  findEmployeesSecure,
  requireOrganizationId,
  type SecureEmployeeLookupOptions,
} from './utils/index.js';

/**
 * @since v2.3.0
 * Smart organization ID resolution with priority chain
 */
export {
  resolveOrganizationId,
  validateOrganizationId,
  tryResolveOrganizationId,
  type ResolveOrganizationIdParams,
  type ContainerLike,
} from './utils/index.js';

/**
 * @since v2.3.0
 * Dual identity system (ObjectId _id + string employeeId)
 */
export {
  detectEmployeeIdType,
  normalizeEmployeeId,
  isStringEmployeeId,
  isObjectIdEmployeeId,
  formatEmployeeId,
  type EmployeeIdType,
  type EmployeeQueryFilter,
} from './utils/index.js';

// ============================================================================
// Type Guards & Error Helpers (DX Utilities)
// ============================================================================

/**
 * @since v2.7.0
 * Type-safe error checking and employee type guards.
 * Also available from '@classytic/payroll/utils'.
 */
export {
  isMongoError,
  isDuplicateKeyError,
  parseDuplicateKeyError,
  isTransactionError,
  isTransactionUnsupportedError,
  isConnectionError,
  isGuestEmployee,
  hasUserId,
  isValidationError,
  isError,
  getErrorMessage,
} from './utils/type-guards.js';

export {
  getEmployeeEmail,
  getEmployeeName,
} from './utils/employee-type-guards.js';

/**
 * @since v2.7.5
 * Higher-level error handling utilities for common payroll scenarios.
 */
export {
  handleTransactionError,
  handleDuplicateKeyError,
  handlePayrollError,
  formatUserError,
  type TransactionErrorResult,
  type DuplicateKeyErrorResult,
  type PayrollErrorResult,
} from './utils/error-helpers.js';

// ============================================================================
// Mongokit Audit Plugins
// ============================================================================

/**
 * @since v2.7.0
 * Repository plugins for audit trail tracking.
 */
export {
  payrollAuditPlugin,
  readAuditPlugin,
  fullAuditPlugin,
  type AuditContext,
  type AuditEvent,
} from './core/mongokit-plugins/index.js';

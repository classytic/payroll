/**
 * @classytic/payroll
 *
 * Enterprise-grade HRM and Payroll Management for MongoDB/Mongoose
 * One clear way: builder + schemas + plugin + errors
 *
 * @packageDocumentation
 */

// ============================================================================
// Main API (recommended)
// ============================================================================

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
  TaxBracket,
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
  HRMTransactionCategory,
  SalaryBand,
  OrgRole,
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
  HireEmployeeParams,
  UpdateEmploymentParams,
  TerminateEmployeeParams,
  ReHireEmployeeParams,
  ListEmployeesParams,
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

  // Result types
  ProcessSalaryResult,
  BulkPayrollResult,
  PayrollSummaryResult,
  TaxCalculationResult,
  CompensationBreakdownResult,

  // Plugin types
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
  ProRatingResult,
  PayPeriodInfo,
  EmployeeValidationResult,
  QueryOptions,
  PayrollEmployee,
  WithPayroll,
} from './types.js';

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
  HRM_TRANSACTION_CATEGORIES,
  LEAVE_TYPE,
  LEAVE_REQUEST_STATUS,
  isValidLeaveType,
  isPaidLeaveType,
  isValidLeaveRequestStatus,
  isPendingLeaveStatus,
  isApprovedLeaveStatus,
} from './enums.js';

// ============================================================================
// Configuration (optional)
// ============================================================================

export {
  HRM_CONFIG,
  mergeConfig,
  calculateTax,
  determineOrgRole,
} from './config.js';

// ============================================================================
// Schemas (required)
// ============================================================================

export {
  allowanceSchema,
  deductionSchema,
  compensationSchema,
  workScheduleSchema,
  bankDetailsSchema,
  employmentHistorySchema,
  payrollStatsSchema,
  employmentFields,
  applyEmployeeIndexes,
  applyPayrollRecordIndexes,
  createEmployeeSchema,
  createPayrollRecordSchema,
  // Leave schemas
  leaveBalanceSchema,
  leaveBalanceFields,
  leaveRequestFields,
  leaveRequestIndexes,
  applyLeaveRequestIndexes,
  createLeaveRequestSchema,
} from './schemas/index.js';

// ============================================================================
// Plugins (recommended)
// ============================================================================

export {
  employeePlugin,
  type EmployeePluginOptions,
} from './plugins/index.js';

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

export {
  LeaveService,
  createLeaveService,
  type LeaveServiceConfig,
  type RequestLeaveParams,
  type ReviewLeaveParams,
  type CancelLeaveParams,
  type LeaveForPayrollParams,
  type LeaveRequestResult,
  type ReviewResult,
  type OverlapCheckResult,
} from './services/index.js';

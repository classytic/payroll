/**
 * @classytic/payroll
 *
 * Enterprise-grade HRM and Payroll Management for MongoDB/Mongoose
 * Clean, pluggable, multi-tenant architecture
 *
 * @packageDocumentation
 */

// ============================================================================
// Main Entry Point
// ============================================================================

export {
  Payroll,
  PayrollBuilder,
  createPayrollInstance,
  getPayroll,
  resetPayroll,
  payroll as payrollInstance,
} from './payroll.js';

// ============================================================================
// Types
// ============================================================================

export type {
  // Core Types
  ObjectIdLike,
  PayrollInitConfig,
  HRMConfig,
  SingleTenantConfig,
  OperationContext,
  PayrollInstance,
  Logger,
  DeepPartial,

  // Enums as Types
  EmploymentType,
  EmployeeStatus,
  Department,
  PaymentFrequency,
  AllowanceType,
  DeductionType,
  PayrollStatus,
  TerminationReason,
  HRMTransactionCategory,

  // Data Types
  Allowance,
  Deduction,
  Compensation,
  WorkSchedule,
  BankDetails,
  EmploymentHistoryEntry,
  PayrollStats,
  PayrollPeriod,
  PayrollBreakdown,

  // Document Types
  EmployeeDocument,
  PayrollRecordDocument,

  // Operation Types
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
  ProcessSalaryResult,
  BulkPayrollResult,
  PayrollSummaryResult,
} from './types.js';

// ============================================================================
// Enums / Constants
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
} from './enums.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  HRM_CONFIG,
  mergeConfig,
  calculateTax,
  determineOrgRole,
} from './config.js';

// ============================================================================
// Schemas
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
} from './schemas/index.js';

// ============================================================================
// Models
// ============================================================================

export {
  payrollRecordSchema,
  getPayrollRecordModel,
  type PayrollRecordModel,
} from './models/index.js';

// ============================================================================
// Plugins
// ============================================================================

export {
  employeePlugin,
  type EmployeePluginOptions,
} from './plugins/index.js';

// ============================================================================
// Core
// ============================================================================

export {
  // Result Type
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  type Result,
  type Ok,
  type Err,

  // Events
  createEventBus,
  type PayrollEventMap,
  type EventBus,

  // Plugins
  PluginManager,
  type PayrollPluginDefinition,
  type PluginContext,

  // Container
  Container,
  initializeContainer,
  type ModelsContainer,
  type ContainerConfig,
} from './core/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  PayrollError,
  NotInitializedError,
  EmployeeNotFoundError,
  DuplicatePayrollError,
  NotEligibleError,
  EmployeeTerminatedError,
  ValidationError,
} from './errors/index.js';

// ============================================================================
// Factories
// ============================================================================

export {
  // Employee Factory
  EmployeeFactory,
  EmployeeBuilder,

  // Payroll Factory
  PayrollFactory,
  BatchPayrollFactory,

  // Compensation Factory
  CompensationFactory,
  CompensationBuilder,
} from './factories/index.js';

// ============================================================================
// Services
// ============================================================================

export {
  EmployeeService,
  PayrollService,
  CompensationService,
} from './services/index.js';

// ============================================================================
// Utilities
// ============================================================================

export {
  // Date Utilities
  addDays,
  addMonths,
  addYears,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  diffInDays,
  diffInMonths,
  getPayPeriod,
  getCurrentPeriod,
  isDateInRange,
  formatDateForDB,
  getWorkingDaysInMonth,

  // Calculation Utilities
  sum,
  sumBy,
  calculateGross,
  calculateNet,
  sumAllowances,
  sumDeductions,
  applyPercentage,
  calculateProRating,
  pipe,
  compose,

  // Validation Utilities
  isActive,
  isTerminated,
  isOnProbation,
  isEmployed,
  canReceiveSalary,
  createValidator,
  required,
  min,
  max,
  inRange,
  oneOf,

  // Query Builders
  QueryBuilder,
  EmployeeQueryBuilder,
  PayrollQueryBuilder,
  employee,
  payroll,
  toObjectId,
} from './utils/index.js';

// ============================================================================
// Logger
// ============================================================================

export {
  logger,
  getLogger,
  setLogger,
  enableLogging,
  disableLogging,
  isLoggingEnabled,
} from './utils/logger.js';

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
// Default Export
// ============================================================================

import { payroll as payrollDefault } from './payroll.js';
export default payrollDefault;


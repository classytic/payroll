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
  ObjectIdLike,
  PayrollInitConfig,
  HRMConfig,
  SingleTenantConfig,
  OperationContext,
  PayrollInstance,
  Logger,
  DeepPartial,
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


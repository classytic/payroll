export { initializeHRM, isInitialized } from './init.js';

// Logger configuration (for custom logger injection)
export { setLogger } from './utils/logger.js';

export {
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
} from './enums.js';

export {
  HRM_CONFIG,
  SALARY_BANDS,
  TAX_BRACKETS,
  ORG_ROLES,
  ORG_ROLE_KEYS,
  ROLE_MAPPING,
  calculateTax,
  getSalaryBand,
  determineOrgRole,
} from './config.js';

export {
  employmentFields,
  allowanceSchema,
  deductionSchema,
  compensationSchema,
  workScheduleSchema,
  bankDetailsSchema,
  employmentHistorySchema,
  payrollStatsSchema,
} from './schemas/employment.schema.js';

export { employeePlugin } from './plugins/employee.plugin.js';

export { default as PayrollRecord } from './models/payroll-record.model.js';

export { hrm, hrmOrchestrator } from './hrm.orchestrator.js';

import { hrm as hrmDefault } from './hrm.orchestrator.js';
export default hrmDefault;

// ============================================
// Pure Utilities - Testable, Reusable Functions
// ============================================

export {
  addDays,
  addMonths,
  diffInDays,
  diffInMonths,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWeekday,
  isWeekend,
  getPayPeriod,
  getCurrentPeriod,
  calculateProbationEnd,
  formatDateForDB,
  parseDBDate,
} from './utils/date.utils.js';

export {
  sum,
  sumBy,
  sumAllowances,
  sumDeductions,
  calculateGross,
  calculateNet,
  applyPercentage,
  calculatePercentage,
  createAllowanceCalculator,
  createDeductionCalculator,
  calculateTotalCompensation,
  pipe,
  compose,
} from './utils/calculation.utils.js';

export {
  isActive,
  isOnLeave,
  isSuspended,
  isTerminated,
  isEmployed,
  canReceiveSalary,
  hasCompensation,
  required,
  minValue,
  maxValue,
  isInRange,
  isPositive,
  isValidStatus,
  isValidEmploymentType,
  compose as composeValidators,
} from './utils/validation.utils.js';

// ============================================
// Query Builders - Fluent API for MongoDB
// ============================================

export {
  QueryBuilder,
  EmployeeQueryBuilder,
  PayrollQueryBuilder,
  employee,
  payroll,
  toObjectId,
} from './utils/query-builders.js';

// ============================================
// Factory Methods - Clean Object Creation
// ============================================

export {
  EmployeeFactory,
  EmployeeBuilder,
  createEmployee,
} from './factories/employee.factory.js';

export {
  PayrollFactory,
  PayrollBuilder,
  BatchPayrollFactory,
  createPayroll,
} from './factories/payroll.factory.js';

export {
  CompensationFactory,
  CompensationBuilder,
  CompensationPresets,
  createCompensation,
} from './factories/compensation.factory.js';

// ============================================
// Service Layer - Clean Abstractions with DI
// ============================================

export {
  EmployeeService,
  createEmployeeService,
} from './services/employee.service.js';

export {
  PayrollService,
  createPayrollService,
} from './services/payroll.service.js';

export {
  CompensationService,
  createCompensationService,
} from './services/compensation.service.js';

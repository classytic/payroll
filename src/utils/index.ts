/**
 * @classytic/payroll - Utilities
 *
 * Pure, testable utility functions
 */

// ============================================================================
// Logger
// ============================================================================

export {
  logger,
  getLogger,
  setLogger,
  resetLogger,
  createChildLogger,
  createSilentLogger,
  enableLogging,
  disableLogging,
  isLoggingEnabled,
} from './logger.js';

// ============================================================================
// Date Utilities
// ============================================================================

export {
  addDays,
  addMonths,
  addYears,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  diffInDays,
  diffInMonths,
  diffInYears,
  daysBetween,
  monthsBetween,
  isWeekday,
  isWeekend,
  getDayOfWeek,
  getDayName,
  getPayPeriod,
  getCurrentPeriod,
  getWorkingDaysInMonth,
  getDaysInMonth,
  calculateProbationEnd,
  isOnProbation,
  calculateYearsOfService,
  isDateInRange,
  isEffectiveForPeriod,
  getPayPeriodDateRange,
  formatDateForDB,
  parseDBDate,
  formatPeriod,
  parsePeriod,
  getMonthName,
  getShortMonthName,
  default as dateUtils,
} from './date.js';

// ============================================================================
// Money Utilities (Banker's Rounding for Payroll Compliance)
// ============================================================================

export {
  roundMoney,
  roundMoneyPositive,
  percentageOf,
  prorateAmount,
} from './money.js';

// ============================================================================
// Calculation Utilities
// ============================================================================

export {
  sum,
  sumBy,
  sumAllowances,
  sumDeductions,
  applyPercentage,
  calculatePercentage,
  roundTo,
  calculateGross,
  calculateNet,
  calculateTotalCompensation,
  calculateAllowanceAmount,
  calculateDeductionAmount,
  calculateAllowances,
  calculateDeductions,
  calculateCompensationBreakdown,
  applyTaxBrackets,
  calculateTax,
  calculateOvertime,
  calculateHourlyRate,
  calculateDailyRate,
  default as calculationUtils,
} from './calculation.js';

// Pro-rating utilities - use calculators/prorating.calculator.ts for advanced features
export {
  calculateProRating,
  applyProRating,
} from '../calculators/prorating.calculator.js';

// ============================================================================
// Validation Utilities
// ============================================================================

export {
  isActive,
  isOnLeave,
  isSuspended,
  isTerminated,
  isEmployed,
  canReceiveSalary,
  canUpdateEmployment,
  hasCompensation,
  isValidCompensation,
  isValidBankDetails,
  isInProbation,
  hasCompletedProbation,
  isEligibleForBonus,
  isEligibleForPayroll,
  required,
  min,
  max,
  inRange,
  isPositive,
  oneOf,
  isValidStatus,
  isValidEmploymentType,
  composeValidators,
  createValidator,
  hasRequiredFields,
  minValue,
  maxValue,
  isInRange,
  default as validationUtils,
} from './validation.js';

// ============================================================================
// Query Builders
// ============================================================================

export {
  toObjectId,
  safeToObjectId,
  isValidObjectId,
  QueryBuilder,
  EmployeeQueryBuilder,
  PayrollQueryBuilder,
  employee,
  payroll,
  createQueryBuilder,
  buildEmployeeQuery,
  buildPayrollQuery,
  buildAggregationPipeline,
  matchStage,
  groupStage,
  sortStage,
  limitStage,
  skipStage,
  projectStage,
  lookupStage,
  unwindStage,
  default as queryBuilders,
} from './query-builders.js';

// ============================================================================
// Leave Utilities
// ============================================================================

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
  default as leaveUtils,
} from './leave.js';

// ============================================================================
// Secure Employee Lookup (Multi-Tenant Safety)
// ============================================================================

export {
  findEmployeeSecure,
  employeeExistsSecure,
  findEmployeesSecure,
  requireOrganizationId,
  type SecureEmployeeLookupOptions,
  type EmployeeIdMode,
} from './employee-lookup.js';

// ============================================================================
// Organization Resolution (Smart Auto-Detection)
// ============================================================================

export {
  resolveOrganizationId,
  validateOrganizationId,
  tryResolveOrganizationId,
  type ResolveOrganizationIdParams,
  type ContainerLike,
} from './org-resolution.js';

// ============================================================================
// Employee Identity (Dual ID System)
// ============================================================================

export {
  detectEmployeeIdType,
  normalizeEmployeeId,
  isStringEmployeeId,
  isObjectIdEmployeeId,
  formatEmployeeId,
  type EmployeeIdType,
  type EmployeeQueryFilter,
} from './employee-identity.js';

// Note: buildEmployeeQuery from employee-identity.js is intentionally not exported
// to avoid naming conflict with query-builders.js. It's used internally by findEmployeeSecure.

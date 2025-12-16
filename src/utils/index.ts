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
  calculateProRating,
  applyProRating,
  calculateProRatedSalary,
  applyTaxBrackets,
  calculateTax,
  pipe,
  compose,
  createAllowanceCalculator,
  createDeductionCalculator,
  calculateOvertime,
  calculateHourlyRate,
  calculateDailyRate,
  default as calculationUtils,
} from './calculation.js';

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


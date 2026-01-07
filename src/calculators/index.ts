/**
 * @classytic/payroll - Pure Calculators
 *
 * Pure functions for payroll calculations.
 * No database dependencies - perfect for:
 * - Client-side salary previews
 * - Testing without DB setup
 * - Microservices/serverless
 * - Documentation examples
 *
 * All calculators are:
 * - Pure (no side effects)
 * - Stateless (no external dependencies)
 * - Testable (simple input/output)
 * - Reusable (can be imported anywhere)
 *
 * @packageDocumentation
 */

// ============================================================================
// Salary Calculator
// ============================================================================

export {
  calculateSalaryBreakdown,
  type SalaryCalculationInput,
  type ProcessedAllowance,
  type ProcessedDeduction,
} from './salary.calculator.js';

// ============================================================================
// Pro-Rating Calculator
// ============================================================================

export {
  calculateProRating,
  applyProRating,
  shouldProRate,
  type ProRatingInput,
  type ProRatingResult,
} from './prorating.calculator.js';

// ============================================================================
// Attendance Calculator
// ============================================================================

export {
  calculateAttendanceDeduction,
  calculateDailyRate,
  calculateHourlyRate,
  calculatePartialDayDeduction,
  calculateTotalAttendanceDeduction,
  type AttendanceDeductionInput,
  type AttendanceDeductionResult,
} from './attendance.calculator.js';


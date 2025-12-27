/**
 * @classytic/payroll - Leave Utilities
 *
 * Pure, composable leave calculation functions
 */

import type {
  LeaveBalance,
  LeaveType,
  LeaveInitConfig,
  LeaveSummaryResult,
  WorkingDaysOptions,
} from '../types.js';

// ============================================================================
// Default Configurations
// ============================================================================

/** Default leave allocations by type (days per year) */
export const DEFAULT_LEAVE_ALLOCATIONS: Record<LeaveType, number> = {
  annual: 20,
  sick: 10,
  unpaid: 0, // Unlimited
  maternity: 90,
  paternity: 10,
  bereavement: 5,
  compensatory: 0,
  other: 0,
};

/** Default carry-over limits by type (days) */
export const DEFAULT_CARRY_OVER: Record<LeaveType, number> = {
  annual: 5,
  sick: 0,
  unpaid: 0,
  maternity: 0,
  paternity: 0,
  bereavement: 0,
  compensatory: 5,
  other: 0,
};

// ============================================================================
// Working Days Calculation
// ============================================================================

/**
 * Calculate working days between two dates
 * Excludes weekends and optionally holidays
 *
 * @example
 * // March 2024: Get working days for a week
 * const days = calculateLeaveDays(
 *   new Date('2024-03-01'),
 *   new Date('2024-03-08'),
 *   { holidays: [new Date('2024-03-05')] }
 * );
 */
export function calculateLeaveDays(
  startDate: Date,
  endDate: Date,
  options: WorkingDaysOptions = {}
): number {
  const {
    workDays = [1, 2, 3, 4, 5], // Mon-Fri by default
    holidays = [],
    includeEndDate = true,
  } = options;

  const holidaySet = new Set(holidays.map((d) => new Date(d).toDateString()));

  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (!includeEndDate) {
    end.setDate(end.getDate() - 1);
  }

  while (current <= end) {
    const isWorkDay = workDays.includes(current.getDay());
    const isHoliday = holidaySet.has(current.toDateString());

    if (isWorkDay && !isHoliday) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

// ============================================================================
// Balance Checks
// ============================================================================

/**
 * Check if employee has sufficient leave balance
 *
 * @example
 * if (hasLeaveBalance(employee, 'annual', 5)) {
 *   // Can request 5 days annual leave
 * }
 */
export function hasLeaveBalance(
  employee: { leaveBalances?: LeaveBalance[] },
  type: LeaveType,
  days: number,
  year = new Date().getFullYear()
): boolean {
  // Unpaid leave is always allowed
  if (type === 'unpaid') return true;

  const balance = getLeaveBalance(employee, type, year);
  if (!balance) return false;

  const available =
    balance.allocated + balance.carriedOver - balance.used - balance.pending;
  return available >= days;
}

/**
 * Get leave balance for a specific type
 */
export function getLeaveBalance(
  employee: { leaveBalances?: LeaveBalance[] },
  type: LeaveType,
  year = new Date().getFullYear()
): LeaveBalance | undefined {
  return employee.leaveBalances?.find((b) => b.type === type && b.year === year);
}

/**
 * Get all leave balances for a year
 */
export function getLeaveBalances(
  employee: { leaveBalances?: LeaveBalance[] },
  year = new Date().getFullYear()
): LeaveBalance[] {
  return (employee.leaveBalances || []).filter((b) => b.year === year);
}

/**
 * Calculate available days for a leave type
 */
export function getAvailableDays(
  employee: { leaveBalances?: LeaveBalance[] },
  type: LeaveType,
  year = new Date().getFullYear()
): number {
  // Unpaid leave has no limit
  if (type === 'unpaid') return Infinity;

  const balance = getLeaveBalance(employee, type, year);
  if (!balance) return 0;

  return Math.max(
    0,
    balance.allocated + balance.carriedOver - balance.used - balance.pending
  );
}

// ============================================================================
// Leave Summary
// ============================================================================

/**
 * Get comprehensive leave summary for an employee
 *
 * @example
 * const summary = getLeaveSummary(employee, 2024);
 * console.log(`Available: ${summary.totalAvailable} days`);
 * console.log(`Annual: ${summary.byType.annual?.available || 0} days`);
 */
export function getLeaveSummary(
  employee: { leaveBalances?: LeaveBalance[] },
  year = new Date().getFullYear()
): LeaveSummaryResult {
  const balances = getLeaveBalances(employee, year);

  const byType = {} as LeaveSummaryResult['byType'];
  let totalAllocated = 0;
  let totalUsed = 0;
  let totalPending = 0;

  for (const balance of balances) {
    const available = Math.max(
      0,
      balance.allocated + balance.carriedOver - balance.used - balance.pending
    );
    byType[balance.type] = {
      allocated: balance.allocated + balance.carriedOver,
      used: balance.used,
      pending: balance.pending,
      available,
    };
    totalAllocated += balance.allocated + balance.carriedOver;
    totalUsed += balance.used;
    totalPending += balance.pending;
  }

  return {
    year,
    balances,
    totalAllocated,
    totalUsed,
    totalPending,
    totalAvailable: Math.max(0, totalAllocated - totalUsed - totalPending),
    byType,
  };
}

// ============================================================================
// Balance Initialization
// ============================================================================

/**
 * Initialize leave balances for a new employee
 *
 * @example
 * // Full allocation for employee hired Jan 1st
 * const balances = initializeLeaveBalances(new Date('2024-01-01'));
 *
 * // Pro-rated for mid-year hire
 * const balances = initializeLeaveBalances(new Date('2024-07-01'), {
 *   proRateNewHires: true,
 * });
 */
export function initializeLeaveBalances(
  hireDate: Date,
  config: LeaveInitConfig = {},
  year = new Date().getFullYear()
): LeaveBalance[] {
  const {
    defaultAllocations = DEFAULT_LEAVE_ALLOCATIONS,
    proRateNewHires = true,
    fiscalYearStartMonth = 1,
  } = config;

  const fiscalYearStart = new Date(year, fiscalYearStartMonth - 1, 1);
  const fiscalYearEnd = new Date(year + 1, fiscalYearStartMonth - 1, 0);

  // Calculate proration if hired mid-year
  let prorationRatio = 1;
  if (proRateNewHires && hireDate > fiscalYearStart) {
    const totalDays = diffInDays(fiscalYearStart, fiscalYearEnd);
    const remainingDays = diffInDays(hireDate, fiscalYearEnd);
    prorationRatio = Math.max(0, Math.min(1, remainingDays / totalDays));
  }

  const balances: LeaveBalance[] = [];

  for (const [type, allocation] of Object.entries(defaultAllocations)) {
    if (allocation > 0) {
      balances.push({
        type: type as LeaveType,
        allocated: Math.round(allocation * prorationRatio),
        used: 0,
        pending: 0,
        carriedOver: 0,
        year,
      });
    }
  }

  return balances;
}

/**
 * Calculate prorated allocation for mid-year hire
 */
export function proRateAllocation(
  fullAllocation: number,
  hireDate: Date,
  fiscalYearStartMonth = 1,
  year = new Date().getFullYear()
): number {
  const fiscalYearStart = new Date(year, fiscalYearStartMonth - 1, 1);

  if (hireDate <= fiscalYearStart) {
    return fullAllocation;
  }

  const fiscalYearEnd = new Date(year + 1, fiscalYearStartMonth - 1, 0);
  const totalDays = diffInDays(fiscalYearStart, fiscalYearEnd);
  const remainingDays = Math.max(0, diffInDays(hireDate, fiscalYearEnd));

  return Math.round((fullAllocation * remainingDays) / totalDays);
}

// ============================================================================
// Payroll Integration
// ============================================================================

/**
 * Calculate unpaid leave deduction for payroll
 *
 * @example
 * const deduction = calculateUnpaidLeaveDeduction(100000, 5, 22);
 * // Daily rate: 100000 / 22 = 4545
 * // Deduction: 4545 * 5 = 22727
 */
export function calculateUnpaidLeaveDeduction(
  baseSalary: number,
  unpaidDays: number,
  workingDaysInMonth: number
): number {
  if (unpaidDays <= 0 || workingDaysInMonth <= 0) return 0;

  const dailyRate = baseSalary / workingDaysInMonth;
  return Math.round(dailyRate * unpaidDays);
}

/**
 * Get total unpaid leave days from a list of leave requests
 */
export function getUnpaidLeaveDays(
  leaveRequests: Array<{ type: LeaveType; days: number; status: string }>,
  status = 'approved'
): number {
  return leaveRequests
    .filter((r) => r.type === 'unpaid' && r.status === status)
    .reduce((sum, r) => sum + r.days, 0);
}

// ============================================================================
// Year-End Processing
// ============================================================================

/**
 * Calculate carry-over balances for year-end
 *
 * Creates new year balances for ALL leave types from the current year.
 * Types with carry-over limits get their unused balance carried forward.
 * Types without carry-over (or 0 limit) start fresh with 0 carriedOver.
 *
 * @example
 * // With default allocations - creates balances for all types
 * const newBalances = calculateCarryOver(employee.leaveBalances, {
 *   annual: 5,
 *   compensatory: 3,
 * });
 * // Merge with existing (don't replace entirely)
 * employee.leaveBalances.push(...newBalances);
 *
 * // With custom allocations (org-specific entitlements)
 * const newBalances = calculateCarryOver(employee.leaveBalances, {
 *   annual: 5,
 *   compensatory: 3,
 * }, {
 *   annual: 25,  // Custom org policy
 *   sick: 15,
 * });
 */
export function calculateCarryOver(
  balances: LeaveBalance[],
  maxCarryOver: Partial<Record<LeaveType, number>> = DEFAULT_CARRY_OVER,
  newYearAllocations: Partial<Record<LeaveType, number>> = DEFAULT_LEAVE_ALLOCATIONS
): LeaveBalance[] {
  if (!balances.length) return [];

  const currentYear = balances[0].year;
  const newYear = currentYear + 1;

  // Process ALL leave types from current year, not just those with carry-over
  return balances.map((balance) => {
    const available =
      balance.allocated + balance.carriedOver - balance.used - balance.pending;
    const maxForType = maxCarryOver[balance.type] ?? 0;
    // Only carry over if max > 0, otherwise start fresh
    const carryOver = maxForType > 0
      ? Math.min(Math.max(0, available), maxForType)
      : 0;

    return {
      type: balance.type,
      allocated: newYearAllocations[balance.type] ?? DEFAULT_LEAVE_ALLOCATIONS[balance.type] ?? 0,
      used: 0,
      pending: 0,
      carriedOver: carryOver,
      year: newYear,
    };
  });
}

/**
 * Add accrued leave to balances
 */
export function accrueLeaveToBalance(
  balances: LeaveBalance[],
  type: LeaveType,
  amount: number,
  year = new Date().getFullYear()
): LeaveBalance[] {
  const existingIdx = balances.findIndex((b) => b.type === type && b.year === year);

  if (existingIdx >= 0) {
    balances[existingIdx].allocated += amount;
  } else {
    balances.push({
      type,
      allocated: amount,
      used: 0,
      pending: 0,
      carriedOver: 0,
      year,
    });
  }

  return balances;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate difference in days between two dates
 */
function diffInDays(start: Date, end: Date): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Default Export
// ============================================================================

export default {
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
};

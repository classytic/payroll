/**
 * @classytic/payroll - Employee Plugin
 *
 * Mongoose plugin that adds HRM methods and virtuals to Employee schema
 */

import type { Schema, Document } from 'mongoose';
import type {
  EmployeeStatus,
  Compensation,
  TerminationReason,
  Allowance,
  Deduction,
  LeaveBalance,
  LeaveType,
  LeaveInitConfig,
  LeaveSummaryResult,
} from '../types.js';
import { diffInDays } from '../utils/date.js';
import { sumDeductions } from '../utils/calculation.js';
import { isActive, isTerminated } from '../utils/validation.js';
import { CompensationFactory } from '../factories/compensation.factory.js';
import { logger } from '../utils/logger.js';
import {
  getLeaveBalance,
  getLeaveBalances,
  getAvailableDays,
  getLeaveSummary,
  hasLeaveBalance,
  initializeLeaveBalances,
  calculateCarryOver,
  accrueLeaveToBalance,
  DEFAULT_LEAVE_ALLOCATIONS,
  DEFAULT_CARRY_OVER,
} from '../utils/leave.js';

// ============================================================================
// Plugin Options
// ============================================================================

export interface EmployeePluginOptions {
  /** Require bank details for salary payment */
  requireBankDetails?: boolean;
  /** Field name for compensation */
  compensationField?: string;
  /** Field name for status */
  statusField?: string;
  /** Enable auto salary calculation on save */
  autoCalculateSalary?: boolean;
  /** Create indexes on schema (default: false) */
  createIndexes?: boolean;
  /** Enable leave management methods (default: false) */
  enableLeave?: boolean;
  /** Leave configuration */
  leaveConfig?: LeaveInitConfig;
  /** Field name for leave balances (default: 'leaveBalances') */
  leaveBalancesField?: string;
}

// ============================================================================
// Employee Plugin
// ============================================================================

/**
 * Mongoose plugin that adds HRM functionality to Employee schema
 * 
 * @example
 * const employeeSchema = new Schema({
 *   ...employmentFields,
 *   // Custom fields
 * });
 * 
 * employeeSchema.plugin(employeePlugin);
 */
export function employeePlugin(
  schema: Schema,
  options: EmployeePluginOptions = {}
): void {
  const {
    requireBankDetails = false,
    compensationField = 'compensation',
    statusField = 'status',
    autoCalculateSalary = true,
    enableLeave = false,
    leaveConfig = {},
    leaveBalancesField = 'leaveBalances',
  } = options;

  // ========================================
  // Virtuals
  // ========================================

  /**
   * Virtual: Current net salary
   */
  schema.virtual('currentSalary').get(function (this: Document & Record<string, unknown>) {
    const compensation = this[compensationField] as Compensation | undefined;
    return compensation?.netSalary || 0;
  });

  /**
   * Virtual: Is active
   */
  schema.virtual('isActive').get(function (this: Document & Record<string, unknown>) {
    return isActive({ status: this[statusField] as EmployeeStatus });
  });

  /**
   * Virtual: Is terminated
   */
  schema.virtual('isTerminated').get(function (this: Document & Record<string, unknown>) {
    return isTerminated({ status: this[statusField] as EmployeeStatus });
  });

  /**
   * Virtual: Years of service
   */
  schema.virtual('yearsOfService').get(function (this: Document & Record<string, unknown>) {
    const hireDate = this.hireDate as Date | undefined;
    const terminationDate = this.terminationDate as Date | undefined;
    if (!hireDate) return 0;
    
    const end = terminationDate || new Date();
    const days = diffInDays(hireDate, end);
    return Math.max(0, Math.floor((days / 365.25) * 10) / 10);
  });

  /**
   * Virtual: Is on probation
   */
  schema.virtual('isOnProbation').get(function (this: Document & Record<string, unknown>) {
    const probationEndDate = this.probationEndDate as Date | undefined;
    if (!probationEndDate) return false;
    return new Date() < new Date(probationEndDate);
  });

  // ========================================
  // Methods
  // ========================================

  /**
   * Calculate salary breakdown
   */
  schema.methods.calculateSalary = function (this: Document & Record<string, unknown>) {
    const compensation = this[compensationField] as Compensation | undefined;
    if (!compensation) {
      return { gross: 0, deductions: 0, net: 0 };
    }

    const breakdown = CompensationFactory.calculateBreakdown(compensation);

    return {
      gross: breakdown.grossAmount,
      deductions: sumDeductions(
        breakdown.deductions.map((d) => ({ amount: d.calculatedAmount }))
      ),
      net: breakdown.netAmount,
    };
  };

  /**
   * Update salary calculations
   */
  schema.methods.updateSalaryCalculations = function (this: Document & Record<string, unknown>) {
    const compensation = this[compensationField] as Compensation | undefined;
    if (!compensation) return;

    const calculated = (this as unknown as { calculateSalary: () => { gross: number; net: number } }).calculateSalary();
    (this[compensationField] as Compensation).grossSalary = calculated.gross;
    (this[compensationField] as Compensation).netSalary = calculated.net;
    (this[compensationField] as Compensation).lastModified = new Date();
  };

  /**
   * Check if can receive salary
   */
  schema.methods.canReceiveSalary = function (this: Document & Record<string, unknown>): boolean {
    const status = this[statusField] as EmployeeStatus;
    const compensation = this[compensationField] as Compensation | undefined;
    const bankDetails = this.bankDetails as { accountNumber?: string } | undefined;

    return (
      status === 'active' &&
      (compensation?.baseAmount ?? 0) > 0 &&
      (!requireBankDetails || !!bankDetails?.accountNumber)
    );
  };

  /**
   * Add allowance
   */
  schema.methods.addAllowance = function (
    this: Document & Record<string, unknown>,
    type: Allowance['type'],
    amount: number,
    taxable = true
  ) {
    const compensation = this[compensationField] as Compensation;
    if (!compensation.allowances) {
      compensation.allowances = [];
    }
    compensation.allowances.push({
      type,
      name: type,
      amount,
      taxable,
      recurring: true,
      effectiveFrom: new Date(),
    });
    (this as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
  };

  /**
   * Add deduction
   */
  schema.methods.addDeduction = function (
    this: Document & Record<string, unknown>,
    type: Deduction['type'],
    amount: number,
    auto = false,
    description = ''
  ) {
    const compensation = this[compensationField] as Compensation;
    if (!compensation.deductions) {
      compensation.deductions = [];
    }
    compensation.deductions.push({
      type,
      name: type,
      amount,
      auto,
      recurring: true,
      description,
      effectiveFrom: new Date(),
    });
    (this as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
  };

  /**
   * Remove allowance
   */
  schema.methods.removeAllowance = function (
    this: Document & Record<string, unknown>,
    type: Allowance['type']
  ) {
    const compensation = this[compensationField] as Compensation;
    if (!compensation.allowances) return;
    compensation.allowances = compensation.allowances.filter((a) => a.type !== type);
    (this as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
  };

  /**
   * Remove deduction
   */
  schema.methods.removeDeduction = function (
    this: Document & Record<string, unknown>,
    type: Deduction['type']
  ) {
    const compensation = this[compensationField] as Compensation;
    if (!compensation.deductions) return;
    compensation.deductions = compensation.deductions.filter((d) => d.type !== type);
    (this as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
  };

  /**
   * Terminate employee
   */
  schema.methods.terminate = function (
    this: Document & Record<string, unknown>,
    reason: TerminationReason,
    terminationDate = new Date()
  ) {
    const status = this[statusField] as EmployeeStatus;
    if (status === 'terminated') {
      throw new Error('Employee already terminated');
    }

    const compensation = this[compensationField] as Compensation;
    const employmentHistory = (this.employmentHistory as unknown[]) || [];

    employmentHistory.push({
      hireDate: this.hireDate,
      terminationDate,
      reason,
      finalSalary: compensation?.netSalary || 0,
      position: this.position,
      department: this.department,
    });

    this[statusField] = 'terminated';
    this.terminationDate = terminationDate;
    this.employmentHistory = employmentHistory;

    logger.info('Employee terminated', {
      employeeId: this.employeeId,
      organizationId: this.organizationId?.toString(),
      reason,
    });
  };

  /**
   * Re-hire employee
   */
  schema.methods.reHire = function (
    this: Document & Record<string, unknown>,
    hireDate = new Date(),
    position?: string,
    department?: string
  ) {
    const status = this[statusField] as EmployeeStatus;
    if (status !== 'terminated') {
      throw new Error('Can only re-hire terminated employees');
    }

    this[statusField] = 'active';
    this.hireDate = hireDate;
    this.terminationDate = null;

    if (position) this.position = position;
    if (department) this.department = department;

    logger.info('Employee re-hired', {
      employeeId: this.employeeId,
      organizationId: this.organizationId?.toString(),
    });
  };

  // ========================================
  // Hooks
  // ========================================

  /**
   * Pre-save hook to update salary calculations
   * Mongoose v9 compatible - uses async without next callback
   */
  if (autoCalculateSalary) {
    schema.pre('save', async function () {
      if (this.isModified(compensationField)) {
        (this as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
      }
    });
  }

  // ========================================
  // Leave Management (opt-in)
  // ========================================

  if (enableLeave) {
    /**
     * Virtual: Total available leave days across all types
     */
    schema.virtual('availableLeave').get(function (this: Document & Record<string, unknown>) {
      const balances = this[leaveBalancesField] as LeaveBalance[] | undefined;
      if (!balances || !balances.length) return 0;

      const year = new Date().getFullYear();
      return balances
        .filter((b) => b.year === year)
        .reduce(
          (sum, b) =>
            sum + Math.max(0, b.allocated + b.carriedOver - b.used - b.pending),
          0
        );
    });

    /**
     * Virtual: Can take leave (active status and has available balance)
     */
    schema.virtual('canTakeLeave').get(function (this: Document & Record<string, unknown>) {
      const status = this[statusField] as EmployeeStatus;
      return status === 'active' && ((this as any).availableLeave as number) > 0;
    });

    /**
     * Method: Get leave balance for a specific type or all balances
     */
    schema.methods.getLeaveBalance = function (
      this: Document & Record<string, unknown>,
      type?: LeaveType,
      year = new Date().getFullYear()
    ): LeaveBalance | LeaveBalance[] | undefined {
      const employee = { leaveBalances: this[leaveBalancesField] as LeaveBalance[] };
      if (type) {
        return getLeaveBalance(employee, type, year);
      }
      return getLeaveBalances(employee, year);
    };

    /**
     * Method: Get available days for a leave type
     */
    schema.methods.getAvailableLeaveDays = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      year = new Date().getFullYear()
    ): number {
      const employee = { leaveBalances: this[leaveBalancesField] as LeaveBalance[] };
      return getAvailableDays(employee, type, year);
    };

    /**
     * Method: Check if has sufficient leave balance
     */
    schema.methods.hasLeaveBalance = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      days: number,
      year = new Date().getFullYear()
    ): boolean {
      const employee = { leaveBalances: this[leaveBalancesField] as LeaveBalance[] };
      return hasLeaveBalance(employee, type, days, year);
    };

    /**
     * Method: Get comprehensive leave summary
     */
    schema.methods.getLeaveSummary = function (
      this: Document & Record<string, unknown>,
      year = new Date().getFullYear()
    ): LeaveSummaryResult {
      const employee = { leaveBalances: this[leaveBalancesField] as LeaveBalance[] };
      return getLeaveSummary(employee, year);
    };

    /**
     * Method: Initialize leave balances (for new employees)
     */
    schema.methods.initializeLeaveBalances = function (
      this: Document & Record<string, unknown>,
      year = new Date().getFullYear()
    ): void {
      const hireDate = this.hireDate as Date;
      if (!hireDate) {
        throw new Error('Cannot initialize leave balances without hire date');
      }

      const balances = initializeLeaveBalances(hireDate, leaveConfig, year);
      this[leaveBalancesField] = balances;

      logger.debug('Leave balances initialized', {
        employeeId: this.employeeId,
        year,
        balanceCount: balances.length,
      });
    };

    /**
     * Method: Add pending leave (when request is submitted)
     */
    schema.methods.addPendingLeave = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      days: number,
      year = new Date().getFullYear()
    ): void {
      const balances = (this[leaveBalancesField] as LeaveBalance[]) || [];
      const balance = balances.find((b) => b.type === type && b.year === year);

      if (balance) {
        balance.pending += days;
      } else if (type !== 'unpaid') {
        // Create balance entry if doesn't exist (except for unpaid)
        balances.push({
          type,
          allocated: 0,
          used: 0,
          pending: days,
          carriedOver: 0,
          year,
        });
        this[leaveBalancesField] = balances;
      }
    };

    /**
     * Method: Remove pending leave (when request is cancelled/rejected)
     */
    schema.methods.removePendingLeave = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      days: number,
      year = new Date().getFullYear()
    ): void {
      const balances = (this[leaveBalancesField] as LeaveBalance[]) || [];
      const balance = balances.find((b) => b.type === type && b.year === year);

      if (balance) {
        balance.pending = Math.max(0, balance.pending - days);
      }
    };

    /**
     * Method: Use leave (when request is approved)
     */
    schema.methods.useLeave = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      days: number,
      year = new Date().getFullYear()
    ): void {
      const balances = (this[leaveBalancesField] as LeaveBalance[]) || [];
      const balance = balances.find((b) => b.type === type && b.year === year);

      if (balance) {
        balance.pending = Math.max(0, balance.pending - days);
        balance.used += days;
      } else if (type === 'unpaid') {
        // Track unpaid leave even without initial balance
        balances.push({
          type,
          allocated: 0,
          used: days,
          pending: 0,
          carriedOver: 0,
          year,
        });
        this[leaveBalancesField] = balances;
      }

      logger.debug('Leave used', {
        employeeId: this.employeeId,
        type,
        days,
        year,
      });
    };

    /**
     * Method: Restore leave (when approved request is cancelled)
     */
    schema.methods.restoreLeave = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      days: number,
      year = new Date().getFullYear()
    ): void {
      const balances = (this[leaveBalancesField] as LeaveBalance[]) || [];
      const balance = balances.find((b) => b.type === type && b.year === year);

      if (balance) {
        balance.used = Math.max(0, balance.used - days);
      }

      logger.debug('Leave restored', {
        employeeId: this.employeeId,
        type,
        days,
        year,
      });
    };

    /**
     * Method: Accrue leave (add to allocation)
     */
    schema.methods.accrueLeave = function (
      this: Document & Record<string, unknown>,
      type: LeaveType,
      amount: number,
      year = new Date().getFullYear()
    ): void {
      const balances = (this[leaveBalancesField] as LeaveBalance[]) || [];
      accrueLeaveToBalance(balances, type, amount, year);
      this[leaveBalancesField] = balances;

      logger.debug('Leave accrued', {
        employeeId: this.employeeId,
        type,
        amount,
        year,
      });
    };

    /**
     * Method: Process year-end carry-over
     */
    schema.methods.processLeaveCarryOver = function (
      this: Document & Record<string, unknown>,
      fromYear = new Date().getFullYear(),
      maxCarryOver: Partial<Record<LeaveType, number>> = leaveConfig.maxCarryOver || DEFAULT_CARRY_OVER,
      newYearAllocations: Partial<Record<LeaveType, number>> = leaveConfig.defaultAllocations || DEFAULT_LEAVE_ALLOCATIONS
    ): LeaveBalance[] {
      const balances = (this[leaveBalancesField] as LeaveBalance[]) || [];
      const currentYearBalances = balances.filter((b) => b.year === fromYear);
      const newBalances = calculateCarryOver(currentYearBalances, maxCarryOver, newYearAllocations);

      // Add new year balances
      for (const nb of newBalances) {
        const existingIdx = balances.findIndex(
          (b) => b.type === nb.type && b.year === nb.year
        );
        if (existingIdx >= 0) {
          balances[existingIdx] = nb;
        } else {
          balances.push(nb);
        }
      }

      this[leaveBalancesField] = balances;

      logger.info('Leave carry-over processed', {
        employeeId: this.employeeId,
        fromYear,
        toYear: fromYear + 1,
        balancesCreated: newBalances.length,
      });

      return newBalances;
    };

    logger.debug('Leave management enabled for employee plugin');
  }

  // ========================================
  // Indexes (opt-in)
  // ========================================

  if (options.createIndexes) {
    schema.index({ organizationId: 1, employeeId: 1 }, { unique: true });
    schema.index({ userId: 1, organizationId: 1 }, { unique: true });
    schema.index({ organizationId: 1, status: 1 });
    schema.index({ organizationId: 1, department: 1 });
    schema.index({ organizationId: 1, 'compensation.netSalary': -1 });
  }

  logger.debug('Employee plugin applied', {
    requireBankDetails,
    autoCalculateSalary,
    enableLeave,
  });
}

export default employeePlugin;


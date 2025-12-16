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
} from '../types.js';
import { diffInDays } from '../utils/date.js';
import { sumDeductions } from '../utils/calculation.js';
import { isActive, isTerminated } from '../utils/validation.js';
import { CompensationFactory } from '../factories/compensation.factory.js';
import { logger } from '../utils/logger.js';

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
  // Indexes
  // ========================================

  schema.index({ organizationId: 1, employeeId: 1 }, { unique: true });
  schema.index({ userId: 1, organizationId: 1 }, { unique: true });
  schema.index({ organizationId: 1, status: 1 });
  schema.index({ organizationId: 1, department: 1 });
  schema.index({ organizationId: 1, 'compensation.netSalary': -1 });

  logger.debug('Employee plugin applied', {
    requireBankDetails,
    autoCalculateSalary,
  });
}

export default employeePlugin;


import logger from '../utils/logger.js';
import { diffInDays } from '../utils/date.utils.js';
import { sumDeductions } from '../utils/calculation.utils.js';
import {
  isActive,
  isTerminated,
  canReceiveSalary as canReceiveSalaryUtil,
} from '../utils/validation.utils.js';
import { CompensationFactory } from '../factories/compensation.factory.js';

export function employeePlugin(schema, options = {}) {

  schema.virtual('currentSalary').get(function() {
    return this.compensation?.netSalary || 0;
  });

  schema.virtual('isActive').get(function() {
    return isActive(this);
  });

  schema.virtual('isTerminated').get(function() {
    return isTerminated(this);
  });

  schema.virtual('yearsOfService').get(function() {
    const end = this.terminationDate || new Date();
    const days = diffInDays(this.hireDate, end);
    return Math.max(0, Math.floor((days / 365.25) * 10) / 10);
  });

  schema.virtual('isOnProbation').get(function() {
    if (!this.probationEndDate) return false;
    return new Date() < this.probationEndDate;
  });

  schema.methods.calculateSalary = function() {
    if (!this.compensation) {
      return { gross: 0, deductions: 0, net: 0 };
    }

    const breakdown = CompensationFactory.calculateBreakdown(this.compensation);

    return {
      gross: breakdown.grossAmount,
      deductions: sumDeductions(breakdown.deductions),
      net: breakdown.netAmount
    };
  };

  schema.methods.updateSalaryCalculations = function() {
    const calculated = this.calculateSalary();
    this.compensation.grossSalary = calculated.gross;
    this.compensation.netSalary = calculated.net;
    this.compensation.lastModified = new Date();
  };

  schema.methods.canReceiveSalary = function() {
    return (
      this.status === 'active' &&
      this.compensation?.baseAmount > 0 &&
      (!options.requireBankDetails || this.bankDetails?.accountNumber)
    );
  };

  schema.methods.addAllowance = function(type, amount, taxable = true) {
    if (!this.compensation.allowances) {
      this.compensation.allowances = [];
    }
    this.compensation.allowances.push({ type, amount, taxable });
    this.updateSalaryCalculations();
  };

  schema.methods.addDeduction = function(type, amount, auto = false, description = '') {
    if (!this.compensation.deductions) {
      this.compensation.deductions = [];
    }
    this.compensation.deductions.push({ type, amount, auto, description });
    this.updateSalaryCalculations();
  };

  schema.methods.removeAllowance = function(type) {
    if (!this.compensation.allowances) return;
    this.compensation.allowances = this.compensation.allowances.filter(a => a.type !== type);
    this.updateSalaryCalculations();
  };

  schema.methods.removeDeduction = function(type) {
    if (!this.compensation.deductions) return;
    this.compensation.deductions = this.compensation.deductions.filter(d => d.type !== type);
    this.updateSalaryCalculations();
  };

  schema.methods.terminate = function(reason, terminationDate = new Date()) {
    if (this.status === 'terminated') {
      throw new Error('Employee already terminated');
    }

    if (!this.employmentHistory) {
      this.employmentHistory = [];
    }

    this.employmentHistory.push({
      hireDate: this.hireDate,
      terminationDate,
      reason,
      finalSalary: this.compensation?.netSalary || 0,
      position: this.position,
      department: this.department,
    });

    this.status = 'terminated';
    this.terminationDate = terminationDate;

    logger.info('Employee terminated', {
      employeeId: this.employeeId,
      organizationId: this.organizationId,
      reason,
    });
  };

  schema.methods.reHire = function(hireDate = new Date(), position = null, department = null) {
    if (this.status !== 'terminated') {
      throw new Error('Can only re-hire terminated employees');
    }

    this.status = 'active';
    this.hireDate = hireDate;
    this.terminationDate = null;

    if (position) this.position = position;
    if (department) this.department = department;

    logger.info('Employee re-hired', {
      employeeId: this.employeeId,
      organizationId: this.organizationId,
    });
  };

  /**
   * Pre-save hook to automatically update salary calculations
   * when compensation is modified.
   *
   * Mongoose v9 compatible - uses async function without next callback
   * - Use throw instead of next(err) for errors
   * - Use return instead of return next()
   */
  schema.pre('save', async function() {
    if (this.isModified('compensation')) {
      this.updateSalaryCalculations();
    }
  });

  schema.index({ organizationId: 1, employeeId: 1 }, { unique: true });
  schema.index({ userId: 1, organizationId: 1 }, { unique: true });
  schema.index({ organizationId: 1, status: 1 });
  schema.index({ organizationId: 1, department: 1 });
  schema.index({ organizationId: 1, 'compensation.netSalary': -1 });

  logger.debug('Employee plugin applied', {
    requireBankDetails: options.requireBankDetails || false,
  });
}

export default employeePlugin;

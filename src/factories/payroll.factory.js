/**
 * Payroll Factory - Beautiful Salary Calculation & Record Creation
 * Clean, testable, immutable payroll object creation
 *
 * Compatible with Mongoose v8 and v9
 */

import {
  calculateGross,
  calculateNet,
  createAllowanceCalculator,
  createDeductionCalculator,
} from '../utils/calculation.utils.js';

import { getPayPeriod } from '../utils/date.utils.js';

/**
 * @typedef {Object} AllowanceInput
 * @property {string} type - Type of allowance
 * @property {string} [name] - Display name for the allowance
 * @property {number} value - Allowance value (amount or percentage)
 * @property {boolean} [isPercentage=false] - Whether value is a percentage
 */

/**
 * @typedef {Object} DeductionInput
 * @property {string} type - Type of deduction
 * @property {string} [name] - Display name for the deduction
 * @property {number} value - Deduction value (amount or percentage)
 * @property {boolean} [isPercentage=false] - Whether value is a percentage
 */

/**
 * @typedef {Object} PeriodInput
 * @property {number} [month] - Month (1-12)
 * @property {number} [year] - Year
 */

/**
 * @typedef {Object} PayrollMetadata
 * @property {string} [currency='BDT'] - Currency code
 * @property {string} [paymentMethod] - Payment method
 * @property {string} [notes] - Additional notes
 */

/**
 * @typedef {Object} PayrollRecord
 * @property {string} employeeId - Employee identifier
 * @property {string} organizationId - Organization identifier
 * @property {Object} period - Pay period information
 * @property {Object} breakdown - Salary breakdown
 * @property {number} breakdown.baseAmount - Base salary amount
 * @property {Array} breakdown.allowances - Calculated allowances
 * @property {Array} breakdown.deductions - Calculated deductions
 * @property {number} breakdown.grossSalary - Gross salary
 * @property {number} breakdown.netSalary - Net salary after deductions
 * @property {string} status - Payroll status ('pending', 'processed', 'paid')
 * @property {Date|null} processedAt - When payroll was processed
 * @property {Date|null} paidAt - When payment was made
 * @property {PayrollMetadata} metadata - Additional metadata
 */

export class PayrollFactory {
  /**
   * Create a new payroll record
   *
   * @param {Object} params - Payroll parameters
   * @param {string} params.employeeId - Employee ID
   * @param {string} params.organizationId - Organization ID
   * @param {number} params.baseAmount - Base salary amount
   * @param {AllowanceInput[]} [params.allowances=[]] - Allowances array
   * @param {DeductionInput[]} [params.deductions=[]] - Deductions array
   * @param {PeriodInput} [params.period={}] - Pay period
   * @param {PayrollMetadata} [params.metadata={}] - Additional metadata
   * @returns {PayrollRecord} Payroll record object
   */
  static create({
    employeeId,
    organizationId,
    baseAmount,
    allowances = [],
    deductions = [],
    period = {},
    metadata = {},
  }) {
    const calculatedAllowances = this.calculateAllowances(baseAmount, allowances);
    const calculatedDeductions = this.calculateDeductions(baseAmount, deductions);

    const gross = calculateGross(baseAmount, calculatedAllowances);
    const net = calculateNet(gross, calculatedDeductions);

    return {
      employeeId,
      organizationId,
      period: this.createPeriod(period),
      breakdown: {
        baseAmount,
        allowances: calculatedAllowances,
        deductions: calculatedDeductions,
        grossSalary: gross,
        netSalary: net,
      },
      status: 'pending',
      processedAt: null,
      paidAt: null,
      metadata: {
        currency: metadata.currency || 'BDT',
        paymentMethod: metadata.paymentMethod,
        notes: metadata.notes,
      },
    };
  }

  /**
   * Create a pay period object
   *
   * @param {PeriodInput} [params={}] - Period parameters
   * @param {number} [params.month] - Month (defaults to current month)
   * @param {number} [params.year] - Year (defaults to current year)
   * @returns {Object} Pay period object with startDate, endDate, etc.
   */
  static createPeriod({ month, year } = {}) {
    const now = new Date();
    return getPayPeriod(
      month || now.getMonth() + 1,
      year || now.getFullYear()
    );
  }

  /**
   * Calculate allowances from base amount and allowance inputs
   *
   * @param {number} baseAmount - Base salary amount
   * @param {AllowanceInput[]} allowances - Array of allowances
   * @returns {Array} Calculated allowances with amounts
   */
  static calculateAllowances(baseAmount, allowances) {
    return allowances.map((allowance) => {
      const amount = allowance.isPercentage
        ? (baseAmount * allowance.value) / 100
        : allowance.value;

      return {
        type: allowance.type,
        name: allowance.name || allowance.type,
        amount,
        isPercentage: allowance.isPercentage || false,
        value: allowance.value,
      };
    });
  }

  /**
   * Calculate deductions from base amount and deduction inputs
   *
   * @param {number} baseAmount - Base salary amount
   * @param {DeductionInput[]} deductions - Array of deductions
   * @returns {Array} Calculated deductions with amounts
   */
  static calculateDeductions(baseAmount, deductions) {
    return deductions.map((deduction) => {
      const amount = deduction.isPercentage
        ? (baseAmount * deduction.value) / 100
        : deduction.value;

      return {
        type: deduction.type,
        name: deduction.name || deduction.type,
        amount,
        isPercentage: deduction.isPercentage || false,
        value: deduction.value,
      };
    });
  }

  /**
   * Create a bonus object
   *
   * @param {Object} params - Bonus parameters
   * @param {string} params.type - Bonus type
   * @param {number} params.amount - Bonus amount
   * @param {string} params.reason - Reason for bonus
   * @param {string} params.approvedBy - User who approved the bonus
   * @returns {Object} Bonus object
   */
  static createBonus({ type, amount, reason, approvedBy }) {
    return {
      type,
      amount,
      reason,
      approvedBy,
      approvedAt: new Date(),
    };
  }

  /**
   * Create a deduction object
   *
   * @param {Object} params - Deduction parameters
   * @param {string} params.type - Deduction type
   * @param {number} params.amount - Deduction amount
   * @param {string} params.reason - Reason for deduction
   * @param {string} params.appliedBy - User who applied the deduction
   * @returns {Object} Deduction object
   */
  static createDeduction({ type, amount, reason, appliedBy }) {
    return {
      type,
      amount,
      reason,
      appliedBy,
      appliedAt: new Date(),
    };
  }

  /**
   * Mark a payroll record as paid (immutable - returns new object)
   *
   * @param {PayrollRecord} payroll - Payroll record to mark as paid
   * @param {Object} [params={}] - Payment details
   * @param {Date} [params.paidAt] - Payment date (defaults to now)
   * @param {string} [params.transactionId] - Transaction ID
   * @param {string} [params.paymentMethod] - Payment method
   * @returns {PayrollRecord} New payroll record marked as paid
   */
  static markAsPaid(payroll, { paidAt = new Date(), transactionId, paymentMethod } = {}) {
    return {
      ...payroll,
      status: 'paid',
      paidAt,
      processedAt: payroll.processedAt || paidAt,
      metadata: {
        ...payroll.metadata,
        transactionId,
        paymentMethod: paymentMethod || payroll.metadata.paymentMethod,
      },
    };
  }

  /**
   * Mark a payroll record as processed (immutable - returns new object)
   *
   * @param {PayrollRecord} payroll - Payroll record to mark as processed
   * @param {Object} [params={}] - Processing details
   * @param {Date} [params.processedAt] - Processing date (defaults to now)
   * @returns {PayrollRecord} New payroll record marked as processed
   */
  static markAsProcessed(payroll, { processedAt = new Date() } = {}) {
    return {
      ...payroll,
      status: 'processed',
      processedAt,
    };
  }
}

/**
 * PayrollBuilder - Fluent builder pattern for creating payroll records
 *
 * @example
 * const payroll = createPayroll()
 *   .forEmployee('emp-123')
 *   .inOrganization('org-456')
 *   .withBaseAmount(50000)
 *   .addAllowance('housing', 10000)
 *   .addDeduction('tax', 15, true)
 *   .build();
 */
export class PayrollBuilder {
  constructor() {
    this.data = {
      allowances: [],
      deductions: [],
      period: {},
      metadata: {},
    };
  }

  forEmployee(employeeId) {
    this.data.employeeId = employeeId;
    return this;
  }

  inOrganization(organizationId) {
    this.data.organizationId = organizationId;
    return this;
  }

  withBaseAmount(amount) {
    this.data.baseAmount = amount;
    return this;
  }

  forPeriod(month, year) {
    this.data.period = { month, year };
    return this;
  }

  addAllowance(type, value, isPercentage = false, name = null) {
    this.data.allowances.push({ type, value, isPercentage, name });
    return this;
  }

  addDeduction(type, value, isPercentage = false, name = null) {
    this.data.deductions.push({ type, value, isPercentage, name });
    return this;
  }

  addBonus(amount, reason, approvedBy) {
    this.data.allowances.push({
      type: 'bonus',
      value: amount,
      isPercentage: false,
      name: reason,
    });
    return this;
  }

  withCurrency(currency) {
    this.data.metadata.currency = currency;
    return this;
  }

  withPaymentMethod(method) {
    this.data.metadata.paymentMethod = method;
    return this;
  }

  withNotes(notes) {
    this.data.metadata.notes = notes;
    return this;
  }

  build() {
    return PayrollFactory.create(this.data);
  }
}

/**
 * Create a new PayrollBuilder instance
 *
 * @returns {PayrollBuilder} New builder instance
 */
export const createPayroll = () => new PayrollBuilder();

/**
 * BatchPayrollFactory - Process payroll for multiple employees at once
 *
 * @example
 * const payrolls = BatchPayrollFactory.createBatch(employees, {
 *   month: 1,
 *   year: 2025,
 *   organizationId: 'org-123'
 * });
 */
export class BatchPayrollFactory {
  /**
   * Create payroll records for multiple employees
   *
   * @param {Array} employees - Array of employee objects
   * @param {Object} params - Batch parameters
   * @param {number} params.month - Month for payroll
   * @param {number} params.year - Year for payroll
   * @param {string} params.organizationId - Organization ID
   * @returns {PayrollRecord[]} Array of payroll records
   */
  static createBatch(employees, { month, year, organizationId }) {
    return employees.map((employee) =>
      PayrollFactory.create({
        employeeId: employee._id || employee.userId,
        organizationId: organizationId || employee.organizationId,
        baseAmount: employee.compensation.baseAmount,
        allowances: employee.compensation.allowances || [],
        deductions: employee.compensation.deductions || [],
        period: { month, year },
      })
    );
  }

  /**
   * Calculate total payroll amounts across multiple records
   *
   * @param {PayrollRecord[]} payrolls - Array of payroll records
   * @returns {Object} Totals summary
   * @returns {number} return.count - Total number of payrolls
   * @returns {number} return.totalGross - Sum of gross salaries
   * @returns {number} return.totalNet - Sum of net salaries
   * @returns {number} return.totalAllowances - Sum of all allowances
   * @returns {number} return.totalDeductions - Sum of all deductions
   */
  static calculateTotalPayroll(payrolls) {
    return payrolls.reduce(
      (totals, payroll) => ({
        count: totals.count + 1,
        totalGross: totals.totalGross + payroll.breakdown.grossSalary,
        totalNet: totals.totalNet + payroll.breakdown.netSalary,
        totalAllowances:
          totals.totalAllowances +
          payroll.breakdown.allowances.reduce((sum, a) => sum + a.amount, 0),
        totalDeductions:
          totals.totalDeductions +
          payroll.breakdown.deductions.reduce((sum, d) => sum + d.amount, 0),
      }),
      {
        count: 0,
        totalGross: 0,
        totalNet: 0,
        totalAllowances: 0,
        totalDeductions: 0,
      }
    );
  }
}

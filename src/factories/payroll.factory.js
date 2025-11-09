/**
 * Payroll Factory - Beautiful Salary Calculation & Record Creation
 * Clean, testable, immutable payroll object creation
 */

import {
  calculateGross,
  calculateNet,
  createAllowanceCalculator,
  createDeductionCalculator,
} from '../utils/calculation.utils.js';

import { getPayPeriod } from '../utils/date.utils.js';

export class PayrollFactory {
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

  static createPeriod({ month, year } = {}) {
    const now = new Date();
    return getPayPeriod(
      month || now.getMonth() + 1,
      year || now.getFullYear()
    );
  }

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

  static createBonus({ type, amount, reason, approvedBy }) {
    return {
      type,
      amount,
      reason,
      approvedBy,
      approvedAt: new Date(),
    };
  }

  static createDeduction({ type, amount, reason, appliedBy }) {
    return {
      type,
      amount,
      reason,
      appliedBy,
      appliedAt: new Date(),
    };
  }

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

  static markAsProcessed(payroll, { processedAt = new Date() } = {}) {
    return {
      ...payroll,
      status: 'processed',
      processedAt,
    };
  }
}

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

export const createPayroll = () => new PayrollBuilder();

/**
 * Batch Payroll Factory - Process multiple employees
 */
export class BatchPayrollFactory {
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

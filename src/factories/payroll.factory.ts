/**
 * @classytic/payroll - Payroll Factory
 *
 * Clean object creation for payroll records
 * Immutable operations and builder pattern
 */

import type {
  ObjectIdLike,
  PayrollBreakdown,
  PayrollPeriod,
  PaymentMethod,
  Allowance,
  Deduction,
  Compensation,
} from '../types.js';
import { getPayPeriod } from '../utils/date.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions } from '../utils/calculation.js';
import { HRM_CONFIG } from '../config.js';

// ============================================================================
// Payroll Factory Types
// ============================================================================

export interface CreatePayrollParams {
  employeeId: ObjectIdLike;
  organizationId: ObjectIdLike;
  baseAmount: number;
  allowances?: Array<{ type: string; amount: number; taxable?: boolean }>;
  deductions?: Array<{ type: string; amount: number; description?: string }>;
  period?: { month?: number; year?: number };
  metadata?: {
    currency?: string;
    paymentMethod?: PaymentMethod;
    notes?: string;
  };
}

export interface PayrollData {
  employeeId: ObjectIdLike;
  organizationId: ObjectIdLike;
  period: PayrollPeriod;
  breakdown: PayrollBreakdown;
  status: 'pending';
  processedAt: null;
  paidAt: null;
  metadata: {
    currency: string;
    paymentMethod?: PaymentMethod;
    notes?: string;
  };
}

// ============================================================================
// Payroll Factory
// ============================================================================

export class PayrollFactory {
  /**
   * Create payroll data object
   */
  static create(params: CreatePayrollParams): PayrollData {
    const {
      employeeId,
      organizationId,
      baseAmount,
      allowances = [],
      deductions = [],
      period = {},
      metadata = {},
    } = params;

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
        currency: metadata.currency || HRM_CONFIG.payroll.defaultCurrency,
        paymentMethod: metadata.paymentMethod,
        notes: metadata.notes,
      },
    };
  }

  /**
   * Create pay period
   */
  static createPeriod(params: { month?: number; year?: number; payDate?: Date }): PayrollPeriod {
    const now = new Date();
    const month = params.month || now.getMonth() + 1;
    const year = params.year || now.getFullYear();
    const period = getPayPeriod(month, year);

    return {
      ...period,
      payDate: params.payDate || new Date(),
    };
  }

  /**
   * Calculate allowances from base amount
   */
  static calculateAllowances(
    baseAmount: number,
    allowances: Array<{ type: string; amount: number; taxable?: boolean; isPercentage?: boolean; value?: number }>
  ): Array<{ type: string; amount: number; taxable: boolean }> {
    return allowances.map((allowance) => {
      const amount =
        allowance.isPercentage && allowance.value !== undefined
          ? Math.round((baseAmount * allowance.value) / 100)
          : allowance.amount;

      return {
        type: allowance.type,
        amount,
        taxable: allowance.taxable ?? true,
      };
    });
  }

  /**
   * Calculate deductions from base amount
   */
  static calculateDeductions(
    baseAmount: number,
    deductions: Array<{ type: string; amount: number; description?: string; isPercentage?: boolean; value?: number }>
  ): Array<{ type: string; amount: number; description?: string }> {
    return deductions.map((deduction) => {
      const amount =
        deduction.isPercentage && deduction.value !== undefined
          ? Math.round((baseAmount * deduction.value) / 100)
          : deduction.amount;

      return {
        type: deduction.type,
        amount,
        description: deduction.description,
      };
    });
  }

  /**
   * Create bonus object
   */
  static createBonus(params: {
    type: string;
    amount: number;
    reason: string;
    approvedBy?: ObjectIdLike;
  }): { type: string; amount: number; reason: string; approvedBy?: ObjectIdLike; approvedAt: Date } {
    return {
      type: params.type,
      amount: params.amount,
      reason: params.reason,
      approvedBy: params.approvedBy,
      approvedAt: new Date(),
    };
  }

  /**
   * Mark payroll as paid (immutable)
   * Sets both top-level transactionId and metadata for compatibility
   */
  static markAsPaid<T extends { status: string; paidAt?: Date | null; processedAt?: Date | null; transactionId?: unknown; metadata?: Record<string, unknown> }>(
    payroll: T,
    params: { paidAt?: Date; transactionId?: ObjectIdLike; paymentMethod?: PaymentMethod } = {}
  ): T & { status: 'paid' } {
    return {
      ...payroll,
      status: 'paid' as const,
      paidAt: params.paidAt || new Date(),
      processedAt: payroll.processedAt || params.paidAt || new Date(),
      transactionId: params.transactionId || payroll.transactionId,
      metadata: {
        ...payroll.metadata,
        transactionId: params.transactionId,
        paymentMethod: params.paymentMethod || payroll.metadata?.paymentMethod,
      },
    };
  }

  /**
   * Mark payroll as processed (immutable)
   */
  static markAsProcessed<T extends { status: string; processedAt: Date | null }>(
    payroll: T,
    params: { processedAt?: Date } = {}
  ): T & { status: 'processing' } {
    return {
      ...payroll,
      status: 'processing' as const,
      processedAt: params.processedAt || new Date(),
    };
  }
}

// ============================================================================
// Payroll Builder
// ============================================================================

export class PayrollBuilder {
  private data: Partial<CreatePayrollParams> = {
    allowances: [],
    deductions: [],
    period: {},
    metadata: {},
  };

  /**
   * Set employee ID
   */
  forEmployee(employeeId: ObjectIdLike): this {
    this.data.employeeId = employeeId;
    return this;
  }

  /**
   * Set organization ID
   */
  inOrganization(organizationId: ObjectIdLike): this {
    this.data.organizationId = organizationId;
    return this;
  }

  /**
   * Set base amount
   */
  withBaseAmount(amount: number): this {
    this.data.baseAmount = amount;
    return this;
  }

  /**
   * Set pay period
   */
  forPeriod(month: number, year: number): this {
    this.data.period = { month, year };
    return this;
  }

  /**
   * Add allowance
   */
  addAllowance(
    type: string,
    value: number,
    isPercentage = false,
    name?: string
  ): this {
    this.data.allowances = [
      ...(this.data.allowances || []),
      {
        type,
        amount: isPercentage ? 0 : value,
        isPercentage,
        value: isPercentage ? value : undefined,
      } as { type: string; amount: number },
    ];
    return this;
  }

  /**
   * Add deduction
   */
  addDeduction(
    type: string,
    value: number,
    isPercentage = false,
    description?: string
  ): this {
    this.data.deductions = [
      ...(this.data.deductions || []),
      {
        type,
        amount: isPercentage ? 0 : value,
        isPercentage,
        value: isPercentage ? value : undefined,
        description,
      } as { type: string; amount: number; description?: string },
    ];
    return this;
  }

  /**
   * Add bonus
   */
  addBonus(amount: number, reason: string): this {
    return this.addAllowance('bonus', amount, false, reason);
  }

  /**
   * Set currency
   */
  withCurrency(currency: string): this {
    this.data.metadata = { ...this.data.metadata, currency };
    return this;
  }

  /**
   * Set payment method
   */
  withPaymentMethod(method: PaymentMethod): this {
    this.data.metadata = { ...this.data.metadata, paymentMethod: method };
    return this;
  }

  /**
   * Set notes
   */
  withNotes(notes: string): this {
    this.data.metadata = { ...this.data.metadata, notes };
    return this;
  }

  /**
   * Build payroll data
   */
  build(): PayrollData {
    if (!this.data.employeeId || !this.data.organizationId) {
      throw new Error('employeeId and organizationId are required');
    }
    if (!this.data.baseAmount) {
      throw new Error('baseAmount is required');
    }

    return PayrollFactory.create(this.data as CreatePayrollParams);
  }
}

// ============================================================================
// Batch Payroll Factory
// ============================================================================

export class BatchPayrollFactory {
  /**
   * Create payroll records for multiple employees
   */
  static createBatch(
    employees: Array<{
      _id: ObjectIdLike;
      organizationId: ObjectIdLike;
      compensation: Compensation;
    }>,
    params: { month: number; year: number; organizationId?: ObjectIdLike }
  ): PayrollData[] {
    return employees.map((employee) =>
      PayrollFactory.create({
        employeeId: employee._id,
        organizationId: params.organizationId || employee.organizationId,
        baseAmount: employee.compensation.baseAmount,
        allowances: employee.compensation.allowances || [],
        deductions: employee.compensation.deductions || [],
        period: { month: params.month, year: params.year },
        metadata: { currency: employee.compensation.currency },
      })
    );
  }

  /**
   * Calculate total payroll amounts
   */
  static calculateTotalPayroll(payrolls: Array<{ breakdown: PayrollBreakdown }>): {
    count: number;
    totalGross: number;
    totalNet: number;
    totalAllowances: number;
    totalDeductions: number;
  } {
    return payrolls.reduce(
      (totals, payroll) => ({
        count: totals.count + 1,
        totalGross: totals.totalGross + payroll.breakdown.grossSalary,
        totalNet: totals.totalNet + payroll.breakdown.netSalary,
        totalAllowances: totals.totalAllowances + sumAllowances(payroll.breakdown.allowances),
        totalDeductions: totals.totalDeductions + sumDeductions(payroll.breakdown.deductions),
      }),
      { count: 0, totalGross: 0, totalNet: 0, totalAllowances: 0, totalDeductions: 0 }
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create new payroll builder
 */
export function createPayroll(): PayrollBuilder {
  return new PayrollBuilder();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  PayrollFactory,
  PayrollBuilder,
  BatchPayrollFactory,
  createPayroll,
};


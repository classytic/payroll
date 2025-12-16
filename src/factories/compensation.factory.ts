/**
 * @classytic/payroll - Compensation Factory
 *
 * Clean compensation structure creation
 * Presets for common compensation packages
 */

import type {
  Compensation,
  Allowance,
  Deduction,
  PaymentFrequency,
  CompensationBreakdownResult,
} from '../types.js';
import { calculateGross, calculateNet, applyPercentage } from '../utils/calculation.js';
import { HRM_CONFIG } from '../config.js';

// ============================================================================
// Compensation Factory Types
// ============================================================================

export interface CreateCompensationParams {
  baseAmount: number;
  frequency?: PaymentFrequency;
  currency?: string;
  allowances?: Array<{
    type: Allowance['type'];
    value: number;
    isPercentage?: boolean;
    name?: string;
    taxable?: boolean;
  }>;
  deductions?: Array<{
    type: Deduction['type'];
    value: number;
    isPercentage?: boolean;
    name?: string;
    auto?: boolean;
  }>;
  effectiveFrom?: Date;
}

// ============================================================================
// Compensation Factory
// ============================================================================

export class CompensationFactory {
  /**
   * Create compensation object
   */
  static create(params: CreateCompensationParams): Compensation {
    const {
      baseAmount,
      frequency = 'monthly',
      currency = HRM_CONFIG.payroll.defaultCurrency,
      allowances = [],
      deductions = [],
      effectiveFrom = new Date(),
    } = params;

    return {
      baseAmount,
      frequency,
      currency,
      allowances: allowances.map((a) => this.createAllowance(a, baseAmount)),
      deductions: deductions.map((d) => this.createDeduction(d, baseAmount)),
      effectiveFrom,
      lastModified: new Date(),
    };
  }

  /**
   * Create allowance
   */
  static createAllowance(
    params: {
      type: Allowance['type'];
      value: number;
      isPercentage?: boolean;
      name?: string;
      taxable?: boolean;
    },
    baseAmount?: number
  ): Allowance {
    const amount = params.isPercentage && baseAmount
      ? applyPercentage(baseAmount, params.value)
      : params.value;

    return {
      type: params.type,
      name: params.name || params.type,
      amount,
      isPercentage: params.isPercentage ?? false,
      value: params.isPercentage ? params.value : undefined,
      taxable: params.taxable ?? true,
      recurring: true,
      effectiveFrom: new Date(),
    };
  }

  /**
   * Create deduction
   */
  static createDeduction(
    params: {
      type: Deduction['type'];
      value: number;
      isPercentage?: boolean;
      name?: string;
      auto?: boolean;
    },
    baseAmount?: number
  ): Deduction {
    const amount = params.isPercentage && baseAmount
      ? applyPercentage(baseAmount, params.value)
      : params.value;

    return {
      type: params.type,
      name: params.name || params.type,
      amount,
      isPercentage: params.isPercentage ?? false,
      value: params.isPercentage ? params.value : undefined,
      auto: params.auto ?? false,
      recurring: true,
      effectiveFrom: new Date(),
    };
  }

  /**
   * Update base amount (immutable)
   */
  static updateBaseAmount(
    compensation: Compensation,
    newAmount: number,
    effectiveFrom = new Date()
  ): Compensation {
    return {
      ...compensation,
      baseAmount: newAmount,
      lastModified: effectiveFrom,
    };
  }

  /**
   * Add allowance (immutable)
   */
  static addAllowance(
    compensation: Compensation,
    allowance: Parameters<typeof this.createAllowance>[0]
  ): Compensation {
    return {
      ...compensation,
      allowances: [
        ...compensation.allowances,
        this.createAllowance(allowance, compensation.baseAmount),
      ],
      lastModified: new Date(),
    };
  }

  /**
   * Remove allowance (immutable)
   */
  static removeAllowance(
    compensation: Compensation,
    allowanceType: Allowance['type']
  ): Compensation {
    return {
      ...compensation,
      allowances: compensation.allowances.filter((a) => a.type !== allowanceType),
      lastModified: new Date(),
    };
  }

  /**
   * Add deduction (immutable)
   */
  static addDeduction(
    compensation: Compensation,
    deduction: Parameters<typeof this.createDeduction>[0]
  ): Compensation {
    return {
      ...compensation,
      deductions: [
        ...compensation.deductions,
        this.createDeduction(deduction, compensation.baseAmount),
      ],
      lastModified: new Date(),
    };
  }

  /**
   * Remove deduction (immutable)
   */
  static removeDeduction(
    compensation: Compensation,
    deductionType: Deduction['type']
  ): Compensation {
    return {
      ...compensation,
      deductions: compensation.deductions.filter((d) => d.type !== deductionType),
      lastModified: new Date(),
    };
  }

  /**
   * Calculate compensation breakdown
   */
  static calculateBreakdown(compensation: Compensation): CompensationBreakdownResult {
    const { baseAmount, allowances, deductions } = compensation;

    // Calculate actual amounts for percentage-based items
    const calculatedAllowances = allowances.map((a) => ({
      ...a,
      calculatedAmount: a.isPercentage && a.value !== undefined
        ? applyPercentage(baseAmount, a.value)
        : a.amount,
    }));

    const calculatedDeductions = deductions.map((d) => ({
      ...d,
      calculatedAmount: d.isPercentage && d.value !== undefined
        ? applyPercentage(baseAmount, d.value)
        : d.amount,
    }));

    const grossAmount = calculateGross(
      baseAmount,
      calculatedAllowances.map((a) => ({ amount: a.calculatedAmount }))
    );
    const netAmount = calculateNet(
      grossAmount,
      calculatedDeductions.map((d) => ({ amount: d.calculatedAmount }))
    );

    return {
      baseAmount,
      allowances: calculatedAllowances,
      deductions: calculatedDeductions,
      grossAmount,
      netAmount: Math.max(0, netAmount),
    };
  }

  /**
   * Apply salary increment (immutable)
   */
  static applyIncrement(
    compensation: Compensation,
    params: { percentage?: number; amount?: number; effectiveFrom?: Date }
  ): Compensation {
    const newBaseAmount = params.amount
      ? compensation.baseAmount + params.amount
      : compensation.baseAmount * (1 + (params.percentage || 0) / 100);

    return this.updateBaseAmount(
      compensation,
      Math.round(newBaseAmount),
      params.effectiveFrom
    );
  }
}

// ============================================================================
// Compensation Builder
// ============================================================================

export class CompensationBuilder {
  private data: CreateCompensationParams = {
    baseAmount: 0,
    frequency: 'monthly',
    currency: HRM_CONFIG.payroll.defaultCurrency,
    allowances: [],
    deductions: [],
  };

  /**
   * Set base amount
   */
  withBase(
    amount: number,
    frequency: PaymentFrequency = 'monthly',
    currency = HRM_CONFIG.payroll.defaultCurrency
  ): this {
    this.data.baseAmount = amount;
    this.data.frequency = frequency;
    this.data.currency = currency;
    return this;
  }

  /**
   * Add allowance
   */
  addAllowance(
    type: Allowance['type'],
    value: number,
    isPercentage = false,
    name?: string
  ): this {
    this.data.allowances = [
      ...(this.data.allowances || []),
      { type, value, isPercentage, name },
    ];
    return this;
  }

  /**
   * Add deduction
   */
  addDeduction(
    type: Deduction['type'],
    value: number,
    isPercentage = false,
    name?: string
  ): this {
    this.data.deductions = [
      ...(this.data.deductions || []),
      { type, value, isPercentage, name },
    ];
    return this;
  }

  /**
   * Set effective date
   */
  effectiveFrom(date: Date): this {
    this.data.effectiveFrom = date;
    return this;
  }

  /**
   * Build compensation
   */
  build(): Compensation {
    if (!this.data.baseAmount) {
      throw new Error('baseAmount is required');
    }
    return CompensationFactory.create(this.data);
  }
}

// ============================================================================
// Compensation Presets
// ============================================================================

export const CompensationPresets = {
  /**
   * Basic compensation (base only)
   */
  basic(baseAmount: number): Compensation {
    return new CompensationBuilder()
      .withBase(baseAmount)
      .build();
  },

  /**
   * With house rent allowance
   */
  withHouseRent(baseAmount: number, rentPercentage = 50): Compensation {
    return new CompensationBuilder()
      .withBase(baseAmount)
      .addAllowance('housing', rentPercentage, true, 'House Rent')
      .build();
  },

  /**
   * With medical allowance
   */
  withMedical(baseAmount: number, medicalPercentage = 10): Compensation {
    return new CompensationBuilder()
      .withBase(baseAmount)
      .addAllowance('medical', medicalPercentage, true, 'Medical Allowance')
      .build();
  },

  /**
   * Standard package (house rent + medical + transport)
   */
  standard(baseAmount: number): Compensation {
    return new CompensationBuilder()
      .withBase(baseAmount)
      .addAllowance('housing', 50, true, 'House Rent')
      .addAllowance('medical', 10, true, 'Medical Allowance')
      .addAllowance('transport', 5, true, 'Transport Allowance')
      .build();
  },

  /**
   * With provident fund
   */
  withProvidentFund(baseAmount: number, pfPercentage = 10): Compensation {
    return new CompensationBuilder()
      .withBase(baseAmount)
      .addAllowance('housing', 50, true, 'House Rent')
      .addAllowance('medical', 10, true, 'Medical Allowance')
      .addDeduction('provident_fund', pfPercentage, true, 'Provident Fund')
      .build();
  },

  /**
   * Executive package
   */
  executive(baseAmount: number): Compensation {
    return new CompensationBuilder()
      .withBase(baseAmount)
      .addAllowance('housing', 60, true, 'House Rent')
      .addAllowance('medical', 15, true, 'Medical Allowance')
      .addAllowance('transport', 10, true, 'Transport Allowance')
      .addAllowance('mobile', 5, true, 'Mobile Allowance')
      .addDeduction('provident_fund', 10, true, 'Provident Fund')
      .build();
  },
};

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create new compensation builder
 */
export function createCompensation(): CompensationBuilder {
  return new CompensationBuilder();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  CompensationFactory,
  CompensationBuilder,
  CompensationPresets,
  createCompensation,
};


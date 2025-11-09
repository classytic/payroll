/**
 * Compensation Factory - Clean Compensation Structure Creation
 * Beautiful, testable compensation management
 */

import { calculateGross, calculateNet } from '../utils/calculation.utils.js';

export class CompensationFactory {
  static create({
    baseAmount,
    frequency = 'monthly',
    currency = 'BDT',
    allowances = [],
    deductions = [],
    effectiveFrom = new Date(),
  }) {
    return {
      baseAmount,
      frequency,
      currency,
      allowances: allowances.map(this.createAllowance),
      deductions: deductions.map(this.createDeduction),
      effectiveFrom,
      lastUpdated: new Date(),
    };
  }

  static createAllowance({ type, name, value, isPercentage = false }) {
    return {
      type,
      name: name || type,
      value,
      isPercentage,
    };
  }

  static createDeduction({ type, name, value, isPercentage = false }) {
    return {
      type,
      name: name || type,
      value,
      isPercentage,
    };
  }

  static updateBaseAmount(compensation, newAmount, effectiveFrom = new Date()) {
    return {
      ...compensation,
      baseAmount: newAmount,
      lastUpdated: effectiveFrom,
    };
  }

  static addAllowance(compensation, allowance) {
    return {
      ...compensation,
      allowances: [...compensation.allowances, this.createAllowance(allowance)],
      lastUpdated: new Date(),
    };
  }

  static removeAllowance(compensation, allowanceType) {
    return {
      ...compensation,
      allowances: compensation.allowances.filter((a) => a.type !== allowanceType),
      lastUpdated: new Date(),
    };
  }

  static addDeduction(compensation, deduction) {
    return {
      ...compensation,
      deductions: [...compensation.deductions, this.createDeduction(deduction)],
      lastUpdated: new Date(),
    };
  }

  static removeDeduction(compensation, deductionType) {
    return {
      ...compensation,
      deductions: compensation.deductions.filter((d) => d.type !== deductionType),
      lastUpdated: new Date(),
    };
  }

  static calculateBreakdown(compensation) {
    const { baseAmount, allowances, deductions } = compensation;

    const calculatedAllowances = allowances.map((a) => ({
      ...a,
      amount: a.isPercentage ? (baseAmount * a.value) / 100 : a.value,
    }));

    const calculatedDeductions = deductions.map((d) => ({
      ...d,
      amount: d.isPercentage ? (baseAmount * d.value) / 100 : d.value,
    }));

    const gross = calculateGross(baseAmount, calculatedAllowances);
    const net = calculateNet(gross, calculatedDeductions);

    return {
      baseAmount,
      allowances: calculatedAllowances,
      deductions: calculatedDeductions,
      grossAmount: gross,
      netAmount: net,
    };
  }

  static applyIncrement(compensation, { percentage, amount, effectiveFrom = new Date() }) {
    const newBaseAmount = amount
      ? compensation.baseAmount + amount
      : compensation.baseAmount * (1 + percentage / 100);

    return this.updateBaseAmount(compensation, Math.round(newBaseAmount), effectiveFrom);
  }
}

export class CompensationBuilder {
  constructor() {
    this.data = {
      allowances: [],
      deductions: [],
      frequency: 'monthly',
      currency: 'BDT',
    };
  }

  withBase(amount, frequency = 'monthly', currency = 'BDT') {
    this.data.baseAmount = amount;
    this.data.frequency = frequency;
    this.data.currency = currency;
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

  effectiveFrom(date) {
    this.data.effectiveFrom = date;
    return this;
  }

  build() {
    return CompensationFactory.create(this.data);
  }
}

export const createCompensation = () => new CompensationBuilder();

/**
 * Standard Compensation Presets
 */
export const CompensationPresets = {
  basic(baseAmount) {
    return createCompensation().withBase(baseAmount).build();
  },

  withHouseRent(baseAmount, rentPercentage = 50) {
    return createCompensation()
      .withBase(baseAmount)
      .addAllowance('house_rent', rentPercentage, true, 'House Rent')
      .build();
  },

  withMedical(baseAmount, medicalPercentage = 10) {
    return createCompensation()
      .withBase(baseAmount)
      .addAllowance('medical', medicalPercentage, true, 'Medical Allowance')
      .build();
  },

  standard(baseAmount) {
    return createCompensation()
      .withBase(baseAmount)
      .addAllowance('house_rent', 50, true, 'House Rent')
      .addAllowance('medical', 10, true, 'Medical Allowance')
      .addAllowance('transport', 5, true, 'Transport Allowance')
      .build();
  },

  withProvidentFund(baseAmount, pfPercentage = 10) {
    return createCompensation()
      .withBase(baseAmount)
      .addAllowance('house_rent', 50, true, 'House Rent')
      .addAllowance('medical', 10, true, 'Medical Allowance')
      .addDeduction('provident_fund', pfPercentage, true, 'Provident Fund')
      .build();
  },
};

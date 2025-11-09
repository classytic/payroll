/**
 * Employee Factory - Clean Object Creation
 * Beautiful, testable, immutable object creation
 */

import { calculateProbationEnd } from '../utils/date.utils.js';

export class EmployeeFactory {
  static create({
    userId,
    organizationId,
    employment = {},
    compensation = {},
    bankDetails = {},
  }) {
    const hireDate = employment.hireDate || new Date();

    return {
      userId,
      organizationId,
      employeeId: employment.employeeId,
      employmentType: employment.type || 'full_time',
      status: 'active',
      department: employment.department,
      position: employment.position,
      hireDate,
      probationEndDate: calculateProbationEnd(hireDate, employment.probationMonths),
      compensation: this.createCompensation(compensation),
      workSchedule: employment.workSchedule || this.defaultWorkSchedule(),
      bankDetails: bankDetails || {},
    };
  }

  static createCompensation({
    baseAmount,
    frequency = 'monthly',
    currency = 'BDT',
    allowances = [],
    deductions = [],
  }) {
    return {
      baseAmount,
      frequency,
      currency,
      allowances: allowances.map(this.createAllowance),
      deductions: deductions.map(this.createDeduction),
    };
  }

  static createAllowance({ type, name, amount, isPercentage = false }) {
    return {
      type,
      name: name || type,
      amount,
      isPercentage,
    };
  }

  static createDeduction({ type, name, amount, isPercentage = false }) {
    return {
      type,
      name: name || type,
      amount,
      isPercentage,
    };
  }

  static defaultWorkSchedule() {
    return {
      hoursPerWeek: 40,
      daysPerWeek: 5,
      workDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    };
  }

  static createTermination({ reason, date = new Date(), notes, context = {} }) {
    return {
      terminatedAt: date,
      terminationReason: reason,
      terminationNotes: notes,
      terminatedBy: {
        userId: context.userId,
        name: context.userName,
        role: context.userRole,
      },
    };
  }
}

export class EmployeeBuilder {
  constructor() {
    this.data = {};
  }

  forUser(userId) {
    this.data.userId = userId;
    return this;
  }

  inOrganization(organizationId) {
    this.data.organizationId = organizationId;
    return this;
  }

  withEmployeeId(employeeId) {
    this.data.employment = { ...this.data.employment, employeeId };
    return this;
  }

  asDepartment(department) {
    this.data.employment = { ...this.data.employment, department };
    return this;
  }

  asPosition(position) {
    this.data.employment = { ...this.data.employment, position };
    return this;
  }

  withEmploymentType(type) {
    this.data.employment = { ...this.data.employment, type };
    return this;
  }

  hiredOn(date) {
    this.data.employment = { ...this.data.employment, hireDate: date };
    return this;
  }

  withProbation(months) {
    this.data.employment = { ...this.data.employment, probationMonths: months };
    return this;
  }

  withBaseSalary(amount, frequency = 'monthly', currency = 'BDT') {
    this.data.compensation = {
      ...this.data.compensation,
      baseAmount: amount,
      frequency,
      currency,
    };
    return this;
  }

  addAllowance(type, amount, name) {
    const allowances = this.data.compensation?.allowances || [];
    this.data.compensation = {
      ...this.data.compensation,
      allowances: [...allowances, { type, amount, name }],
    };
    return this;
  }

  addDeduction(type, amount, name) {
    const deductions = this.data.compensation?.deductions || [];
    this.data.compensation = {
      ...this.data.compensation,
      deductions: [...deductions, { type, amount, name }],
    };
    return this;
  }

  withBankDetails(bankDetails) {
    this.data.bankDetails = bankDetails;
    return this;
  }

  build() {
    return EmployeeFactory.create(this.data);
  }
}

export const createEmployee = () => new EmployeeBuilder();

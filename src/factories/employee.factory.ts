/**
 * @classytic/payroll - Employee Factory
 *
 * Clean object creation for employee documents
 * Builder pattern for fluent API
 */

import type {
  ObjectIdLike,
  EmploymentType,
  Department,
  Compensation,
  BankDetails,
  WorkSchedule,
  Allowance,
  Deduction,
  PaymentFrequency,
  TerminationReason,
} from '../types.js';
import { calculateProbationEnd } from '../utils/date.js';
import { HRM_CONFIG } from '../config.js';

// ============================================================================
// Employee Factory Types
// ============================================================================

export interface CreateEmployeeParams {
  userId: ObjectIdLike;
  organizationId: ObjectIdLike;
  employment: {
    employeeId?: string;
    type?: EmploymentType;
    department?: Department | string;
    position: string;
    hireDate?: Date;
    probationMonths?: number;
    workSchedule?: WorkSchedule;
  };
  compensation: {
    baseAmount: number;
    frequency?: PaymentFrequency;
    currency?: string;
    allowances?: Array<Partial<Allowance>>;
    deductions?: Array<Partial<Deduction>>;
  };
  bankDetails?: BankDetails;
}

export interface EmployeeData {
  userId: ObjectIdLike;
  organizationId: ObjectIdLike;
  employeeId: string;
  employmentType: EmploymentType;
  status: 'active';
  department?: Department;
  position: string;
  hireDate: Date;
  probationEndDate: Date | null;
  compensation: Compensation;
  workSchedule: WorkSchedule;
  bankDetails: BankDetails;
  payrollStats: {
    totalPaid: number;
    paymentsThisYear: number;
    averageMonthly: number;
  };
}

export interface TerminationData {
  terminatedAt: Date;
  terminationReason: TerminationReason;
  terminationNotes?: string;
  terminatedBy: {
    userId?: ObjectIdLike;
    name?: string;
    role?: string;
  };
}

// ============================================================================
// Employee Factory
// ============================================================================

export class EmployeeFactory {
  /**
   * Create employee data object
   */
  static create(params: CreateEmployeeParams): EmployeeData {
    const { userId, organizationId, employment, compensation, bankDetails } = params;
    const hireDate = employment.hireDate || new Date();

    return {
      userId,
      organizationId,
      employeeId: employment.employeeId || `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      employmentType: employment.type || 'full_time',
      status: 'active',
      department: employment.department as Department | undefined,
      position: employment.position,
      hireDate,
      probationEndDate: calculateProbationEnd(
        hireDate,
        employment.probationMonths ?? HRM_CONFIG.employment.defaultProbationMonths
      ),
      compensation: this.createCompensation(compensation),
      workSchedule: employment.workSchedule || this.defaultWorkSchedule(),
      bankDetails: bankDetails || {},
      payrollStats: {
        totalPaid: 0,
        paymentsThisYear: 0,
        averageMonthly: 0,
      },
    };
  }

  /**
   * Create compensation object
   */
  static createCompensation(params: {
    baseAmount: number;
    frequency?: PaymentFrequency;
    currency?: string;
    allowances?: Array<Partial<Allowance>>;
    deductions?: Array<Partial<Deduction>>;
  }): Compensation {
    return {
      baseAmount: params.baseAmount,
      frequency: params.frequency || 'monthly',
      currency: params.currency || HRM_CONFIG.payroll.defaultCurrency,
      allowances: (params.allowances || []).map((a) => ({
        type: a.type || 'other',
        name: a.name || a.type || 'other',
        amount: a.amount || 0,
        taxable: a.taxable,
        recurring: a.recurring,
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
      })),
      deductions: (params.deductions || []).map((d) => ({
        type: d.type || 'other',
        name: d.name || d.type || 'other',
        amount: d.amount || 0,
        auto: d.auto,
        recurring: d.recurring,
        description: d.description,
        effectiveFrom: d.effectiveFrom,
        effectiveTo: d.effectiveTo,
      })),
      grossSalary: 0,
      netSalary: 0,
      effectiveFrom: new Date(),
      lastModified: new Date(),
    };
  }

  /**
   * Create allowance object
   */
  static createAllowance(params: {
    type: Allowance['type'];
    amount: number;
    name?: string;
    isPercentage?: boolean;
    taxable?: boolean;
    recurring?: boolean;
  }): Allowance {
    return {
      type: params.type,
      name: params.name || params.type,
      amount: params.amount,
      isPercentage: params.isPercentage ?? false,
      taxable: params.taxable ?? true,
      recurring: params.recurring ?? true,
      effectiveFrom: new Date(),
    };
  }

  /**
   * Create deduction object
   */
  static createDeduction(params: {
    type: Deduction['type'];
    amount: number;
    name?: string;
    isPercentage?: boolean;
    auto?: boolean;
    recurring?: boolean;
    description?: string;
  }): Deduction {
    return {
      type: params.type,
      name: params.name || params.type,
      amount: params.amount,
      isPercentage: params.isPercentage ?? false,
      auto: params.auto ?? false,
      recurring: params.recurring ?? true,
      description: params.description,
      effectiveFrom: new Date(),
    };
  }

  /**
   * Default work schedule
   */
  static defaultWorkSchedule(): WorkSchedule {
    return {
      hoursPerWeek: 40,
      hoursPerDay: 8,
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      shiftStart: '09:00',
      shiftEnd: '17:00',
    };
  }

  /**
   * Create termination data
   */
  static createTermination(params: {
    reason: TerminationReason;
    date?: Date;
    notes?: string;
    context?: {
      userId?: ObjectIdLike;
      userName?: string;
      userRole?: string;
    };
  }): TerminationData {
    return {
      terminatedAt: params.date || new Date(),
      terminationReason: params.reason,
      terminationNotes: params.notes,
      terminatedBy: {
        userId: params.context?.userId,
        name: params.context?.userName,
        role: params.context?.userRole,
      },
    };
  }
}

// ============================================================================
// Employee Builder
// ============================================================================

export class EmployeeBuilder {
  private data: Partial<CreateEmployeeParams> = {
    employment: {} as CreateEmployeeParams['employment'],
    compensation: {} as CreateEmployeeParams['compensation'],
    bankDetails: {},
  };

  /**
   * Set user ID
   */
  forUser(userId: ObjectIdLike): this {
    this.data.userId = userId;
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
   * Set employee ID
   */
  withEmployeeId(employeeId: string): this {
    this.data.employment = { ...this.data.employment!, employeeId };
    return this;
  }

  /**
   * Set department
   */
  inDepartment(department: Department): this {
    this.data.employment = { ...this.data.employment!, department };
    return this;
  }

  /**
   * Set position
   */
  asPosition(position: string): this {
    this.data.employment = { ...this.data.employment!, position };
    return this;
  }

  /**
   * Set employment type
   */
  withEmploymentType(type: EmploymentType): this {
    this.data.employment = { ...this.data.employment!, type };
    return this;
  }

  /**
   * Set hire date
   */
  hiredOn(date: Date): this {
    this.data.employment = { ...this.data.employment!, hireDate: date };
    return this;
  }

  /**
   * Set probation period
   */
  withProbation(months: number): this {
    this.data.employment = { ...this.data.employment!, probationMonths: months };
    return this;
  }

  /**
   * Set work schedule
   */
  withSchedule(schedule: WorkSchedule): this {
    this.data.employment = { ...this.data.employment!, workSchedule: schedule };
    return this;
  }

  /**
   * Set base salary
   */
  withBaseSalary(
    amount: number,
    frequency: PaymentFrequency = 'monthly',
    currency = 'BDT'
  ): this {
    this.data.compensation = {
      ...this.data.compensation!,
      baseAmount: amount,
      frequency,
      currency,
    };
    return this;
  }

  /**
   * Add allowance
   */
  addAllowance(
    type: Allowance['type'],
    amount: number,
    options: { taxable?: boolean; recurring?: boolean } = {}
  ): this {
    const allowances = this.data.compensation?.allowances || [];
    this.data.compensation = {
      ...this.data.compensation!,
      allowances: [
        ...allowances,
        { type, amount, taxable: options.taxable, recurring: options.recurring },
      ],
    };
    return this;
  }

  /**
   * Add deduction
   */
  addDeduction(
    type: Deduction['type'],
    amount: number,
    options: { auto?: boolean; recurring?: boolean; description?: string } = {}
  ): this {
    const deductions = this.data.compensation?.deductions || [];
    this.data.compensation = {
      ...this.data.compensation!,
      deductions: [
        ...deductions,
        {
          type,
          amount,
          auto: options.auto,
          recurring: options.recurring,
          description: options.description,
        },
      ],
    };
    return this;
  }

  /**
   * Set bank details
   */
  withBankDetails(bankDetails: BankDetails): this {
    this.data.bankDetails = bankDetails;
    return this;
  }

  /**
   * Build employee data
   */
  build(): EmployeeData {
    if (!this.data.userId || !this.data.organizationId) {
      throw new Error('userId and organizationId are required');
    }
    if (!this.data.employment?.employeeId || !this.data.employment?.position) {
      throw new Error('employeeId and position are required');
    }
    if (!this.data.compensation?.baseAmount) {
      throw new Error('baseAmount is required');
    }

    return EmployeeFactory.create(this.data as CreateEmployeeParams);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create new employee builder
 */
export function createEmployee(): EmployeeBuilder {
  return new EmployeeBuilder();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  EmployeeFactory,
  EmployeeBuilder,
  createEmployee,
};


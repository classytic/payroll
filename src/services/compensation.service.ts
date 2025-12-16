/**
 * @classytic/payroll - Compensation Service
 *
 * High-level compensation operations with dependency injection
 */

import type { Model, ClientSession } from 'mongoose';
import type {
  ObjectIdLike,
  EmployeeDocument,
  Compensation,
  Allowance,
  Deduction,
  Department,
  CompensationBreakdownResult,
} from '../types.js';
import {
  CompensationFactory,
  CompensationPresets,
} from '../factories/compensation.factory.js';
import { toObjectId } from '../utils/query-builders.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Compensation Service
// ============================================================================

export class CompensationService {
  constructor(private readonly EmployeeModel: Model<EmployeeDocument>) {}

  /**
   * Get employee compensation
   */
  async getEmployeeCompensation(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<Compensation> {
    let query = this.EmployeeModel.findById(toObjectId(employeeId));
    
    if (options.session) {
      query = query.session(options.session);
    }
    
    const employee = await query.exec();
    if (!employee) {
      throw new Error('Employee not found');
    }

    return employee.compensation;
  }

  /**
   * Calculate compensation breakdown
   */
  async calculateBreakdown(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const compensation = await this.getEmployeeCompensation(employeeId, options);
    return CompensationFactory.calculateBreakdown(compensation);
  }

  /**
   * Update base amount
   */
  async updateBaseAmount(
    employeeId: ObjectIdLike,
    newAmount: number,
    effectiveFrom = new Date(),
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    const updatedCompensation = CompensationFactory.updateBaseAmount(
      employee.compensation,
      newAmount,
      effectiveFrom
    );

    employee.compensation = updatedCompensation;
    await employee.save({ session: options.session });

    logger.info('Compensation base amount updated', {
      employeeId: employee.employeeId,
      newAmount,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Apply salary increment
   */
  async applyIncrement(
    employeeId: ObjectIdLike,
    params: { percentage?: number; amount?: number; effectiveFrom?: Date },
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);
    const previousAmount = employee.compensation.baseAmount;

    const updatedCompensation = CompensationFactory.applyIncrement(
      employee.compensation,
      params
    );

    employee.compensation = updatedCompensation;
    await employee.save({ session: options.session });

    logger.info('Salary increment applied', {
      employeeId: employee.employeeId,
      previousAmount,
      newAmount: updatedCompensation.baseAmount,
      percentage: params.percentage,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Add allowance
   */
  async addAllowance(
    employeeId: ObjectIdLike,
    allowance: {
      type: Allowance['type'];
      value: number;
      isPercentage?: boolean;
      name?: string;
      taxable?: boolean;
    },
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    const updatedCompensation = CompensationFactory.addAllowance(
      employee.compensation,
      allowance
    );

    employee.compensation = updatedCompensation;
    await employee.save({ session: options.session });

    logger.info('Allowance added', {
      employeeId: employee.employeeId,
      type: allowance.type,
      value: allowance.value,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Remove allowance
   */
  async removeAllowance(
    employeeId: ObjectIdLike,
    allowanceType: Allowance['type'],
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    const updatedCompensation = CompensationFactory.removeAllowance(
      employee.compensation,
      allowanceType
    );

    employee.compensation = updatedCompensation;
    await employee.save({ session: options.session });

    logger.info('Allowance removed', {
      employeeId: employee.employeeId,
      type: allowanceType,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Add deduction
   */
  async addDeduction(
    employeeId: ObjectIdLike,
    deduction: {
      type: Deduction['type'];
      value: number;
      isPercentage?: boolean;
      name?: string;
      auto?: boolean;
    },
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    const updatedCompensation = CompensationFactory.addDeduction(
      employee.compensation,
      deduction
    );

    employee.compensation = updatedCompensation;
    await employee.save({ session: options.session });

    logger.info('Deduction added', {
      employeeId: employee.employeeId,
      type: deduction.type,
      value: deduction.value,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Remove deduction
   */
  async removeDeduction(
    employeeId: ObjectIdLike,
    deductionType: Deduction['type'],
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    const updatedCompensation = CompensationFactory.removeDeduction(
      employee.compensation,
      deductionType
    );

    employee.compensation = updatedCompensation;
    await employee.save({ session: options.session });

    logger.info('Deduction removed', {
      employeeId: employee.employeeId,
      type: deductionType,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Set standard compensation
   */
  async setStandardCompensation(
    employeeId: ObjectIdLike,
    baseAmount: number,
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    employee.compensation = CompensationPresets.standard(baseAmount);
    await employee.save({ session: options.session });

    logger.info('Standard compensation set', {
      employeeId: employee.employeeId,
      baseAmount,
    });

    return this.calculateBreakdown(employeeId, options);
  }

  /**
   * Compare compensation between two employees
   */
  async compareCompensation(
    employeeId1: ObjectIdLike,
    employeeId2: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<{
    employee1: CompensationBreakdownResult;
    employee2: CompensationBreakdownResult;
    difference: { base: number; gross: number; net: number };
    ratio: { base: number; gross: number; net: number };
  }> {
    const breakdown1 = await this.calculateBreakdown(employeeId1, options);
    const breakdown2 = await this.calculateBreakdown(employeeId2, options);

    return {
      employee1: breakdown1,
      employee2: breakdown2,
      difference: {
        base: breakdown2.baseAmount - breakdown1.baseAmount,
        gross: breakdown2.grossAmount - breakdown1.grossAmount,
        net: breakdown2.netAmount - breakdown1.netAmount,
      },
      ratio: {
        base: breakdown1.baseAmount > 0 ? breakdown2.baseAmount / breakdown1.baseAmount : 0,
        gross: breakdown1.grossAmount > 0 ? breakdown2.grossAmount / breakdown1.grossAmount : 0,
        net: breakdown1.netAmount > 0 ? breakdown2.netAmount / breakdown1.netAmount : 0,
      },
    };
  }

  /**
   * Get department compensation stats
   */
  async getDepartmentCompensationStats(
    organizationId: ObjectIdLike,
    department: Department,
    options: { session?: ClientSession } = {}
  ): Promise<{
    department: string;
    employeeCount: number;
    totalBase: number;
    totalGross: number;
    totalNet: number;
    averageBase: number;
    averageGross: number;
    averageNet: number;
  }> {
    let query = this.EmployeeModel.find({
      organizationId: toObjectId(organizationId),
      department,
      status: { $in: ['active', 'on_leave'] },
    });

    if (options.session) {
      query = query.session(options.session);
    }

    const employees = await query.exec();

    const breakdowns = employees.map((emp) =>
      CompensationFactory.calculateBreakdown(emp.compensation)
    );

    const totals = breakdowns.reduce(
      (acc, breakdown) => ({
        totalBase: acc.totalBase + breakdown.baseAmount,
        totalGross: acc.totalGross + breakdown.grossAmount,
        totalNet: acc.totalNet + breakdown.netAmount,
      }),
      { totalBase: 0, totalGross: 0, totalNet: 0 }
    );

    const count = employees.length || 1;

    return {
      department,
      employeeCount: employees.length,
      ...totals,
      averageBase: Math.round(totals.totalBase / count),
      averageGross: Math.round(totals.totalGross / count),
      averageNet: Math.round(totals.totalNet / count),
    };
  }

  /**
   * Get organization compensation stats
   */
  async getOrganizationCompensationStats(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<{
    employeeCount: number;
    totalBase: number;
    totalGross: number;
    totalNet: number;
    averageBase: number;
    averageGross: number;
    averageNet: number;
    byDepartment: Record<string, { count: number; totalNet: number }>;
  }> {
    let query = this.EmployeeModel.find({
      organizationId: toObjectId(organizationId),
      status: { $in: ['active', 'on_leave'] },
    });

    if (options.session) {
      query = query.session(options.session);
    }

    const employees = await query.exec();

    const breakdowns = employees.map((emp) =>
      CompensationFactory.calculateBreakdown(emp.compensation)
    );

    const totals = breakdowns.reduce(
      (acc, breakdown) => ({
        totalBase: acc.totalBase + breakdown.baseAmount,
        totalGross: acc.totalGross + breakdown.grossAmount,
        totalNet: acc.totalNet + breakdown.netAmount,
      }),
      { totalBase: 0, totalGross: 0, totalNet: 0 }
    );

    const byDepartment: Record<string, { count: number; totalNet: number }> = {};
    employees.forEach((emp, i) => {
      const dept = emp.department || 'unassigned';
      if (!byDepartment[dept]) {
        byDepartment[dept] = { count: 0, totalNet: 0 };
      }
      byDepartment[dept].count++;
      byDepartment[dept].totalNet += breakdowns[i].netAmount;
    });

    const count = employees.length || 1;

    return {
      employeeCount: employees.length,
      ...totals,
      averageBase: Math.round(totals.totalBase / count),
      averageGross: Math.round(totals.totalGross / count),
      averageNet: Math.round(totals.totalNet / count),
      byDepartment,
    };
  }

  /**
   * Find employee helper
   */
  private async findEmployee(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument> {
    let query = this.EmployeeModel.findById(toObjectId(employeeId));
    
    if (options.session) {
      query = query.session(options.session);
    }
    
    const employee = await query.exec();
    if (!employee) {
      throw new Error('Employee not found');
    }
    return employee;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create compensation service instance
 */
export function createCompensationService(
  EmployeeModel: Model<EmployeeDocument>
): CompensationService {
  return new CompensationService(EmployeeModel);
}


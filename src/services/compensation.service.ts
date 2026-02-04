/**
 * @classytic/payroll - Compensation Service (Refactored with Mongokit)
 *
 * High-level compensation operations using Repository pattern
 *
 * ⚠️ **INTERNAL USE ONLY**
 *
 * This service is for internal use by the Payroll class only.
 * All methods use repository pattern with automatic multi-tenant isolation.
 *
 * **Key Changes from v1:**
 * - Uses Repository instead of direct Model access
 * - Multi-tenant isolation handled by plugin (organizationId auto-injected)
 * - No need to pass organizationId to methods (plugin handles it)
 *
 * @internal
 */

import type { Repository } from '@classytic/mongokit';
import type { ClientSession } from 'mongoose';
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
import { roundMoney } from '../utils/money.js';

// ============================================================================
// Compensation Service (Mongokit Refactored)
// ============================================================================

export class CompensationService<T extends EmployeeDocument = EmployeeDocument> {
  constructor(private readonly employeeRepo: Repository<T>) {}

  /**
   * Get employee compensation
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
   */
  async getEmployeeCompensation(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<Compensation> {
    const employee = await this.findEmployee(employeeId, options);
    return employee.compensation;
  }

  /**
   * Calculate compensation breakdown
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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

    await this.employeeRepo.update(
      employeeId,
      { compensation: updatedCompensation },
      { session: options.session }
    );

    logger.info('Compensation base amount updated', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      newAmount,
    });

    return CompensationFactory.calculateBreakdown(updatedCompensation);
  }

  /**
   * Apply salary increment
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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

    await this.employeeRepo.update(
      employeeId,
      { compensation: updatedCompensation },
      { session: options.session }
    );

    logger.info('Salary increment applied', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      previousAmount,
      newAmount: updatedCompensation.baseAmount,
      percentage: params.percentage,
    });

    return CompensationFactory.calculateBreakdown(updatedCompensation);
  }

  /**
   * Add allowance
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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

    await this.employeeRepo.update(
      employeeId,
      { compensation: updatedCompensation },
      { session: options.session }
    );

    logger.info('Allowance added', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      type: allowance.type,
      value: allowance.value,
    });

    return CompensationFactory.calculateBreakdown(updatedCompensation);
  }

  /**
   * Remove allowance
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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

    await this.employeeRepo.update(
      employeeId,
      { compensation: updatedCompensation },
      { session: options.session }
    );

    logger.info('Allowance removed', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      type: allowanceType,
    });

    return CompensationFactory.calculateBreakdown(updatedCompensation);
  }

  /**
   * Add deduction
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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

    await this.employeeRepo.update(
      employeeId,
      { compensation: updatedCompensation },
      { session: options.session }
    );

    logger.info('Deduction added', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      type: deduction.type,
      value: deduction.value,
    });

    return CompensationFactory.calculateBreakdown(updatedCompensation);
  }

  /**
   * Remove deduction
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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

    await this.employeeRepo.update(
      employeeId,
      { compensation: updatedCompensation },
      { session: options.session }
    );

    logger.info('Deduction removed', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      type: deductionType,
    });

    return CompensationFactory.calculateBreakdown(updatedCompensation);
  }

  /**
   * Set standard compensation
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
   */
  async setStandardCompensation(
    employeeId: ObjectIdLike,
    baseAmount: number,
    options: { session?: ClientSession } = {}
  ): Promise<CompensationBreakdownResult> {
    const employee = await this.findEmployee(employeeId, options);

    const standardCompensation = CompensationPresets.standard(baseAmount);

    await this.employeeRepo.update(
      employeeId,
      { compensation: standardCompensation },
      { session: options.session }
    );

    logger.info('Standard compensation set', {
      employeeId: employee.employeeId,
      organizationId: employee.organizationId.toString(),
      baseAmount,
    });

    return CompensationFactory.calculateBreakdown(standardCompensation);
  }

  /**
   * Compare compensation between two employees
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
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
   * Get department compensation stats using MongoDB aggregation
   *
   * ✨ Optimized: Uses aggregation pipeline instead of loading all employees
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
   *
   * @example
   * ```typescript
   * const stats = await compensationService.getDepartmentCompensationStats('engineering');
   * console.log(stats.employeeCount); // e.g., 250
   * console.log(stats.averageBase); // e.g., 85000
   * ```
   */
  async getDepartmentCompensationStats(
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
    // Use MongoDB aggregation pipeline for efficient stats calculation
    // organizationId filter automatically added by plugin
    const pipeline = [
      {
        $match: {
          department,
          status: { $in: ['active', 'on_leave'] },
        },
      },
      {
        $group: {
          _id: null,
          employeeCount: { $sum: 1 },
          totalBase: { $sum: '$compensation.baseAmount' },
          totalGross: { $sum: '$compensation.grossSalary' },
          totalNet: { $sum: '$compensation.netSalary' },
          avgBase: { $avg: '$compensation.baseAmount' },
          avgGross: { $avg: '$compensation.grossSalary' },
          avgNet: { $avg: '$compensation.netSalary' },
        },
      },
    ];

    const results = await this.employeeRepo.aggregate<{
      _id: null;
      employeeCount: number;
      totalBase: number;
      totalGross: number;
      totalNet: number;
      avgBase: number;
      avgGross: number;
      avgNet: number;
    }>(pipeline, { session: options.session });

    const stats = results[0] || {
      employeeCount: 0,
      totalBase: 0,
      totalGross: 0,
      totalNet: 0,
      avgBase: 0,
      avgGross: 0,
      avgNet: 0,
    };

    return {
      department,
      employeeCount: stats.employeeCount,
      totalBase: roundMoney(stats.totalBase || 0, 2),
      totalGross: roundMoney(stats.totalGross || 0, 2),
      totalNet: roundMoney(stats.totalNet || 0, 2),
      averageBase: roundMoney(stats.avgBase || 0, 2),
      averageGross: roundMoney(stats.avgGross || 0, 2),
      averageNet: roundMoney(stats.avgNet || 0, 2),
    };
  }

  /**
   * Get organization compensation stats using MongoDB aggregation
   *
   * ✨ Optimized: Uses aggregation pipeline instead of loading all employees
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
   *
   * @example
   * ```typescript
   * const stats = await compensationService.getOrganizationCompensationStats();
   * console.log(stats.employeeCount); // Total active employees
   * console.log(stats.byDepartment); // Breakdown by department
   * ```
   */
  async getOrganizationCompensationStats(
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
    // Use MongoDB aggregation with facet for both overall and by-department stats
    // organizationId filter automatically added by plugin
    const pipeline = [
      {
        $match: {
          status: { $in: ['active', 'on_leave'] },
        },
      },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                employeeCount: { $sum: 1 },
                totalBase: { $sum: '$compensation.baseAmount' },
                totalGross: { $sum: '$compensation.grossSalary' },
                totalNet: { $sum: '$compensation.netSalary' },
                avgBase: { $avg: '$compensation.baseAmount' },
                avgGross: { $avg: '$compensation.grossSalary' },
                avgNet: { $avg: '$compensation.netSalary' },
              },
            },
          ],
          byDepartment: [
            {
              $group: {
                _id: { $ifNull: ['$department', 'unassigned'] },
                count: { $sum: 1 },
                totalNet: { $sum: '$compensation.netSalary' },
              },
            },
          ],
        },
      },
    ];

    const results = await this.employeeRepo.aggregate<{
      overall: Array<{
        _id: null;
        employeeCount: number;
        totalBase: number;
        totalGross: number;
        totalNet: number;
        avgBase: number;
        avgGross: number;
        avgNet: number;
      }>;
      byDepartment: Array<{
        _id: string;
        count: number;
        totalNet: number;
      }>;
    }>(pipeline, { session: options.session });

    const overallStats = results[0]?.overall[0] || {
      employeeCount: 0,
      totalBase: 0,
      totalGross: 0,
      totalNet: 0,
      avgBase: 0,
      avgGross: 0,
      avgNet: 0,
    };

    const byDepartment: Record<string, { count: number; totalNet: number }> = {};
    (results[0]?.byDepartment || []).forEach((dept) => {
      byDepartment[dept._id] = {
        count: dept.count,
        totalNet: roundMoney(dept.totalNet || 0, 2),
      };
    });

    return {
      employeeCount: overallStats.employeeCount,
      totalBase: roundMoney(overallStats.totalBase || 0, 2),
      totalGross: roundMoney(overallStats.totalGross || 0, 2),
      totalNet: roundMoney(overallStats.totalNet || 0, 2),
      averageBase: roundMoney(overallStats.avgBase || 0, 2),
      averageGross: roundMoney(overallStats.avgGross || 0, 2),
      averageNet: roundMoney(overallStats.avgNet || 0, 2),
      byDepartment,
    };
  }

  /**
   * Find employee helper
   *
   * ⚠️ organizationId automatically validated by multiTenantPlugin
   */
  private async findEmployee(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument> {
    // Use getAll to ensure organizationId filtering works at query level
    const result = await this.employeeRepo.getAll(
      {
        filters: { _id: toObjectId(employeeId) },
        limit: 1,
      },
      { session: options.session }
    );

    const employee = result.docs[0];
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
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
export function createCompensationService<T extends EmployeeDocument = EmployeeDocument>(
  employeeRepo: Repository<T>
): CompensationService<T> {
  return new CompensationService<T>(employeeRepo);
}

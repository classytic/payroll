/**
 * @classytic/payroll - Payroll Service (Refactored with Mongokit)
 *
 * High-level payroll operations using Repository pattern
 *
 * **Key Changes from v1:**
 * - Uses Repository instead of direct Model access
 * - Multi-tenant isolation handled by plugin (organizationId auto-injected)
 * - Cleaner API (no need to pass organizationId to most methods)
 */

import type { Repository } from '@classytic/mongokit';
import type { ClientSession } from 'mongoose';
import type {
  ObjectIdLike,
  PayrollRecordDocument,
  EmployeeDocument,
  PayrollStatus,
  PaymentMethod,
} from '../types.js';
import {
  PayrollFactory,
  BatchPayrollFactory,
  type PayrollData,
} from '../factories/payroll.factory.js';
import { payroll as payrollQuery, toObjectId } from '../utils/query-builders.js';
import { getCurrentPeriod } from '../utils/date.js';
import { canReceiveSalary } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import type { EmployeeService } from './employee.service.js';

// ============================================================================
// Payroll Service (Mongokit Refactored)
// ============================================================================

export class PayrollService<
  T extends PayrollRecordDocument = PayrollRecordDocument,
  TEmployee extends EmployeeDocument = EmployeeDocument
> {
  constructor(
    private readonly payrollRepo: Repository<T>,
    private readonly employeeService: EmployeeService<TEmployee>
  ) {}

  /**
   * Find payroll by ID
   *
   * organizationId auto-scoped by multiTenantPlugin
   */
  async findById(
    payrollId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument | null> {
    // Use getAll to ensure organizationId filtering works at query level
    // (getById after hooks don't properly override return values in mongokit)
    const result = await this.payrollRepo.getAll(
      {
        filters: { _id: toObjectId(payrollId) },
        limit: 1,
      },
      { session: options.session }
    );

    return result.docs[0] || null;
  }

  /**
   * Find payrolls by employee
   */
  async findByEmployee(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession; limit?: number } = {}
  ): Promise<PayrollRecordDocument[]> {
    // organizationId automatically added by multiTenantPlugin
    const result = await this.payrollRepo.getAll(
      {
        filters: { employeeId: toObjectId(employeeId) },
        sort: { 'period.year': -1, 'period.month': -1 },
        limit: options.limit || 12,
      },
      { session: options.session }
    );

    return result.docs;
  }

  /**
   * Find payrolls for a period
   */
  async findForPeriod(
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    // organizationId automatically added by multiTenantPlugin
    const result = await this.payrollRepo.getAll(
      {
        filters: {
          'period.month': month,
          'period.year': year,
        },
      },
      { session: options.session }
    );

    return result.docs;
  }

  /**
   * Find pending payrolls
   */
  async findPending(
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    // organizationId automatically added by multiTenantPlugin
    const result = await this.payrollRepo.getAll(
      {
        filters: {
          'period.month': month,
          'period.year': year,
          status: 'pending',
        },
      },
      { session: options.session }
    );

    return result.docs;
  }

  /**
   * Find payroll by employee and period
   */
  async findByEmployeeAndPeriod(
    employeeId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument | null> {
    // organizationId automatically added by multiTenantPlugin
    return this.payrollRepo.getByQuery(
      {
        employeeId: toObjectId(employeeId),
        'period.month': month,
        'period.year': year,
      },
      { session: options.session }
    );
  }

  /**
   * Create payroll record
   *
   * organizationId auto-injected by multiTenantPlugin
   */
  async create(
    data: PayrollData,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    const payroll = await this.payrollRepo.create(data as unknown as Partial<T>, {
      session: options.session,
    });

    logger.info('Payroll record created', {
      payrollId: payroll._id.toString(),
      employeeId: payroll.employeeId.toString(),
    });

    return payroll;
  }

  /**
   * Generate payroll for employee
   *
   * organizationId auto-scoped by multiTenantPlugin
   */
  async generateForEmployee(
    employeeId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    // Employee lookup auto-scoped by multiTenantPlugin
    const employee = await this.employeeService.findById(employeeId, options);

    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (!canReceiveSalary(employee)) {
      throw new Error('Employee is not eligible to receive salary');
    }

    const payrollData = PayrollFactory.create({
      employeeId: employee._id,
      organizationId: employee.organizationId,
      baseAmount: employee.compensation.baseAmount,
      allowances: employee.compensation.allowances,
      deductions: employee.compensation.deductions,
      period: { month, year },
    });
    return this.create(payrollData, options);
  }

  /**
   * Generate bulk payroll
   *
   * organizationId auto-scoped by multiTenantPlugin
   */
  async generateBulk(
    employeeIds: ObjectIdLike[],
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    const payrolls: PayrollRecordDocument[] = [];

    for (const employeeId of employeeIds) {
      try {
        const payroll = await this.generateForEmployee(employeeId, month, year, options);
        payrolls.push(payroll);
      } catch (error) {
        logger.error('Failed to generate payroll for employee', {
          employeeId: employeeId.toString(),
          error: (error as Error).message,
        });
        // Continue with other employees
      }
    }

    return payrolls;
  }

  /**
   * Mark payroll as paid
   */
  async markAsPaid(
    payrollId: ObjectIdLike,
    transactionIdOrOptions?: ObjectIdLike | { session?: ClientSession; paidAt?: Date },
    options?: { session?: ClientSession; paidAt?: Date }
  ): Promise<PayrollRecordDocument> {
    // Handle both old and new signatures
    let transactionId: ObjectIdLike | undefined;
    let resolvedOptions: { session?: ClientSession; paidAt?: Date } = {};

    if (transactionIdOrOptions) {
      // Check if it's an ObjectId or options object
      if (typeof transactionIdOrOptions === 'object' && ('session' in transactionIdOrOptions || 'paidAt' in transactionIdOrOptions)) {
        // Old signature: markAsPaid(payrollId, { session, paidAt })
        resolvedOptions = transactionIdOrOptions;
        transactionId = undefined;
      } else {
        // New signature: markAsPaid(payrollId, transactionId, { session, paidAt })
        transactionId = transactionIdOrOptions as ObjectIdLike;
        resolvedOptions = options || {};
      }
    } else {
      resolvedOptions = options || {};
    }

    // Fetch first to ensure cross-org updates are blocked
    const existing = await this.findById(payrollId, resolvedOptions);
    if (!existing) {
      throw new Error(`Payroll not found: ${payrollId}`);
    }

    // Validate state transition
    const { PayrollStatusMachine } = await import('../core/payroll-states.js');
    if (!PayrollStatusMachine.canTransition(existing.status, 'paid')) {
      const validNext = PayrollStatusMachine.getNextStates(existing.status);
      throw new Error(
        `Invalid status transition: Cannot transition from ${existing.status} to paid. Valid transitions: ${validNext.join(', ')}`
      );
    }

    const updateData: Record<string, unknown> = {
      status: 'paid',
      paidAt: resolvedOptions.paidAt || new Date(),
    };

    if (transactionId) {
      updateData.transactionId = toObjectId(transactionId);
    }

    const payroll = await this.payrollRepo.update(
      payrollId,
      updateData,
      { session: resolvedOptions.session }
    );

    logger.info('Payroll marked as paid', {
      payrollId: payroll._id.toString(),
    });

    return payroll;
  }

  /**
   * Update payroll status
   */
  async updateStatus(
    payrollId: ObjectIdLike,
    status: PayrollStatus,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    // Fetch first to ensure cross-org updates are blocked
    const existing = await this.findById(payrollId, options);
    if (!existing) {
      throw new Error(`Payroll not found: ${payrollId}`);
    }

    // Validate state transition (allow idempotent same-status updates)
    if (existing.status !== status) {
      const { PayrollStatusMachine } = await import('../core/payroll-states.js');
      if (!PayrollStatusMachine.canTransition(existing.status, status)) {
        const validNext = PayrollStatusMachine.getNextStates(existing.status);
        throw new Error(
          `Invalid status transition: Cannot transition from ${existing.status} to ${status}. Valid transitions: ${validNext.join(', ')}`
        );
      }
    }

    return this.payrollRepo.update(
      payrollId,
      { status },
      { session: options.session }
    );
  }

  /**
   * Add correction to payroll
   */
  async addCorrection(
    payrollId: ObjectIdLike,
    previousAmount: number,
    newAmount: number,
    reason: string,
    correctedBy: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    const payroll = await this.findById(payrollId, options);

    if (!payroll) {
      throw new Error(`Payroll not found: ${payrollId}`);
    }

    // Add correction using document method
    payroll.addCorrection(previousAmount, newAmount, reason, toObjectId(correctedBy));

    await payroll.save({ session: options.session });

    return payroll;
  }

  /**
   * Get summary for organization
   *
   * organizationId auto-scoped by multiTenantPlugin
   */
  async getSummary(
    month?: number,
    year?: number,
    options: { session?: ClientSession } = {}
  ): Promise<{
    totalGross: number;
    totalNet: number;
    count: number;
    paidCount: number;
  }> {
    // organizationId automatically added by multiTenantPlugin in aggregation
    const filters: Record<string, unknown> = {};

    if (month) filters['period.month'] = month;
    if (year) filters['period.year'] = year;

    const pipeline = [
      { $match: filters },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$breakdown.grossSalary' },
          totalNet: { $sum: '$breakdown.netSalary' },
          count: { $sum: 1 },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
          },
        },
      },
    ];

    const results = await this.payrollRepo.aggregate<{ totalGross: number; totalNet: number; count: number; paidCount: number }>(
      pipeline,
      { session: options.session }
    );

    return results[0] || { totalGross: 0, totalNet: 0, count: 0, paidCount: 0 };
  }

  /**
   * Check if payroll exists
   */
  async exists(
    employeeId: ObjectIdLike,
    month: number,
    year: number
  ): Promise<boolean> {
    // organizationId automatically added by multiTenantPlugin
    const result = await this.payrollRepo.exists({
      employeeId: toObjectId(employeeId),
      'period.month': month,
      'period.year': year,
    });

    return result !== null;
  }

  /**
   * Count payrolls
   */
  async count(filters: Record<string, unknown> = {}): Promise<number> {
    // organizationId automatically added by multiTenantPlugin
    return this.payrollRepo.count(filters);
  }

  /**
   * Export payrolls for date range
   */
  async exportForDateRange(
    startDate: Date,
    endDate: Date,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    // organizationId automatically added by multiTenantPlugin
    const result = await this.payrollRepo.getAll(
      {
        filters: {
          'period.startDate': { $gte: startDate },
          'period.endDate': { $lte: endDate },
        },
        sort: { 'period.year': -1, 'period.month': -1 },
      },
      { session: options.session }
    );

    return result.docs;
  }
}

/**
 * Factory function to create PayrollService
 */
export function createPayrollService<
  T extends PayrollRecordDocument = PayrollRecordDocument,
  TEmployee extends EmployeeDocument = EmployeeDocument
>(
  payrollRepo: Repository<T>,
  employeeService: EmployeeService<TEmployee>
): PayrollService<T, TEmployee> {
  return new PayrollService<T, TEmployee>(payrollRepo, employeeService);
}

export default PayrollService;

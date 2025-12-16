/**
 * @classytic/payroll - Payroll Service
 *
 * High-level payroll operations with dependency injection
 */

import type { Model, ClientSession } from 'mongoose';
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
// Payroll Service
// ============================================================================

export class PayrollService {
  constructor(
    private readonly PayrollModel: Model<PayrollRecordDocument>,
    private readonly employeeService: EmployeeService
  ) {}

  /**
   * Find payroll by ID
   */
  async findById(
    payrollId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument | null> {
    let query = this.PayrollModel.findById(toObjectId(payrollId));
    
    if (options.session) {
      query = query.session(options.session);
    }
    
    return query.exec();
  }

  /**
   * Find payrolls by employee
   */
  async findByEmployee(
    employeeId: ObjectIdLike,
    organizationId: ObjectIdLike,
    options: { session?: ClientSession; limit?: number } = {}
  ): Promise<PayrollRecordDocument[]> {
    const query = payrollQuery()
      .forEmployee(employeeId)
      .forOrganization(organizationId)
      .build();

    let mongooseQuery = this.PayrollModel.find(query)
      .sort({ 'period.year': -1, 'period.month': -1 })
      .limit(options.limit || 12);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find payrolls for a period
   */
  async findForPeriod(
    organizationId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    const query = payrollQuery()
      .forOrganization(organizationId)
      .forPeriod(month, year)
      .build();

    let mongooseQuery = this.PayrollModel.find(query);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find pending payrolls
   */
  async findPending(
    organizationId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    const query = payrollQuery()
      .forOrganization(organizationId)
      .forPeriod(month, year)
      .pending()
      .build();

    let mongooseQuery = this.PayrollModel.find(query);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Find payroll by employee and period
   */
  async findByEmployeeAndPeriod(
    employeeId: ObjectIdLike,
    organizationId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument | null> {
    const query = payrollQuery()
      .forEmployee(employeeId)
      .forOrganization(organizationId)
      .forPeriod(month, year)
      .build();

    let mongooseQuery = this.PayrollModel.findOne(query);
    
    if (options.session) {
      mongooseQuery = mongooseQuery.session(options.session);
    }
    
    return mongooseQuery.exec();
  }

  /**
   * Create payroll record
   */
  async create(
    data: PayrollData,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    const [payroll] = await this.PayrollModel.create([data], {
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
   */
  async generateForEmployee(
    employeeId: ObjectIdLike,
    organizationId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    const employee = await this.employeeService.findById(employeeId, options);
    if (!employee) {
      throw new Error('Employee not found');
    }

    if (!canReceiveSalary(employee)) {
      throw new Error('Employee not eligible for payroll');
    }

    // Check if payroll already exists
    const existing = await this.findByEmployeeAndPeriod(
      employeeId,
      organizationId,
      month,
      year,
      options
    );
    if (existing) {
      throw new Error('Payroll already exists for this period');
    }

    const payrollData = PayrollFactory.create({
      employeeId,
      organizationId,
      baseAmount: employee.compensation.baseAmount,
      allowances: employee.compensation.allowances || [],
      deductions: employee.compensation.deductions || [],
      period: { month, year },
      metadata: { currency: employee.compensation.currency },
    });

    return this.create(payrollData, options);
  }

  /**
   * Generate batch payroll
   */
  async generateBatch(
    organizationId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<{
    success: boolean;
    generated: number;
    skipped: number;
    payrolls: PayrollRecordDocument[];
    message: string;
  }> {
    const employees = await this.employeeService.findEligibleForPayroll(
      organizationId,
      options
    );

    if (employees.length === 0) {
      return {
        success: true,
        generated: 0,
        skipped: 0,
        payrolls: [],
        message: 'No eligible employees',
      };
    }

    // Get existing payrolls
    const existingPayrolls = await this.findForPeriod(
      organizationId,
      month,
      year,
      options
    );
    const existingEmployeeIds = new Set(
      existingPayrolls.map((p) => p.employeeId.toString())
    );

    // Filter out employees who already have payroll
    const eligibleEmployees = employees.filter(
      (emp) => !existingEmployeeIds.has(emp._id.toString())
    );

    if (eligibleEmployees.length === 0) {
      return {
        success: true,
        generated: 0,
        skipped: employees.length,
        payrolls: [],
        message: 'Payrolls already exist for all employees',
      };
    }

    const payrollsData = BatchPayrollFactory.createBatch(eligibleEmployees, {
      month,
      year,
      organizationId,
    });

    const created = await this.PayrollModel.insertMany(payrollsData, {
      session: options.session,
    });

    logger.info('Batch payroll generated', {
      organizationId: organizationId.toString(),
      month,
      year,
      count: created.length,
    });

    return {
      success: true,
      generated: created.length,
      skipped: existingEmployeeIds.size,
      payrolls: created as PayrollRecordDocument[],
      message: `Generated ${created.length} payrolls`,
    };
  }

  /**
   * Mark payroll as paid
   */
  async markAsPaid(
    payrollId: ObjectIdLike,
    paymentDetails: {
      paidAt?: Date;
      transactionId?: ObjectIdLike;
      paymentMethod?: PaymentMethod;
    } = {},
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    const payroll = await this.findById(payrollId, options);
    if (!payroll) {
      throw new Error('Payroll not found');
    }

    if (payroll.status === 'paid') {
      throw new Error('Payroll already paid');
    }

    const payrollObj = payroll.toObject() as {
      status: string;
      paidAt: Date | null;
      processedAt: Date | null;
      metadata: Record<string, unknown>;
    };
    const updatedData = PayrollFactory.markAsPaid(payrollObj, paymentDetails);

    const updated = await this.PayrollModel.findByIdAndUpdate(
      payrollId,
      updatedData,
      { new: true, runValidators: true, session: options.session }
    );

    if (!updated) {
      throw new Error('Failed to update payroll');
    }

    logger.info('Payroll marked as paid', {
      payrollId: payrollId.toString(),
    });

    return updated;
  }

  /**
   * Mark payroll as processed
   */
  async markAsProcessed(
    payrollId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument> {
    const payroll = await this.findById(payrollId, options);
    if (!payroll) {
      throw new Error('Payroll not found');
    }

    const payrollObj = payroll.toObject() as { status: string; processedAt: Date | null };
    const updatedData = PayrollFactory.markAsProcessed(payrollObj);

    const updated = await this.PayrollModel.findByIdAndUpdate(
      payrollId,
      updatedData,
      { new: true, runValidators: true, session: options.session }
    );

    if (!updated) {
      throw new Error('Failed to update payroll');
    }

    return updated;
  }

  /**
   * Calculate period summary
   */
  async calculatePeriodSummary(
    organizationId: ObjectIdLike,
    month: number,
    year: number,
    options: { session?: ClientSession } = {}
  ): Promise<{
    period: { month: number; year: number };
    count: number;
    totalGross: number;
    totalNet: number;
    totalAllowances: number;
    totalDeductions: number;
    byStatus: Record<string, number>;
  }> {
    const payrolls = await this.findForPeriod(organizationId, month, year, options);
    const summary = BatchPayrollFactory.calculateTotalPayroll(payrolls);

    return {
      period: { month, year },
      ...summary,
      byStatus: this.groupByStatus(payrolls),
    };
  }

  /**
   * Get employee payroll history
   */
  async getEmployeePayrollHistory(
    employeeId: ObjectIdLike,
    organizationId: ObjectIdLike,
    limit = 12,
    options: { session?: ClientSession } = {}
  ): Promise<PayrollRecordDocument[]> {
    return this.findByEmployee(employeeId, organizationId, { ...options, limit });
  }

  /**
   * Get overview stats
   */
  async getOverviewStats(
    organizationId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<{
    currentPeriod: { month: number; year: number };
    count: number;
    totalGross: number;
    totalNet: number;
    totalAllowances: number;
    totalDeductions: number;
    byStatus: Record<string, number>;
  }> {
    const { month, year } = getCurrentPeriod();
    const result = await this.calculatePeriodSummary(organizationId, month, year, options);
    return {
      currentPeriod: result.period,
      count: result.count,
      totalGross: result.totalGross,
      totalNet: result.totalNet,
      totalAllowances: result.totalAllowances,
      totalDeductions: result.totalDeductions,
      byStatus: result.byStatus,
    };
  }

  /**
   * Group payrolls by status
   */
  private groupByStatus(payrolls: PayrollRecordDocument[]): Record<string, number> {
    return payrolls.reduce(
      (acc, payroll) => {
        acc[payroll.status] = (acc[payroll.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create payroll service instance
 */
export function createPayrollService(
  PayrollModel: Model<PayrollRecordDocument>,
  employeeService: EmployeeService
): PayrollService {
  return new PayrollService(PayrollModel, employeeService);
}


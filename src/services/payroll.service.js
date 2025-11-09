/**
 * Payroll Service - Beautiful Payroll Processing
 * Clean abstraction with dependency injection
 */

import {
  PayrollFactory,
  BatchPayrollFactory,
} from '../factories/payroll.factory.js';

import { payroll as payrollQuery } from '../utils/query-builders.js';
import { getCurrentPeriod } from '../utils/date.utils.js';

export class PayrollService {
  constructor(PayrollModel, EmployeeService) {
    this.PayrollModel = PayrollModel;
    this.EmployeeService = EmployeeService;
  }

  async findById(payrollId) {
    return this.PayrollModel.findById(payrollId);
  }

  async findByEmployee(employeeId, organizationId, options = {}) {
    const query = payrollQuery()
      .forEmployee(employeeId)
      .forOrganization(organizationId)
      .build();

    return this.PayrollModel.find(query)
      .sort({ 'period.year': -1, 'period.month': -1 })
      .limit(options.limit || 12);
  }

  async findForPeriod(organizationId, month, year) {
    const query = payrollQuery()
      .forOrganization(organizationId)
      .forPeriod(month, year)
      .build();

    return this.PayrollModel.find(query);
  }

  async findPending(organizationId, month, year) {
    const query = payrollQuery()
      .forOrganization(organizationId)
      .forPeriod(month, year)
      .withStatus('pending')
      .build();

    return this.PayrollModel.find(query);
  }

  async create(data) {
    const payrollData = PayrollFactory.create(data);
    return this.PayrollModel.create(payrollData);
  }

  async generateForEmployee(employeeId, organizationId, month, year) {
    const employee = await this.EmployeeService.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    if (!this.EmployeeService.canReceiveSalary(employee)) {
      throw new Error('Employee not eligible for payroll');
    }

    // Check if payroll already exists
    const existing = await this.findByEmployeeAndPeriod(
      employeeId,
      organizationId,
      month,
      year
    );
    if (existing) throw new Error('Payroll already exists for this period');

    return this.create({
      employeeId,
      organizationId,
      baseAmount: employee.compensation.baseAmount,
      allowances: employee.compensation.allowances || [],
      deductions: employee.compensation.deductions || [],
      period: { month, year },
      metadata: {
        currency: employee.compensation.currency,
      },
    });
  }

  async generateBatch(organizationId, month, year) {
    const employees = await this.EmployeeService.findEligibleForPayroll(
      organizationId,
      month,
      year
    );

    if (employees.length === 0) {
      return { success: true, generated: 0, message: 'No eligible employees' };
    }

    // Filter out employees who already have payroll for this period
    const existingPayrolls = await this.findForPeriod(
      organizationId,
      month,
      year
    );
    const existingEmployeeIds = new Set(
      existingPayrolls.map((p) => p.employeeId.toString())
    );

    const eligibleEmployees = employees.filter(
      (emp) => !existingEmployeeIds.has(emp._id.toString())
    );

    if (eligibleEmployees.length === 0) {
      return {
        success: true,
        generated: 0,
        message: 'Payrolls already exist for all employees',
      };
    }

    const payrolls = BatchPayrollFactory.createBatch(eligibleEmployees, {
      month,
      year,
      organizationId,
    });

    const created = await this.PayrollModel.insertMany(payrolls);

    return {
      success: true,
      generated: created.length,
      payrolls: created,
    };
  }

  async markAsPaid(payrollId, paymentDetails = {}) {
    const payroll = await this.findById(payrollId);
    if (!payroll) throw new Error('Payroll not found');

    if (payroll.status === 'paid') {
      throw new Error('Payroll already paid');
    }

    const updatedPayroll = PayrollFactory.markAsPaid(payroll, paymentDetails);

    return this.PayrollModel.findByIdAndUpdate(
      payrollId,
      updatedPayroll,
      { new: true, runValidators: true }
    );
  }

  async markAsProcessed(payrollId) {
    const payroll = await this.findById(payrollId);
    if (!payroll) throw new Error('Payroll not found');

    const updatedPayroll = PayrollFactory.markAsProcessed(payroll);

    return this.PayrollModel.findByIdAndUpdate(
      payrollId,
      updatedPayroll,
      { new: true, runValidators: true }
    );
  }

  async calculatePeriodSummary(organizationId, month, year) {
    const payrolls = await this.findForPeriod(organizationId, month, year);
    const summary = BatchPayrollFactory.calculateTotalPayroll(payrolls);

    return {
      period: { month, year },
      ...summary,
      byStatus: this.groupByStatus(payrolls),
    };
  }

  async getEmployeePayrollHistory(employeeId, organizationId, limit = 12) {
    return this.findByEmployee(employeeId, organizationId, { limit });
  }

  async findByEmployeeAndPeriod(employeeId, organizationId, month, year) {
    const query = payrollQuery()
      .forEmployee(employeeId)
      .forOrganization(organizationId)
      .forPeriod(month, year)
      .build();

    return this.PayrollModel.findOne(query);
  }

  groupByStatus(payrolls) {
    return payrolls.reduce((acc, payroll) => {
      acc[payroll.status] = (acc[payroll.status] || 0) + 1;
      return acc;
    }, {});
  }

  async getOverviewStats(organizationId) {
    const { month, year } = getCurrentPeriod();
    const currentPeriod = await this.findForPeriod(organizationId, month, year);
    const summary = BatchPayrollFactory.calculateTotalPayroll(currentPeriod);

    return {
      currentPeriod: { month, year },
      ...summary,
      byStatus: this.groupByStatus(currentPeriod),
    };
  }
}

export const createPayrollService = (PayrollModel, EmployeeService) =>
  new PayrollService(PayrollModel, EmployeeService);

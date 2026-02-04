/**
 * @classytic/payroll - Compensation Manager
 *
 * Handles all compensation-related operations:
 * - Salary updates
 * - Allowances (housing, transport, etc.)
 * - Deductions (loans, advances, etc.)
 * - Bank account details
 */

import type { ClientSession } from 'mongoose';
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  AnyDocument,
  LeaveRequestDocument,
  ObjectId,
  ObjectIdLike,
  UpdateSalaryParams,
  AddAllowanceParams,
  RemoveAllowanceParams,
  AddDeductionParams,
  RemoveDeductionParams,
  UpdateBankDetailsParams,
  Compensation,
  Allowance,
  Deduction,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { EmployeeTerminatedError, ValidationError } from '../errors/index.js';
import type { EventBus } from '../core/events.js';
import type { PayrollRepositories } from '../types.js';
import { hasPluginMethod } from '../utils/validation.js';
import type { FindEmployeeFn, ResolveEmployeeIdFn } from './context.js';
import type { RequestScopedServices } from './repository.manager.js';

/**
 * CompensationManager
 *
 * The master of compensation and benefits management. Handles salary
 * updates, allowances, deductions, and banking information.
 *
 * Key responsibilities:
 * - Base salary management
 * - Allowances (recurring/one-time, taxable/non-taxable)
 * - Deductions (manual/automatic)
 * - Bank account updates
 * - Event emission for audit trails
 *
 * @example Updating salary
 * ```typescript
 * const employee = await manager.updateSalary({
 *   employeeId: 'EMP-001',
 *   organizationId,
 *   compensation: {
 *     baseAmount: 150000,
 *     currency: 'USD',
 *   },
 *   effectiveFrom: new Date('2024-01-01'),
 * });
 * ```
 *
 * @example Adding allowance
 * ```typescript
 * const employee = await manager.addAllowance({
 *   employeeId: 'EMP-001',
 *   organizationId,
 *   type: 'housing',
 *   amount: 2000,
 *   recurring: true,
 *   taxable: true,
 * });
 * ```
 */
export class CompensationManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument
> {
  constructor(
    private readonly events: EventBus,
    private readonly resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
    private readonly resolveEmployeeIdFn: ResolveEmployeeIdFn,
    private readonly findEmployeeFn: FindEmployeeFn<TEmployee>,
    private readonly getReposForRequestFn: (orgId: ObjectId) => PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
    private readonly getServicesForRequestFn: (repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>) => RequestScopedServices<TEmployee, TPayrollRecord>
  ) {}

  /**
   * Update employee salary/compensation
   */
  async updateSalary(params: UpdateSalaryParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, compensation, effectiveFrom = new Date(), context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    // Resolve employeeId to ObjectId if it's a string business ID
    const resolvedEmployeeId = await this.resolveEmployeeIdFn(employeeId, employeeIdMode, orgId, context?.session);

    // Get old salary for event (before update)
    const oldEmployee = await this.findEmployeeFn({
      employeeId: resolvedEmployeeId,
      employeeIdMode: 'objectId',  // We resolved it to ObjectId
      organizationId: orgId,
      session: context?.session
    });

    if (oldEmployee.status === 'terminated') {
      throw new EmployeeTerminatedError(oldEmployee.employeeId);
    }

    const oldSalary = oldEmployee.compensation.netSalary;

    // Merge partial compensation update with existing compensation
    const updatedCompensation: Compensation = {
      ...oldEmployee.compensation,
      ...compensation,
      effectiveFrom,
    };

    // Create request-scoped repositories and services
    const repos = this.getReposForRequestFn(orgId);
    const services = this.getServicesForRequestFn(repos);

    const employee = await services.employee.updateCompensation(
      resolvedEmployeeId,
      updatedCompensation,
      { session: context?.session, context }
    );

    // Emit high-level business event
    this.events.emitSync('salary:updated', {
      employee: { id: employee._id, employeeId: employee.employeeId },
      previousSalary: oldSalary || 0,
      newSalary: employee.compensation.netSalary || 0,
      effectiveFrom,
      organizationId: employee.organizationId,
      context,
    });

    // Note: Detailed logging already done by EmployeeService

    return employee as TEmployee;
  }

  /**
   * Add allowance to employee
   */
  async addAllowance(params: AddAllowanceParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, amount, isPercentage, value, taxable = true, recurring = true, effectiveFrom = new Date(), effectiveTo, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    if (employee.status === 'terminated') {
      throw new EmployeeTerminatedError(employee.employeeId);
    }

    if (!employee.compensation.allowances) {
      employee.compensation.allowances = [];
    }

    employee.compensation.allowances.push({
      type,
      name: type,
      amount,
      isPercentage,
      value,
      taxable,
      recurring,
      effectiveFrom,
      effectiveTo,
    });

    if (hasPluginMethod(employee, 'updateSalaryCalculations')) {
      (employee as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
    }
    await employee.save({ session });

    getLogger().info('Allowance added', {
      employeeId: employee.employeeId,
      type,
      amount,
    });

    return employee as TEmployee;
  }

  /**
   * Remove allowance from employee
   */
  async removeAllowance(params: RemoveAllowanceParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    const before = employee.compensation.allowances?.length || 0;

    if (hasPluginMethod(employee, 'removeAllowance')) {
      (employee as unknown as { removeAllowance: (type: string) => void }).removeAllowance(type);
    } else {
      // Fallback if plugin not applied
      if (employee.compensation.allowances) {
        employee.compensation.allowances = employee.compensation.allowances.filter(
          (a: Allowance) => a.type !== type
        );
      }
    }

    const after = employee.compensation.allowances?.length || 0;

    if (before === after) {
      throw new ValidationError(`Allowance type '${type}' not found`);
    }

    await employee.save({ session });

    getLogger().info('Allowance removed', {
      employeeId: employee.employeeId,
      type,
    });

    return employee as TEmployee;
  }

  /**
   * Add deduction to employee
   */
  async addDeduction(params: AddDeductionParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, amount, isPercentage, value, auto = false, recurring = true, description, effectiveFrom = new Date(), effectiveTo, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    if (employee.status === 'terminated') {
      throw new EmployeeTerminatedError(employee.employeeId);
    }

    if (!employee.compensation.deductions) {
      employee.compensation.deductions = [];
    }

    employee.compensation.deductions.push({
      type,
      name: type,
      amount,
      isPercentage,
      value,
      auto,
      recurring,
      description,
      effectiveFrom,
      effectiveTo,
    });

    if (hasPluginMethod(employee, 'updateSalaryCalculations')) {
      (employee as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
    }
    await employee.save({ session });

    getLogger().info('Deduction added', {
      employeeId: employee.employeeId,
      type,
      amount,
      auto,
    });

    return employee as TEmployee;
  }

  /**
   * Remove deduction from employee
   */
  async removeDeduction(params: RemoveDeductionParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    const before = employee.compensation.deductions?.length || 0;

    if (hasPluginMethod(employee, 'removeDeduction')) {
      (employee as unknown as { removeDeduction: (type: string) => void }).removeDeduction(type);
    } else {
      // Fallback if plugin not applied
      if (employee.compensation.deductions) {
        employee.compensation.deductions = employee.compensation.deductions.filter(
          (d: Deduction) => d.type !== type
        );
      }
    }

    const after = employee.compensation.deductions?.length || 0;

    if (before === after) {
      throw new ValidationError(`Deduction type '${type}' not found`);
    }

    await employee.save({ session });

    getLogger().info('Deduction removed', {
      employeeId: employee.employeeId,
      type,
    });

    return employee as TEmployee;
  }

  /**
   * Update bank details
   */
  async updateBankDetails(params: UpdateBankDetailsParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, bankDetails, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    employee.bankDetails = { ...employee.bankDetails, ...bankDetails };
    await employee.save({ session });

    getLogger().info('Bank details updated', {
      employeeId: employee.employeeId,
    });

    return employee as TEmployee;
  }
}

/**
 * Factory function for creating CompensationManager
 */
export function createCompensationManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument
>(
  events: EventBus,
  resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
  resolveEmployeeIdFn: ResolveEmployeeIdFn,
  findEmployeeFn: FindEmployeeFn<TEmployee>,
  getReposForRequestFn: (orgId: ObjectId) => PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
  getServicesForRequestFn: (repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>) => RequestScopedServices<TEmployee, TPayrollRecord>
): CompensationManager<TEmployee, TPayrollRecord, TTransaction> {
  return new CompensationManager(
    events,
    resolveOrganizationIdFn,
    resolveEmployeeIdFn,
    findEmployeeFn,
    getReposForRequestFn,
    getServicesForRequestFn
  );
}

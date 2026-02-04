/**
 * @classytic/payroll - Employee Operations Manager
 *
 * Handles the complete employee lifecycle:
 * - Hiring new employees
 * - Updating employment details
 * - Terminating employees
 * - Re-hiring terminated employees
 * - Employee retrieval and lookups
 */

import type { ClientSession } from 'mongoose';
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  AnyDocument,
  LeaveRequestDocument,
  ObjectId,
  ObjectIdLike,
  HireEmployeeParams,
  UpdateEmploymentParams,
  TerminateEmployeeParams,
  ReHireEmployeeParams,
  OperationContext,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { ValidationError, EmployeeTerminatedError } from '../errors/index.js';
import type { EventBus } from '../core/events.js';
import type { HRMConfig } from '../types.js';
import type { PayrollRepositories } from '../types.js';
import type { FindEmployeeFn } from './context.js';
import type { RequestScopedServices } from './repository.manager.js';

/**
 * EmployeeOperationsManager
 *
 * The master of employee lifecycle management. Handles all operations
 * from hiring to termination with proper validation and event emission.
 *
 * Key responsibilities:
 * - Employee onboarding (hire)
 * - Employment updates
 * - Employee termination
 * - Re-hiring terminated employees
 * - Employee retrieval
 *
 * @example Hiring an employee
 * ```typescript
 * const employee = await manager.hire({
 *   organizationId,
 *   userId: user._id,
 *   employment: {
 *     employeeId: 'EMP-001',
 *     position: 'Software Engineer',
 *     department: 'Engineering',
 *     hireDate: new Date(),
 *   },
 *   compensation: {
 *     baseAmount: 120000,
 *     currency: 'USD',
 *     type: 'salary',
 *     payFrequency: 'monthly',
 *   },
 * });
 * ```
 *
 * @example Terminating an employee
 * ```typescript
 * const terminated = await manager.terminate({
 *   employeeId: 'EMP-001',
 *   organizationId,
 *   terminationDate: new Date(),
 *   reason: 'resignation',
 *   notes: 'Accepted position elsewhere',
 * });
 * ```
 */
export class EmployeeOperationsManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument
> {
  constructor(
    private readonly events: EventBus,
    private readonly config: HRMConfig,
    private readonly resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
    private readonly findEmployeeFn: FindEmployeeFn<TEmployee>,
    private readonly getReposForRequestFn: (orgId: ObjectId) => PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
    private readonly getServicesForRequestFn: (repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>) => RequestScopedServices<TEmployee, TPayrollRecord>
  ) {}

  /**
   * Hire a new employee
   */
  async hire(params: HireEmployeeParams): Promise<TEmployee> {
    const { userId, employment, compensation, bankDetails, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(params.organizationId);

    // Validate identity based on config (keep in Payroll for public API validation)
    if (this.config.validation.requireUserId && !userId) {
      throw new ValidationError(
        'userId is required (set validation.requireUserId: false to allow guest employees)',
        { field: 'userId' }
      );
    }

    // Ensure at least one identity field is provided
    if (!userId && !employment.email && !employment.employeeId) {
      throw new ValidationError(
        'At least one identity field required: userId, email, or employeeId'
      );
    }

    // Create request-scoped repositories and services
    const repos = this.getReposForRequestFn(orgId);
    const services = this.getServicesForRequestFn(repos);

    const employee = await services.employee.create({
      userId,
      organizationId: orgId,
      employment,
      compensation: {
        ...compensation,
        currency: compensation.currency || this.config.payroll.defaultCurrency,
      },
      bankDetails,
    }, {
      session: context?.session,
    });

    // Emit high-level business event
    this.events.emitSync('employee:hired', {
      employee: {
        id: employee._id,
        employeeId: employee.employeeId,
        position: employee.position,
        department: employee.department,
      },
      organizationId: employee.organizationId,
      context,
    });

    // Note: Detailed logging already done by EmployeeService

    return employee as TEmployee;
  }

  /**
   * Update employment details
   * NOTE: Status changes to 'terminated' must use terminate() method
   */
  async updateEmployment(params: UpdateEmploymentParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, updates, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    if (employee.status === 'terminated') {
      throw new EmployeeTerminatedError(employee.employeeId);
    }

    // IMPORTANT: Block direct status change to 'terminated' - must use terminate()
    if (updates.status === 'terminated') {
      throw new ValidationError(
        'Cannot set status to terminated directly. Use the terminate() method instead to ensure proper history tracking.',
        { field: 'status' }
      );
    }

    const allowedUpdates = ['department', 'position', 'employmentType', 'status', 'workSchedule'];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        (employee as unknown as Record<string, unknown>)[key] = value;
      }
    }

    await employee.save({ session });

    getLogger().info('Employee updated', {
      employeeId: employee.employeeId,
      updates: Object.keys(updates),
    });

    return employee as TEmployee;
  }

  /**
   * Terminate employee
   */
  async terminate(params: TerminateEmployeeParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, terminationDate = new Date(), reason = 'resignation', notes, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    // Create request-scoped repositories and services
    const repos = this.getReposForRequestFn(orgId);
    const services = this.getServicesForRequestFn(repos);

    // Use EmployeeService.terminate instead of document methods
    const terminated = await services.employee.terminate(
      employee._id,
      terminationDate,
      {
        session,
        reason,
        context
      }
    );

    // Add notes if provided
    if (notes) {
      const updatedNotes = (terminated.notes || '') + `\nTermination: ${notes}`;
      await repos.employee.update(
        terminated._id,
        { notes: updatedNotes },
        { session }
      );
    }

    // Emit event
    this.events.emitSync('employee:terminated', {
      employee: {
        id: terminated._id,
        employeeId: terminated.employeeId,
      },
      terminationDate,
      reason,
      organizationId: terminated.organizationId,
      context,
    });

    getLogger().info('Employee terminated', {
      employeeId: terminated.employeeId,
      reason,
    });

    return terminated as TEmployee;
  }

  /**
   * Re-hire terminated employee
   */
  async reHire(params: ReHireEmployeeParams): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, hireDate = new Date(), position, department, compensation, context } = params;

    if (!this.config.employment.allowReHiring) {
      throw new Error('Re-hiring is not enabled');
    }

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const session = context?.session;

    // SECURE: Use secure lookup with organizationId isolation
    const employee = await this.findEmployeeFn({
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session
    });

    // Create request-scoped repositories and services
    const repos = this.getReposForRequestFn(orgId);
    const services = this.getServicesForRequestFn(repos);

    // Use EmployeeService.reHire instead of document methods
    const rehired = await services.employee.reHire(
      employee._id,
      {
        session,
        context
      }
    );

    // Update position, department, and compensation if provided
    const updates: Record<string, unknown> = {};
    if (position) updates.position = position;
    if (department) updates.department = department;
    if (compensation) {
      updates.compensation = { ...rehired.compensation, ...compensation };
    }
    if (hireDate) updates.hireDate = hireDate;

    let updated = rehired;
    if (Object.keys(updates).length > 0) {
      updated = await repos.employee.update(
        rehired._id,
        updates,
        { session }
      );
    }

    // Emit event
    this.events.emitSync('employee:rehired', {
      employee: {
        id: updated._id,
        employeeId: updated.employeeId,
        position: updated.position,
      },
      organizationId: updated.organizationId,
      context,
    });

    getLogger().info('Employee re-hired', {
      employeeId: updated.employeeId,
    });

    return updated as TEmployee;
  }

  /**
   * Get employee by ID
   */
  async getEmployee(params: {
    employeeId: ObjectIdLike | string;
    employeeIdMode?: 'auto' | 'objectId' | 'businessId';
    organizationId?: ObjectIdLike;
    populateUser?: boolean;
    session?: ClientSession;
    context?: OperationContext;
  }): Promise<TEmployee> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, populateUser = true, session, context } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    const employee = await this.findEmployeeFn({
      employeeId,
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId: orgId,
      session,
      populate: populateUser ? 'userId' : undefined
    });

    // No post-fetch validation needed - query-level filtering ensures organizational isolation
    return employee as TEmployee;
  }
}

/**
 * Factory function for creating EmployeeOperationsManager
 */
export function createEmployeeOperationsManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument
>(
  events: EventBus,
  config: HRMConfig,
  resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
  findEmployeeFn: FindEmployeeFn<TEmployee>,
  getReposForRequestFn: (orgId: ObjectId) => PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
  getServicesForRequestFn: (repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>) => RequestScopedServices<TEmployee, TPayrollRecord>
): EmployeeOperationsManager<TEmployee, TPayrollRecord, TTransaction> {
  return new EmployeeOperationsManager(
    events,
    config,
    resolveOrganizationIdFn,
    findEmployeeFn,
    getReposForRequestFn,
    getServicesForRequestFn
  );
}

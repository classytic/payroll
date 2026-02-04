/**
 * @classytic/payroll - Repository Manager
 *
 * Handles per-request repository creation with proper multi-tenant isolation.
 * Repositories are created fresh for each request with organizationId-scoped plugins.
 */

import { Repository } from '@classytic/mongokit';
import type { Model, ClientSession } from 'mongoose';
import type { Container } from '../core/container.js';
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  LeaveRequestDocument,
  TaxWithholdingDocument,
  AnyDocument
} from '../types.js';
import { multiTenantPlugin } from '../core/repository-plugins.js';
import { EmployeeService, createEmployeeService } from '../services/employee.service.js';
import { PayrollService, createPayrollService } from '../services/payroll.service.js';
import { CompensationService, createCompensationService } from '../services/compensation.service.js';
import type { ObjectId } from '../types.js';

/**
 * Repository collection for a single request
 */
export interface RequestScopedRepositories<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument
> {
  employee: Repository<TEmployee>;
  payrollRecord: Repository<TPayrollRecord>;
  transaction: Repository<TTransaction>;
  leaveRequest?: Repository<TLeaveRequest>;
  taxWithholding?: Repository<TTaxWithholding>;
}

/**
 * Service collection for a single request
 */
export interface RequestScopedServices<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument
> {
  employee: EmployeeService<TEmployee>;
  payroll: PayrollService<TPayrollRecord, TEmployee>;
  compensation: CompensationService<TEmployee>;
}

/**
 * Models configuration
 */
export interface ModelsConfig<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument
> {
  EmployeeModel: Model<TEmployee>;
  PayrollRecordModel: Model<TPayrollRecord>;
  TransactionModel: Model<TTransaction>;
  AttendanceModel?: Model<AnyDocument> | null;
  LeaveRequestModel?: Model<TLeaveRequest> | null;
  TaxWithholdingModel?: Model<TTaxWithholding> | null;
}

/**
 * RepositoryManager
 *
 * Creates per-request repositories with organizationId-scoped plugins.
 * This ensures proper multi-tenant isolation at the database query level.
 *
 * Key Features:
 * - Per-request scope (no cached state)
 * - Multi-tenant security via plugins
 * - Audit trail support
 * - Service layer creation
 *
 * @example
 * ```typescript
 * const manager = new RepositoryManager(models, container);
 *
 * // Create repositories for a specific request/organizationId
 * const repos = manager.getReposForRequest(organizationId);
 *
 * // Use the scoped repository
 * const employee = await repos.employee.getById(employeeId);
 * // ^ This query automatically includes: { organizationId }
 * ```
 */
export class RepositoryManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument
> {
  constructor(
    private readonly models: ModelsConfig<TEmployee, TPayrollRecord, TTransaction, TLeaveRequest, TTaxWithholding>,
    // TODO(@classytic/payroll): Container reserved for future audit/plugin integration
    private readonly _container: Container<TEmployee, TPayrollRecord, TTransaction, AnyDocument>
  ) {}

  /**
   * Create request-scoped repositories with organizationId filtering
   *
   * SECURITY: Each repository is created with multiTenantPlugin that injects
   * organizationId into ALL queries, ensuring database-level multi-tenant isolation.
   *
   * @param organizationId - Organization ID for this request
   * @returns Fresh repository instances scoped to this organizationId
   */
  getReposForRequest(organizationId: ObjectId): RequestScopedRepositories<TEmployee, TPayrollRecord, TTransaction, TLeaveRequest, TTaxWithholding> {
    // Create plugins for this request
    // SECURITY: multiTenantPlugin enforces organizationId on ALL queries
    const plugins = [
      multiTenantPlugin(organizationId),
    ];

    // Create fresh repository instances (no caching)
    // SECURITY: All repositories get multi-tenant plugin to enforce org isolation
    const repos: RequestScopedRepositories<TEmployee, TPayrollRecord, TTransaction, TLeaveRequest, TTaxWithholding> = {
      employee: new Repository(this.models.EmployeeModel, plugins),
      payrollRecord: new Repository(this.models.PayrollRecordModel, plugins),
      transaction: new Repository(this.models.TransactionModel, plugins), // SECURITY: Transactions are org-scoped
    };

    // Optional models
    if (this.models.LeaveRequestModel) {
      repos.leaveRequest = new Repository(this.models.LeaveRequestModel, plugins);
    }

    if (this.models.TaxWithholdingModel) {
      repos.taxWithholding = new Repository(this.models.TaxWithholdingModel, plugins);
    }

    return repos;
  }

  /**
   * Create request-scoped services
   *
   * Services wrap repositories with business logic and are also request-scoped.
   *
   * @param organizationId - Organization ID for this request
   * @param session - Optional transaction session
   * @returns Fresh service instances
   */
  getServicesForRequest(
    organizationId: ObjectId,
    _session?: ClientSession // TODO(@classytic/payroll): Session support for service-level transactions
  ): RequestScopedServices<TEmployee, TPayrollRecord, TLeaveRequest> {
    const repos = this.getReposForRequest(organizationId);
    const employeeService = createEmployeeService(repos.employee);

    return {
      employee: employeeService,
      payroll: createPayrollService(repos.payrollRecord, employeeService),
      compensation: createCompensationService(repos.employee),
    };
  }

  /**
   * Get models (for direct access when needed)
   */
  getModels(): ModelsConfig<TEmployee, TPayrollRecord, TTransaction, TLeaveRequest, TTaxWithholding> {
    return this.models;
  }
}

/**
 * Factory function for creating RepositoryManager
 *
 * @param models - Model configuration
 * @param container - Container instance
 * @returns RepositoryManager instance
 */
export function createRepositoryManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument
>(
  models: ModelsConfig<TEmployee, TPayrollRecord, TTransaction, TLeaveRequest, TTaxWithholding>,
  container: Container<TEmployee, TPayrollRecord, TTransaction, AnyDocument>
): RepositoryManager<TEmployee, TPayrollRecord, TTransaction, TLeaveRequest, TTaxWithholding> {
  return new RepositoryManager(models, container);
}

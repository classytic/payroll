/**
 * @classytic/payroll - Manager Context Types
 *
 * Unified context interfaces for manager classes.
 * This reduces constructor parameter complexity and improves testability.
 *
 * ## Design Decision
 *
 * Instead of passing 10+ individual parameters to manager constructors,
 * we group related dependencies into context objects. This provides:
 *
 * 1. **Better testability** - Easy to mock/stub entire context
 * 2. **Cleaner signatures** - Single context param vs many individual params
 * 3. **Future flexibility** - Add new dependencies without changing signatures
 * 4. **Self-documenting** - Context interfaces describe dependencies
 *
 * ## Migration Path
 *
 * Existing factory functions remain unchanged for backwards compatibility.
 * New code should prefer context-based construction:
 *
 * ```typescript
 * // Legacy (still supported)
 * const manager = createSalaryProcessingManager(
 *   models, container, events, idempotency, ...8 more params
 * );
 *
 * // Preferred (future)
 * const manager = new SalaryProcessingManager(context);
 * ```
 */

import type { Model, ClientSession } from 'mongoose';
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  AnyDocument,
  ObjectId,
  ObjectIdLike,
  HRMConfig,
  PayrollRepositories,
} from '../types.js';
import type { EventBus } from '../core/events.js';
import type { IdempotencyManager } from '../core/idempotency.js';
import type { Container } from '../core/container.js';
import type { RepositoryManager } from './repository.manager.js';

// ============================================================================
// Model Containers
// ============================================================================

/**
 * Core models required by most managers
 */
export interface CoreModels<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
> {
  EmployeeModel: Model<TEmployee>;
  PayrollRecordModel: Model<TPayrollRecord>;
  TransactionModel: Model<TTransaction>;
}

/**
 * Optional models for extended functionality
 */
export interface OptionalModels<TAttendance extends AnyDocument = AnyDocument> {
  AttendanceModel?: Model<TAttendance> | null;
  LeaveRequestModel?: Model<any> | null;
  TaxWithholdingModel?: Model<any> | null;
}

/**
 * All models combined
 */
export interface AllModels<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> extends CoreModels<TEmployee, TPayrollRecord, TTransaction>,
    OptionalModels<TAttendance> {}

// ============================================================================
// Resolution Functions
// ============================================================================

/**
 * Function to resolve organization ID with security checks
 */
export type ResolveOrganizationIdFn = (providedOrgId?: ObjectIdLike) => ObjectId;

/**
 * Function to resolve employee ID (handles dual ID system)
 */
export type ResolveEmployeeIdFn = (
  employeeId: ObjectIdLike | string,
  employeeIdMode: 'auto' | 'objectId' | 'businessId' | undefined,
  organizationId: ObjectIdLike,
  session?: ClientSession
) => Promise<import('mongoose').Types.ObjectId>;

/**
 * Function to find employee with multi-tenant security
 */
export type FindEmployeeFn<TEmployee extends EmployeeDocument = EmployeeDocument> = (
  options: import('../utils/employee-lookup.js').SecureEmployeeLookupOptions
) => Promise<TEmployee>;

/**
 * Function to update employee payroll stats
 */
export type UpdatePayrollStatsFn<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
> = (
  employee: EmployeeDocument,
  amount: number,
  paymentDate: Date,
  repos: PayrollRepositories<TEmployee, TPayrollRecord, any, TTransaction>,
  session?: ClientSession
) => Promise<void>;

/**
 * Function to get request-scoped repositories
 */
export type GetReposForRequestFn<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
> = (orgId: ObjectId) => PayrollRepositories<TEmployee, TPayrollRecord, any, TTransaction>;

// ============================================================================
// Manager Contexts
// ============================================================================

/**
 * Base context shared by all managers
 */
export interface BaseManagerContext {
  /** Event bus for emitting events */
  events: EventBus;
  /** Configuration */
  config: HRMConfig;
}

/**
 * Context for SalaryProcessingManager
 *
 * Groups all dependencies needed for salary processing.
 *
 * @example
 * ```typescript
 * const context: SalaryProcessingContext = {
 *   models: { EmployeeModel, PayrollRecordModel, TransactionModel },
 *   container,
 *   events,
 *   idempotency,
 *   repositoryManager,
 *   resolvers: {
 *     resolveOrganizationId: (orgId) => toObjectId(orgId),
 *     resolveEmployeeId: async (id, mode, orgId) => { ... },
 *     findEmployee: async (opts) => { ... },
 *     updatePayrollStats: async (emp, amt, date, repos) => { ... },
 *   },
 *   config,
 *   calculateSalaryBreakdown: async (emp, period, input) => { ... },
 * };
 * ```
 */
export interface SalaryProcessingContext<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> extends BaseManagerContext {
  /** All models */
  models: AllModels<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  /** Dependency container */
  container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  /** Idempotency manager */
  idempotency: IdempotencyManager;
  /** Repository manager */
  repositoryManager: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>;
  /** Resolution functions */
  resolvers: {
    resolveOrganizationId: ResolveOrganizationIdFn;
    resolveEmployeeId: ResolveEmployeeIdFn;
    findEmployee: FindEmployeeFn<TEmployee>;
    updatePayrollStats: UpdatePayrollStatsFn<TEmployee, TPayrollRecord, TTransaction>;
  };
  /** Salary calculation function */
  calculateSalaryBreakdown: (
    employee: EmployeeDocument,
    period: { month: number; year: number; startDate: Date; endDate: Date; payDate: Date },
    input: { attendance?: any; options?: any },
    session?: ClientSession
  ) => Promise<import('../types.js').PayrollBreakdown>;
}

/**
 * Context for EmployeeOperationsManager
 */
export interface EmployeeOperationsContext<
  TEmployee extends EmployeeDocument = EmployeeDocument,
> extends BaseManagerContext {
  /** Resolution functions */
  resolvers: {
    resolveOrganizationId: ResolveOrganizationIdFn;
    findEmployee: FindEmployeeFn<TEmployee>;
    getReposForRequest: GetReposForRequestFn<TEmployee, any, any>;
  };
}

/**
 * Context for CompensationManager
 */
export interface CompensationContext<
  TEmployee extends EmployeeDocument = EmployeeDocument,
> extends BaseManagerContext {
  /** Resolution functions */
  resolvers: {
    resolveOrganizationId: ResolveOrganizationIdFn;
    resolveEmployeeId: ResolveEmployeeIdFn;
    findEmployee: FindEmployeeFn<TEmployee>;
    getReposForRequest: GetReposForRequestFn<TEmployee, any, any>;
  };
}

/**
 * Context for BulkOperationsManager
 */
export interface BulkOperationsContext<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> extends BaseManagerContext {
  /** Core models */
  models: CoreModels<TEmployee, TPayrollRecord, TTransaction> & OptionalModels<TAttendance>;
  /** Process salary function (delegates to SalaryProcessingManager) */
  processSalary: (
    params: import('../types.js').ProcessSalaryParams
  ) => Promise<import('../types.js').ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>>;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Re-export for convenience
};

/**
 * @classytic/payroll - Managers
 *
 * Manager classes that extract business logic from the main Payroll class.
 * Each manager handles a specific domain of functionality.
 */

// ============================================================================
// Manager Context Types (for cleaner dependency injection)
// ============================================================================

export type {
  CoreModels,
  OptionalModels,
  AllModels,
  ResolveOrganizationIdFn,
  ResolveEmployeeIdFn,
  FindEmployeeFn,
  UpdatePayrollStatsFn,
  GetReposForRequestFn,
  BaseManagerContext,
  SalaryProcessingContext,
  EmployeeOperationsContext,
  CompensationContext,
  BulkOperationsContext,
} from './context.js';

// ============================================================================
// Managers
// ============================================================================

export {
  RepositoryManager,
  createRepositoryManager,
  type RequestScopedRepositories,
  type RequestScopedServices,
  type ModelsConfig as RepositoryModelsConfig,
} from './repository.manager.js';

export {
  SalaryProcessingManager,
  createSalaryProcessingManager,
} from './salary-processing.manager.js';

export {
  BulkOperationsManager,
  createBulkOperationsManager,
} from './bulk-operations.manager.js';

export {
  EmployeeOperationsManager,
  createEmployeeOperationsManager,
} from './employee-operations.manager.js';

export {
  CompensationManager,
  createCompensationManager,
} from './compensation.manager.js';

export {
  PayrollHistoryManager,
  createPayrollHistoryManager,
} from './payroll-history.manager.js';

export {
  PayrollStateManager,
  createPayrollStateManager,
} from './payroll-state.manager.js';

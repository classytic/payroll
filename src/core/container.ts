/**
 * @classytic/payroll - Dependency Container
 *
 * Per-instance dependency injection container for service management.
 * Enables clean dependency injection and testing without global state.
 *
 * IMPORTANT: This container is instance-based (not a singleton) to support:
 * - Serverless/Lambda environments
 * - Multi-app runtimes
 * - Parallel testing
 * - Multiple Payroll instances in the same process
 */

import type { Model, ClientSession } from 'mongoose';
import type {
  Logger,
  HRMConfig,
  SingleTenantConfig,
  EmployeeDocument,
  PayrollRecordDocument,
  AnyDocument,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { HRM_CONFIG, mergeConfig } from '../config.js';

// ============================================================================
// Container Types with Strong Generics
// ============================================================================

/**
 * Strongly-typed models container
 * Uses specific document types instead of Model<any> for better DX
 */
export interface ModelsContainer<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> {
  EmployeeModel: Model<TEmployee>;
  PayrollRecordModel: Model<TPayrollRecord>;
  TransactionModel: Model<TTransaction>;
  AttendanceModel?: Model<TAttendance> | null;
}

/**
 * Container configuration with generic model types
 */
export interface ContainerConfig<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> {
  models: ModelsContainer<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  config?: Partial<HRMConfig>;
  singleTenant?: SingleTenantConfig | null;
  logger?: Logger;
}

// ============================================================================
// Container Class (Per-Instance, Not Singleton)
// ============================================================================

/**
 * Per-instance DI Container for Payroll
 *
 * Each Payroll instance creates its own Container, avoiding global state issues
 * in serverless and multi-app environments.
 *
 * @example
 * ```typescript
 * // Each Payroll instance has its own container
 * const payroll1 = createPayrollInstance()
 *   .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
 *   .build();
 *
 * const payroll2 = createPayrollInstance()
 *   .withModels({ OtherEmployeeModel, OtherPayrollModel, OtherTransactionModel })
 *   .build();
 *
 * // They don't share state - perfect for multi-tenant or testing
 * ```
 */
export class Container<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> {
  private _models: ModelsContainer<TEmployee, TPayrollRecord, TTransaction, TAttendance> | null = null;
  private _config: HRMConfig = HRM_CONFIG;
  private _singleTenant: SingleTenantConfig | null = null;
  private _logger: Logger;
  private _initialized = false;

  constructor() {
    this._logger = getLogger();
  }

  /**
   * Initialize container with configuration
   */
  initialize(
    config: ContainerConfig<TEmployee, TPayrollRecord, TTransaction, TAttendance>
  ): void {
    if (this._initialized) {
      this._logger.warn('Container already initialized, re-initializing');
    }

    this._models = config.models;
    this._config = mergeConfig(config.config);
    this._singleTenant = config.singleTenant ?? null;

    if (config.logger) {
      this._logger = config.logger;
    }

    this._initialized = true;

    this._logger.info('Container initialized', {
      hasEmployeeModel: !!this._models.EmployeeModel,
      hasPayrollRecordModel: !!this._models.PayrollRecordModel,
      hasTransactionModel: !!this._models.TransactionModel,
      hasAttendanceModel: !!this._models.AttendanceModel,
      isSingleTenant: !!this._singleTenant,
    });
  }

  /**
   * Check if container is initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Reset container (useful for testing)
   */
  reset(): void {
    this._models = null;
    this._config = HRM_CONFIG;
    this._singleTenant = null;
    this._initialized = false;
    this._logger.info('Container reset');
  }

  /**
   * Ensure container is initialized
   */
  private ensureInitialized(): void {
    if (!this._initialized || !this._models) {
      throw new Error(
        'Payroll not initialized. Call Payroll.initialize() first.'
      );
    }
  }

  /**
   * Get models container (strongly typed)
   */
  getModels(): ModelsContainer<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
    this.ensureInitialized();
    return this._models!;
  }

  /**
   * Get Employee model (strongly typed)
   */
  getEmployeeModel(): Model<TEmployee> {
    this.ensureInitialized();
    return this._models!.EmployeeModel;
  }

  /**
   * Get PayrollRecord model (strongly typed)
   */
  getPayrollRecordModel(): Model<TPayrollRecord> {
    this.ensureInitialized();
    return this._models!.PayrollRecordModel;
  }

  /**
   * Get Transaction model (strongly typed)
   */
  getTransactionModel(): Model<TTransaction> {
    this.ensureInitialized();
    return this._models!.TransactionModel;
  }

  /**
   * Get Attendance model (optional, strongly typed)
   */
  getAttendanceModel(): Model<TAttendance> | null {
    this.ensureInitialized();
    return this._models!.AttendanceModel ?? null;
  }

  /**
   * Get configuration
   */
  getConfig(): HRMConfig {
    return this._config;
  }

  /**
   * Get specific config section
   */
  getConfigSection<K extends keyof HRMConfig>(section: K): HRMConfig[K] {
    return this._config[section];
  }

  /**
   * Check if single-tenant mode
   */
  isSingleTenant(): boolean {
    return !!this._singleTenant;
  }

  /**
   * Get single-tenant config
   */
  getSingleTenantConfig(): SingleTenantConfig | null {
    return this._singleTenant;
  }

  /**
   * Get organization ID (for single-tenant mode)
   */
  getOrganizationId(): string | null {
    if (!this._singleTenant || !this._singleTenant.organizationId) return null;
    return typeof this._singleTenant.organizationId === 'string'
      ? this._singleTenant.organizationId
      : this._singleTenant.organizationId.toString();
  }

  /**
   * Get logger
   */
  getLogger(): Logger {
    return this._logger;
  }

  /**
   * Set logger
   */
  setLogger(logger: Logger): void {
    this._logger = logger;
  }

  /**
   * Has attendance integration
   */
  hasAttendanceIntegration(): boolean {
    return (
      !!this._models?.AttendanceModel &&
      this._config.payroll.attendanceIntegration
    );
  }

  /**
   * Create operation context with defaults
   */
  createOperationContext(
    overrides?: Partial<{
      userId: string;
      userName: string;
      userRole: string;
      organizationId: string;
      session: ClientSession;
    }>
  ): {
    userId?: string;
    userName?: string;
    userRole?: string;
    organizationId?: string;
    session?: ClientSession;
  } {
    const context: Record<string, unknown> = {};

    // Auto-inject organizationId in single-tenant mode
    if (this._singleTenant?.autoInject && !overrides?.organizationId) {
      context.organizationId = this.getOrganizationId();
    }

    return { ...context, ...overrides };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Container instance
 */
export function createContainer<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
>(): Container<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
  return new Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>();
}

// ============================================================================
// Default Instance (for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use createPayrollInstance() instead for new code.
 * This default instance is kept for backwards compatibility but should be avoided
 * in serverless/multi-app environments.
 *
 * WARNING: Global singletons can cause issues in:
 * - AWS Lambda (cold starts may share state)
 * - Vercel Functions
 * - Multiple app instances in same process
 * - Parallel tests
 */
let defaultContainer: Container | null = null;

/**
 * @deprecated Use createPayrollInstance() instead.
 * Get or create the default container instance.
 */
export function getContainer(): Container {
  if (!defaultContainer) {
    defaultContainer = new Container();
  }
  return defaultContainer;
}

/**
 * @deprecated Use createPayrollInstance() instead.
 * Initialize the default container.
 */
export function initializeContainer(config: ContainerConfig): void {
  getContainer().initialize(config);
}

/**
 * @deprecated Use container.isInitialized() instead.
 * Check if the default container is initialized.
 */
export function isContainerInitialized(): boolean {
  return defaultContainer?.isInitialized() ?? false;
}

/**
 * @deprecated Use container.getModels() instead.
 * Get models from the default container.
 */
export function getModels(): ModelsContainer {
  return getContainer().getModels();
}

/**
 * @deprecated Use container.getConfig() instead.
 * Get config from the default container.
 */
export function getConfig(): HRMConfig {
  return getContainer().getConfig();
}

/**
 * @deprecated Use container.isSingleTenant() instead.
 * Check if single-tenant mode.
 */
export function isSingleTenant(): boolean {
  return getContainer().isSingleTenant();
}

/**
 * Reset the default container (for testing).
 * @deprecated Prefer instance-based containers for testing.
 */
export function resetDefaultContainer(): void {
  if (defaultContainer) {
    defaultContainer.reset();
  }
  defaultContainer = null;
}

// Legacy alias for backwards compatibility
export { resetDefaultContainer as resetContainer };

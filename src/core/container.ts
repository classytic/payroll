/**
 * @classytic/payroll - Dependency Container
 *
 * Simple dependency injection container for service management
 * Enables clean dependency injection and testing
 */

import type { Model, ClientSession } from 'mongoose';
import type { Logger, HRMConfig, SingleTenantConfig } from '../types.js';
import { getLogger } from '../utils/logger.js';
import { HRM_CONFIG, mergeConfig } from '../config.js';

// ============================================================================
// Container Types
// ============================================================================

export interface ModelsContainer {
  EmployeeModel: Model<any>;
  PayrollRecordModel: Model<any>;
  TransactionModel: Model<any>;
  AttendanceModel?: Model<any> | null;
}

export interface ContainerConfig {
  models: ModelsContainer;
  config?: Partial<HRMConfig>;
  singleTenant?: SingleTenantConfig | null;
  logger?: Logger;
}

// ============================================================================
// Container Class
// ============================================================================

export class Container {
  private static instance: Container | null = null;
  
  private _models: ModelsContainer | null = null;
  private _config: HRMConfig = HRM_CONFIG;
  private _singleTenant: SingleTenantConfig | null = null;
  private _logger: Logger;
  private _initialized = false;

  private constructor() {
    this._logger = getLogger();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    Container.instance = null;
  }

  /**
   * Initialize container with configuration
   */
  initialize(config: ContainerConfig): void {
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
   * Get models container
   */
  getModels(): ModelsContainer {
    this.ensureInitialized();
    return this._models!;
  }

  /**
   * Get Employee model
   */
  getEmployeeModel(): Model<any> {
    this.ensureInitialized();
    return this._models!.EmployeeModel;
  }

  /**
   * Get PayrollRecord model
   */
  getPayrollRecordModel(): Model<any> {
    this.ensureInitialized();
    return this._models!.PayrollRecordModel;
  }

  /**
   * Get Transaction model
   */
  getTransactionModel(): Model<any> {
    this.ensureInitialized();
    return this._models!.TransactionModel;
  }

  /**
   * Get Attendance model (optional)
   */
  getAttendanceModel(): Model<any> | null {
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
// Convenience Functions
// ============================================================================

/**
 * Get container instance
 */
export function getContainer(): Container {
  return Container.getInstance();
}

/**
 * Initialize container
 */
export function initializeContainer(config: ContainerConfig): void {
  Container.getInstance().initialize(config);
}

/**
 * Check if container is initialized
 */
export function isContainerInitialized(): boolean {
  return Container.getInstance().isInitialized();
}

/**
 * Get models from container
 */
export function getModels(): ModelsContainer {
  return Container.getInstance().getModels();
}

/**
 * Get config from container
 */
export function getConfig(): HRMConfig {
  return Container.getInstance().getConfig();
}

/**
 * Check if single-tenant mode
 */
export function isSingleTenant(): boolean {
  return Container.getInstance().isSingleTenant();
}


/**
 * @classytic/payroll - Main Payroll Class
 *
 * Clean, Stripe-like API for payroll management
 * Builder pattern for configuration
 *
 * ## Idempotency & Duplicate Protection (v2.8.0+)
 *
 * The package implements multi-layer duplicate protection:
 *
 * ### 1. Database-Level Unique Index (PRIMARY)
 * - Unique compound index on `{ organizationId, employeeId, period.month, period.year, payrollRunType }`
 * - Prevents race conditions: concurrent requests get E11000 duplicate key error
 * - Partial filter excludes voided/reversed records (allows re-processing)
 * - Works across server restarts and multiple instances
 *
 * ### 2. Application-Level Duplicate Check (SECONDARY)
 * - Queries existing records before insert for better error messages
 * - Throws `DuplicatePayrollError` if a record exists
 * - Allows multiple payroll types per period (regular, supplemental, retroactive, off-cycle)
 *
 * ### 3. In-Memory Idempotency Cache (TERTIARY)
 * - Uses `IdempotencyManager` with LRU cache
 * - Stores results for 24 hours by default
 * - Auto-generated keys include run type: `payroll:{orgId}:{empId}:{year}-{month}:{runType}`
 * - Custom keys supported via `idempotencyKey` parameter
 *
 * ### Idempotency Key Format (v2.8.0+)
 *
 * ```
 * payroll:{organizationId}:{employeeId}:{year}-{month}:{payrollRunType}
 * ```
 *
 * Example: `payroll:org123:emp456:2024-3:regular`
 *
 * This allows processing multiple payroll types in the same period:
 * - `payroll:org123:emp456:2024-3:regular` (monthly salary)
 * - `payroll:org123:emp456:2024-3:supplemental` (bonus)
 * - `payroll:org123:emp456:2024-3:retroactive` (backpay adjustment)
 *
 * ### In-Memory Cache Limitations
 *
 * **Note:** The in-memory cache (layer 3) is process-local only:
 * - Does NOT persist across server restarts
 * - Does NOT work across multiple server instances (horizontal scaling)
 * - Only prevents duplicates within the same process lifetime
 *
 * However, the **database unique index (layer 1)** provides full protection
 * across restarts and multiple instances. Concurrent/duplicate requests
 * receive E11000 errors which are automatically handled.
 *
 * ### Implementing DB-Backed Idempotency (Recommended for Production)
 *
 * For production systems with multiple instances, implement database-backed idempotency:
 *
 * ```typescript
 * // 1. Create idempotency collection
 * const IdempotencyKey = mongoose.model('IdempotencyKey', new Schema({
 *   key: { type: String, unique: true, required: true },
 *   result: { type: Schema.Types.Mixed, required: true },
 *   createdAt: { type: Date, default: Date.now, expires: 3600 }, // 1 hour TTL
 * }));
 *
 * // 2. Check before processing (include runType in key!)
 * const runType = params.payrollRunType || 'regular';
 * const key = `payroll:${orgId}:${empId}:${year}-${month}:${runType}`;
 * const existing = await IdempotencyKey.findOne({ key });
 * if (existing) return existing.result;
 *
 * // 3. Process and store result
 * const result = await payroll.processSalary(...);
 * await IdempotencyKey.create({ key, result });
 * return result;
 * ```
 *
 * ### Handling Duplicate Errors
 *
 * When a duplicate payroll is detected:
 * - The package throws `DuplicatePayrollError`
 * - Query the existing payroll record (include payrollRunType!)
 * - Return it to the caller
 *
 * ```typescript
 * try {
 *   return await payroll.processSalary(params);
 * } catch (error) {
 *   if (error instanceof DuplicatePayrollError) {
 *     // Duplicate - fetch and return existing
 *     const existing = await PayrollRecord.findOne({
 *       employeeId: params.employeeId,
 *       'period.month': params.month,
 *       'period.year': params.year,
 *       payrollRunType: params.payrollRunType || 'regular',
 *     });
 *     return existing;
 *   }
 *   throw error;
 * }
 * ```
 */

import mongoose, { Model, type ClientSession } from 'mongoose';
import pLimit from 'p-limit';
import type {
  PayrollInitConfig,
  HRMConfig,
  SingleTenantConfig,
  Logger,
  ObjectId,
  ObjectIdLike,
  PayrollInstance,
  EmployeeDocument,
  PayrollRecordDocument,
  LeaveRequestDocument,
  TaxWithholdingDocument,
  AnyDocument,
  HireEmployeeParams,
  UpdateEmploymentParams,
  TerminateEmployeeParams,
  ReHireEmployeeParams,
  UpdateSalaryParams,
  AddAllowanceParams,
  RemoveAllowanceParams,
  AddDeductionParams,
  RemoveDeductionParams,
  UpdateBankDetailsParams,
  ProcessSalaryParams,
  ProcessBulkPayrollParams,
  PayrollHistoryParams,
  PayrollSummaryParams,
  ExportPayrollParams,
  ProcessSalaryResult,
  BulkPayrollResult,
  BulkPayrollProgress,
  PayrollSummaryResult,
  PaymentMethod,
  DeepPartial,
  Compensation,
  Allowance,
  Deduction,
  GetPendingTaxParams,
  TaxSummaryParams,
  TaxSummaryResult,
  MarkTaxPaidParams,
  OperationContext,
  AnyModel,
  TaxWithholdingModel,
  // Void / Reversal types (v2.4.0+)
  VoidPayrollParams,
  ReversePayrollParams,
  RestorePayrollParams,
  VoidPayrollResult,
  ReversePayrollResult,
  RestorePayrollResult,
} from './types.js';
import {
  PAYROLL_STATUS,
  isVoidablePayrollStatus,
  requiresReversalPayrollStatus,
  isVoidedOrReversedStatus,
} from './enums.js';
import { Container, type ModelsContainer, resetDefaultContainer } from './core/container.js';
import { EventBus, createEventBus, type PayrollEventMap, type PayrollEventType } from './core/events.js';
import { PayrollStatusMachine } from './core/payroll-states.js';
import { PluginManager, type PayrollPluginDefinition, type PluginContext } from './core/plugin.js';
import { IdempotencyManager, generatePayrollIdempotencyKey, type IdempotentResult } from './core/idempotency.js';
import { WebhookManager, type WebhookConfig } from './core/webhooks.js';
import { EmployeeFactory } from './factories/employee.factory.js';
import { createPayrollTransaction } from './factories/transaction.factory.js';
import { TAX_BRACKETS } from './config.js';
import { payroll as payrollQuery, toObjectId, isValidObjectId } from './utils/query-builders.js';
import type { SecureEmployeeLookupOptions } from './utils/employee-lookup.js';
import { getPayPeriod, addMonths, addDays } from './utils/date.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions, applyTaxBrackets } from './utils/calculation.js';
import { roundMoney } from './utils/money.js';
import { getLogger, setLogger } from './utils/logger.js';
import { NotInitializedError, EmployeeNotFoundError, DuplicatePayrollError, NotEligibleError, EmployeeTerminatedError, ValidationError, SecurityError, PayrollError } from './errors/index.js';
import { countWorkingDays, type AttendanceInput, type PayrollProcessingOptions } from './core/config.js';
import { EmployeeService, createEmployeeService } from './services/employee.service.js';
import { PayrollService, createPayrollService } from './services/payroll.service.js';
import { CompensationService, createCompensationService } from './services/compensation.service.js';
import { calculateSalaryBreakdown as calculateSalaryBreakdownPure } from './calculators/salary.calculator.js';
import { Repository } from '@classytic/mongokit';
import { multiTenantPlugin } from './core/repository-plugins.js';
import type { PayrollRepositories } from './types.js';
import { RepositoryManager, createRepositoryManager, SalaryProcessingManager, createSalaryProcessingManager, BulkOperationsManager, createBulkOperationsManager, EmployeeOperationsManager, createEmployeeOperationsManager, CompensationManager, createCompensationManager, PayrollHistoryManager, createPayrollHistoryManager, PayrollStateManager, createPayrollStateManager } from './managers/index.js';
import { hasPluginMethod, assertPluginMethod } from './utils/validation.js';

// ============================================================================
// Payroll Class
// ============================================================================

/**
 * Fully generic Payroll class for best-in-class TypeScript DX.
 *
 * Type parameters flow through to all methods, providing complete type inference.
 *
 * @typeParam TEmployee - Your Employee document type (extends EmployeeDocument)
 * @typeParam TPayrollRecord - Your PayrollRecord document type (extends PayrollRecordDocument)
 * @typeParam TTransaction - Your Transaction document type
 * @typeParam TAttendance - Your Attendance document type (optional)
 *
 * @example
 * ```typescript
 * // Full type inference
 * const payroll = createPayrollInstance()
 *   .withModels({
 *     EmployeeModel,      // Model<MyEmployeeDoc>
 *     PayrollRecordModel, // Model<MyPayrollDoc>
 *     TransactionModel,   // Model<MyTransactionDoc>
 *   })
 *   .build();
 *
 * // employee is typed as MyEmployeeDoc
 * const employee = await payroll.hire({ ... });
 * ```
 */
export class Payroll<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
> implements PayrollInstance<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
  private _container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  private _events: EventBus;
  private _plugins: PluginManager | null = null;
  private _initialized = false;

  // Repository and service layers are now created per-request with proper organizationId scoping
  // No caching to ensure multi-tenant security at query level
  private repositoryManager!: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>;
  private salaryProcessingManager!: SalaryProcessingManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  private bulkOperationsManager!: BulkOperationsManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  private employeeOperationsManager!: EmployeeOperationsManager<TEmployee, TPayrollRecord, TTransaction>;
  private compensationManager!: CompensationManager<TEmployee, TPayrollRecord, TTransaction>;
  private payrollHistoryManager!: PayrollHistoryManager<TEmployee, TPayrollRecord, TTransaction>;
  private payrollStateManager!: PayrollStateManager<TPayrollRecord, TTransaction>;

  // Idempotency & Webhooks (Stripe-level features)
  private _idempotency: IdempotencyManager;
  private _webhooks: WebhookManager;

  /**
   * Create a new Payroll instance with its own container.
   * Each instance is isolated - no shared global state.
   */
  constructor() {
    // Each Payroll instance gets its own Container (no global singleton)
    this._container = new Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>();
    this._events = createEventBus();
    this._idempotency = new IdempotencyManager();
    this._webhooks = new WebhookManager();

    // Connect webhooks to events
    this.setupWebhookBridge();
  }

  // ========================================
  // Initialization
  // ========================================

  /**
   * Initialize Payroll with models and configuration
   */
  initialize(config: PayrollInitConfig<TEmployee, TPayrollRecord, TTransaction, TAttendance>): this {
    const { EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel, singleTenant, logger: customLogger, config: customConfig } = config;

    if (!EmployeeModel || !PayrollRecordModel || !TransactionModel) {
      throw new Error('EmployeeModel, PayrollRecordModel, and TransactionModel are required');
    }

    if (customLogger) {
      setLogger(customLogger);
    }

    // Initialize THIS instance's container (not the deprecated global one)
    this._container.initialize({
      models: {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        AttendanceModel: AttendanceModel ?? null,
        LeaveRequestModel: config.LeaveRequestModel ?? null,
        TaxWithholdingModel: config.TaxWithholdingModel ?? null,
      },
      config: customConfig as Partial<HRMConfig>,
      singleTenant: singleTenant ?? null,
      logger: customLogger,
    });

    // Generic bridge: Container's attendance type param doesn't affect manager behavior
    const containerBase = this._container as unknown as Container<TEmployee, TPayrollRecord, TTransaction, AnyDocument>;

    // Initialize repository manager
    this.repositoryManager = createRepositoryManager<TEmployee, TPayrollRecord, TTransaction>(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        LeaveRequestModel: config.LeaveRequestModel ?? null,
        TaxWithholdingModel: config.TaxWithholdingModel ?? null,
      },
      containerBase
    ) as RepositoryManager<TEmployee, TPayrollRecord, TTransaction>;

    // Initialize salary processing manager
    this.salaryProcessingManager = createSalaryProcessingManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        AttendanceModel: AttendanceModel ?? null,
        LeaveRequestModel: (config.LeaveRequestModel as Model<LeaveRequestDocument> | null | undefined) ?? null,
        TaxWithholdingModel: (config.TaxWithholdingModel as unknown as TaxWithholdingModel | null) ?? null,
      },
      this._container,
      this._events,
      this._idempotency,
      this.repositoryManager as unknown as RepositoryManager<TEmployee, TPayrollRecord, TTransaction>,
      this.calculateSalaryBreakdown.bind(this),
      this.resolveOrganizationId.bind(this),
      this.resolveEmployeeId.bind(this),
      this.findEmployee.bind(this),
      this.updatePayrollStats.bind(this),
      this.config
    );

    // Initialize bulk operations manager
    this.bulkOperationsManager = createBulkOperationsManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        AttendanceModel: AttendanceModel ?? null,
      },
      this._events,
      this.processSalary.bind(this),
      this.resolveOrganizationId.bind(this)
    );

    // Initialize employee operations manager
    this.employeeOperationsManager = createEmployeeOperationsManager<TEmployee, TPayrollRecord, TTransaction>(
      this._events,
      this.config,
      this.resolveOrganizationId.bind(this),
      this.findEmployee.bind(this),
      (orgId) => this.repositoryManager.getReposForRequest(orgId) as PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
      (repos) => {
        return this.getServicesForRequest(repos);
      }
    );

    // Initialize compensation manager
    this.compensationManager = createCompensationManager<TEmployee, TPayrollRecord, TTransaction>(
      this._events,
      this.resolveOrganizationId.bind(this),
      this.resolveEmployeeId.bind(this),
      this.findEmployee.bind(this),
      (orgId) => this.repositoryManager.getReposForRequest(orgId) as PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
      (repos) => {
        return this.getServicesForRequest(repos);
      }
    );

    // Initialize payroll history manager
    this.payrollHistoryManager = createPayrollHistoryManager<TEmployee, TPayrollRecord, TTransaction>(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
      },
      this._events,
      this.resolveOrganizationId.bind(this),
      this.findEmployee.bind(this)
    );

    // Initialize payroll state manager
    this.payrollStateManager = createPayrollStateManager<TPayrollRecord, TTransaction>(
      {
        PayrollRecordModel,
        TransactionModel,
        TaxWithholdingModel: config.TaxWithholdingModel ?? null,
      },
      this._events
    );

    // Setup plugin manager
    const pluginContext: PluginContext = {
      payroll: this,
      events: this._events,
      logger: getLogger(),
      getConfig: <T = unknown>(key: string): T | undefined => {
        const config = this._container.getConfig();
        return (config as unknown as Record<string, T>)[key];
      },
      addHook: (event, handler) => this._events.on(event, handler),
    };
    this._plugins = new PluginManager(pluginContext);

    this._initialized = true;

    getLogger().info('Payroll initialized', {
      hasAttendanceIntegration: !!AttendanceModel,
      isSingleTenant: !!singleTenant,
    });

    return this;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Ensure initialized
   */
  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new NotInitializedError();
    }
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Resolve employeeId to ObjectId _id (respects explicit mode)
   * 
   * Mode priority:
   * - 'objectId': Always treat as MongoDB ObjectId (direct _id lookup)
   * - 'businessId': Always treat as business ID (lookup by employeeId field)
   * - 'auto': Smart detection (ObjectId-like → _id, otherwise → businessId)
   */
  private async resolveEmployeeId(
    employeeId: ObjectIdLike | string,
    employeeIdMode: 'auto' | 'objectId' | 'businessId' | undefined,
    organizationId: ObjectIdLike,
    session?: ClientSession
  ): Promise<mongoose.Types.ObjectId> {
    const mode = employeeIdMode || 'auto';

    // Explicit mode: 'objectId' - Force treat as MongoDB _id
    if (mode === 'objectId') {
      return toObjectId(employeeId as ObjectIdLike);
    }

    // Explicit mode: 'businessId' - Force treat as business ID (even if looks like ObjectId)
    if (mode === 'businessId') {
      const employee = await this.findEmployee({
        employeeId,
        employeeIdMode: 'businessId',
        organizationId,
        session
      });
      return employee._id;
    }

    // Auto mode: Smart detection
    if (isValidObjectId(employeeId)) {
      return toObjectId(employeeId as ObjectIdLike);
    }

    // String that's not ObjectId-like - treat as business ID
    const employee = await this.findEmployee({
      employeeId,
      employeeIdMode: 'businessId',
      organizationId,
      session
    });

    return employee._id;
  }

  // ========================================
  // Lazy Service Initialization
  // ========================================

  /**
   * Create request-scoped services with proper organizationId filtering.
   *
   * SECURITY: Services are created from request-scoped repositories to ensure
   * multi-tenant isolation at the query level.
   *
   * @param repos - Request-scoped repositories
   */
  private getServicesForRequest(
    repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>
  ): {
    employee: EmployeeService<TEmployee>;
    payroll: PayrollService<TPayrollRecord, TEmployee>;
    compensation: CompensationService<TEmployee>;
  } {
    const employeeService = createEmployeeService(repos.employee, this.config);
    const payrollService = createPayrollService(repos.payrollRecord, employeeService);
    const compensationService = createCompensationService(repos.employee);

    return {
      employee: employeeService,
      payroll: payrollService,
      compensation: compensationService,
    };
  }

  /**
   * Get models (strongly typed)
   */
  private get models(): ModelsContainer<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
    this.ensureInitialized();
    return this._container.getModels();
  }

  /**
   * Create request-scoped repositories with proper organizationId filtering.
   *
   * SECURITY: This ensures multi-tenant isolation at the query level by creating
   * repositories with the request-specific organizationId injected into plugins.
   *
   * @param organizationId - Required in multi-tenant mode, optional in single-tenant
   */
  private getReposForRequest(
    organizationId: ObjectId
  ): PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction> {
    return this.repositoryManager.getReposForRequest(organizationId) as PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>;
  }

  /**
   * Resolve organizationId for the current operation.
   *
   * SECURITY:
   * - Multi-tenant mode: organizationId MUST be provided in params
   * - Single-tenant with autoInject=true (default): Uses container organizationId
   * - Single-tenant with autoInject=false: organizationId MUST be provided in params
   *
   * @param providedOrgId - OrganizationId from operation parameters
   * @returns Resolved ObjectId
   * @throws SecurityError if organizationId is missing when required
   */
  private resolveOrganizationId(providedOrgId?: ObjectIdLike): ObjectId {
    const singleTenantConfig = this.container.getSingleTenantConfig();
    const containerOrgId = this.container.getOrganizationId();
    // FIX: Check if single-tenant MODE is enabled (config exists), not just if orgId exists
    const isSingleTenant = !!singleTenantConfig;

    // Single-tenant mode with auto-inject enabled (default: true)
    if (isSingleTenant && singleTenantConfig?.autoInject !== false) {
      // Prefer provided orgId if given
      if (providedOrgId) {
        return toObjectId(providedOrgId);
      }
      // Use container's organizationId if available
      if (containerOrgId) {
        return toObjectId(containerOrgId);
      }
      // Single-tenant with autoInject but no organizationId configured
      throw new SecurityError(
        'Single-tenant mode with autoInject enabled requires organizationId in configuration. ' +
        'Either provide organizationId in forSingleTenant({ organizationId: ... }) or pass it explicitly in each operation.'
      );
    }

    // Single-tenant with autoInject=false OR multi-tenant: require explicit orgId
    if (!providedOrgId) {
      if (isSingleTenant && singleTenantConfig?.autoInject === false) {
        throw new SecurityError(
          'organizationId is required when autoInject is disabled in single-tenant mode'
        );
      } else {
        throw new SecurityError(
          'organizationId is required in multi-tenant mode for security'
        );
      }
    }

    return toObjectId(providedOrgId);
  }

  /**
   * Get config
   */
  private get config(): HRMConfig {
    return this._container.getConfig();
  }

  /**
   * Get container (for org resolution and single-tenant detection)
   */
  private get container(): Container<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
    return this._container;
  }

  /**
   * Find employee securely with organizational isolation at query level.
   *
   * SECURITY: Creates request-scoped repositories with organizationId injected into
   * query filters, ensuring multi-tenant isolation at the database level.
   *
   * In multi-tenant mode, organizationId MUST be provided in options.
   * In single-tenant mode, organizationId is retrieved from container.
   */
  private async findEmployee(options: SecureEmployeeLookupOptions): Promise<TEmployee> {
    const session = options.session;
    const populate = !!options.populate;

    // Resolve organizationId (throws SecurityError if missing in multi-tenant mode)
    const organizationId = this.resolveOrganizationId(options.organizationId);

    // Create request-scoped repositories and services with proper organizationId filtering
    const repos = this.getReposForRequest(organizationId);
    const services = this.getServicesForRequest(repos);

    // Find employee using priority order
    let employee: EmployeeDocument | null = null;

    // Priority 1: _id (MongoDB ObjectId)
    if (options._id) {
      employee = await services.employee.findById(options._id, { session, populate });
      if (!employee) {
        throw new EmployeeNotFoundError(`Employee not found: ${options._id}`);
      }
    }
    // Priority 2: employeeId (with mode handling for disambiguation)
    else if (options.employeeId !== undefined) {
      const mode = options.employeeIdMode || 'auto';
      const id = options.employeeId;

      // If mode is 'businessId', always use findByEmployeeId
      if (mode === 'businessId') {
        employee = await services.employee.findByEmployeeId(String(id), { session });
        if (!employee) {
          throw new EmployeeNotFoundError(`Employee not found: ${id}`);
        }
      }
      // If mode is 'objectId', use findById
      else if (mode === 'objectId') {
        employee = await services.employee.findById(id as ObjectIdLike, { session, populate });
        if (!employee) {
          throw new EmployeeNotFoundError(`Employee not found: ${id}`);
        }
      }
      // Auto mode: detect type by checking if valid ObjectId
      else if (isValidObjectId(id)) {
        employee = await services.employee.findById(id as ObjectIdLike, { session, populate });
        if (!employee) {
          throw new EmployeeNotFoundError(`Employee not found: ${id}`);
        }
      } else {
        employee = await services.employee.findByEmployeeId(String(id), { session });
        if (!employee) {
          throw new EmployeeNotFoundError(`Employee not found: ${id}`);
        }
      }
    }
    // Priority 3: userId
    else if (options.userId) {
      employee = await services.employee.findByUserId(options.userId, { session });
      if (!employee) {
        throw new EmployeeNotFoundError(`Employee not found for user: ${options.userId}`);
      }
    }
    // Priority 4: email
    else if (options.email) {
      employee = await services.employee.findByEmail(options.email, { session });
      if (!employee) {
        throw new EmployeeNotFoundError(`Employee not found: ${options.email}`);
      }
    }
    // No lookup criteria provided
    else {
      throw new ValidationError('Must provide _id, employeeId, userId, or email');
    }

    // No post-fetch validation needed - query-level filtering ensures organizational isolation
    return employee as TEmployee;
  }

  // ========================================
  // Plugin System
  // ========================================

  /**
   * Register a plugin
   */
  async use(plugin: PayrollPluginDefinition): Promise<this> {
    this.ensureInitialized();
    await this._plugins!.register(plugin);
    return this;
  }

  /**
   * Subscribe to events
   */
  on<K extends keyof PayrollEventMap>(
    event: K,
    handler: (payload: PayrollEventMap[K]) => void | Promise<void>
  ): () => void {
    return this._events.on(event, handler);
  }

  /**
   * Register webhook URL for events (Stripe-style)
   */
  registerWebhook(config: WebhookConfig): void {
    this._webhooks.register(config);
  }

  /**
   * Unregister webhook URL
   */
  unregisterWebhook(url: string): void {
    this._webhooks.unregister(url);
  }

  /**
   * Get webhook delivery log
   */
  getWebhookDeliveries(options?: { event?: PayrollEventType; status?: 'pending' | 'sent' | 'failed'; limit?: number }) {
    return this._webhooks.getDeliveries(options);
  }

  /**
   * Setup webhook bridge (connects event bus to webhook manager)
   */
  private setupWebhookBridge(): void {
    // Forward all events to webhooks
    const events: PayrollEventType[] = [
      'employee:hired',
      'employee:terminated',
      'employee:rehired',
      'salary:updated',
      'salary:processed',
      'salary:failed',
      'payroll:completed',
      'payroll:exported',
      'compensation:changed',
      'milestone:achieved',
      'tax:withheld',
      'tax:paid',
    ];

    events.forEach((event) => {
      this._events.on(event, async (payload) => {
        await this._webhooks.send(event, payload);
      });
    });
  }

  // ========================================
  // Employment Lifecycle
  // ========================================

  /**
   * Hire a new employee
   */
  async hire(params: HireEmployeeParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.employeeOperationsManager.hire(params);
  }

  /**
   * Update employment details
   * NOTE: Status changes to 'terminated' must use terminate() method
   */
  async updateEmployment(params: UpdateEmploymentParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.employeeOperationsManager.updateEmployment(params);
  }

  /**
   * Terminate employee
   */
  async terminate(params: TerminateEmployeeParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.employeeOperationsManager.terminate(params);
  }

  /**
   * Re-hire terminated employee
   */
  async reHire(params: ReHireEmployeeParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.employeeOperationsManager.reHire(params);
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
    this.ensureInitialized();
    return this.employeeOperationsManager.getEmployee(params);
  }

  /**
   * Get employee by flexible identity (userId, employeeId, or email)
   *
   * Supports multiple identity modes with automatic fallback:
   * - 'userId': Lookup by user account ID (traditional)
   * - 'employeeId': Lookup by human-readable employee ID (e.g., "EMP-001")
   * - 'email': Lookup by email address (for guest employees)
   * - 'any': Try all modes until found
   *
   * @example
   * // By user ID (traditional)
   * const emp = await payroll.getEmployeeByIdentity({
   *   identity: userId,
   *   organizationId,
   *   mode: 'userId'
   * });
   *
   * // By employee ID (human-readable)
   * const emp = await payroll.getEmployeeByIdentity({
   *   identity: 'EMP-001',
   *   organizationId,
   *   mode: 'employeeId'
   * });
   *
   * // By email (guest employees)
   * const emp = await payroll.getEmployeeByIdentity({
   *   identity: 'driver@example.com',
   *   organizationId,
   *   mode: 'email'
   * });
   *
   * // Auto-detect (uses config.identityMode + fallbacks)
   * const emp = await payroll.getEmployeeByIdentity({
   *   identity: 'EMP-001',
   *   organizationId
   * });
   */
  async getEmployeeByIdentity(params: {
    identity: ObjectIdLike | string;
    organizationId?: ObjectIdLike;
    mode?: import('./types.js').EmployeeIdentityMode;
    populateUser?: boolean;
    session?: ClientSession;
  }): Promise<TEmployee> {
    this.ensureInitialized();

    const {
      identity,
      mode = this.config.validation.identityMode,
      populateUser = true,
      session
    } = params;

    // Use consistent organization resolution (handles single-tenant with autoInject)
    const orgId = this.resolveOrganizationId(params.organizationId);
    const modes: Array<import('./types.js').EmployeeIdentityMode> = [
      mode,
      ...this.config.validation.identityFallbacks
    ];

    for (const currentMode of modes) {
      let employee: TEmployee | null = null;

      switch (currentMode) {
        case 'userId': {
          // Lookup by userId (traditional pattern)
          try {
            const userId = toObjectId(identity);
            let query = this.models.EmployeeModel.findOne({
              userId,
              organizationId: orgId
            });
            if (session) query = query.session(session);
            if (populateUser) query = query.populate('userId', 'name email phone');
            employee = await query as TEmployee | null;
          } catch {
            // Invalid ObjectId, skip this mode
          }
          break;
        }

        case 'employeeId': {
          // Lookup by employeeId (human-readable)
          let query = this.models.EmployeeModel.findOne({
            employeeId: identity.toString(),
            organizationId: orgId
          });
          if (session) query = query.session(session);
          if (populateUser) query = query.populate('userId', 'name email phone');
          employee = await query as TEmployee | null;
          break;
        }

        case 'email': {
          // Lookup by email (guest employees)
          const email = identity.toString().toLowerCase().trim();
          let query = this.models.EmployeeModel.findOne({
            email,
            organizationId: orgId
          });
          if (session) query = query.session(session);
          if (populateUser) query = query.populate('userId', 'name email phone');
          employee = await query as TEmployee | null;
          break;
        }

        case 'any': {
          // Try all modes: userId → employeeId → email
          // Only swallow EmployeeNotFoundError - propagate operational errors (DB failures, timeouts)
          const anyModes: Array<import('./types.js').EmployeeIdentityMode> = ['userId', 'employeeId', 'email'];
          for (const tryMode of anyModes) {
            try {
              return await this.getEmployeeByIdentity({
                identity,
                organizationId: params.organizationId, // Pass original param for re-resolution
                mode: tryMode,
                populateUser,
                session
              });
            } catch (modeError) {
              // Only suppress "not found" errors - propagate real operational failures
              if (modeError instanceof EmployeeNotFoundError) {
                continue; // Expected: employee not found with this mode, try next
              }
              throw modeError; // DB connection, timeout, or other operational error
            }
          }
          break;
        }
      }

      if (employee) {
        return employee;
      }
    }

    throw new EmployeeNotFoundError(
      `Employee not found with identity: ${identity} (tried modes: ${modes.join(', ')})`
    );
  }

  // ========================================
  // Compensation Management
  // ========================================

  /**
   * Update employee salary
   */
  async updateSalary(params: UpdateSalaryParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.compensationManager.updateSalary(params);
  }

  /**
   * Add allowance to employee
   */
  async addAllowance(params: AddAllowanceParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.compensationManager.addAllowance(params);
  }

  /**
   * Remove allowance from employee
   */
  async removeAllowance(params: RemoveAllowanceParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.compensationManager.removeAllowance(params);
  }

  /**
   * Add deduction to employee
   */
  async addDeduction(params: AddDeductionParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.compensationManager.addDeduction(params);
  }

  /**
   * Remove deduction from employee
   */
  async removeDeduction(params: RemoveDeductionParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.compensationManager.removeDeduction(params);
  }

  /**
   * Update bank details
   */
  async updateBankDetails(params: UpdateBankDetailsParams): Promise<TEmployee> {
    this.ensureInitialized();
    return this.compensationManager.updateBankDetails(params);
  }

  // ========================================
  // Payroll Processing
  // ========================================

  /**
   * Process salary for single employee
   *
   * ATOMICITY GUARANTEE:
   * This method ALWAYS ensures atomic operations. All database writes
   * (PayrollRecord, Transaction, Employee stats) either all succeed or all fail.
   *
   * Transaction Handling:
   * - No session provided: Creates session and starts transaction
   * - Session provided WITHOUT transaction: Starts transaction on that session
   * - Session provided WITH transaction: Uses existing transaction
   *
   * This means atomicity is enforced automatically - callers cannot
   * accidentally cause partial writes by providing session without transaction.
   *
   * @example
   * // Simple usage - transaction handled automatically
   * await payroll.processSalary({ employeeId, organizationId, month, year });
   *
   * @example
   * // Use existing session (transaction started automatically if needed)
   * const session = await mongoose.startSession();
   * await payroll.processSalary({
   *   employeeId,
   *   organizationId,
   *   month,
   *   year,
   *   context: { session }
   * });
   *
   * @example
   * // Nested in caller's transaction (uses existing transaction)
   * await session.withTransaction(async () => {
   *   await payroll.processSalary({
   *     employeeId,
   *     organizationId,
   *     month,
   *     year,
   *     context: { session }
   *   });
   *   // Other operations...
   * });
   */
  async processSalary(
    params: ProcessSalaryParams
  ): Promise<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>> {
    this.ensureInitialized();
    return this.salaryProcessingManager.processSalary(params);
  }

  /**
   * Process bulk payroll for multiple employees
   *
   * ATOMICITY STRATEGY: Each employee is processed in its own transaction.
   * This allows partial success - some employees can succeed while others fail.
   * Failed employees don't affect successful ones.
   *
   * NEW FEATURES (all optional, backward compatible):
   * - Progress tracking via onProgress callback
   * - Cancellation support via AbortSignal
   * - Batch processing to prevent resource exhaustion
   * - Concurrency control for parallel processing
   *
   * @example Basic usage (unchanged)
   * ```typescript
   * const result = await payroll.processBulkPayroll({
   *   organizationId, month, year
   * });
   * ```
   *
   * @example With progress tracking
   * ```typescript
   * await payroll.processBulkPayroll({
   *   organizationId, month, year,
   *   onProgress: (p) => console.log(`${p.percentage}% done`)
   * });
   * ```
   *
   * @example With job queue integration
   * ```typescript
   * await payroll.processBulkPayroll({
   *   organizationId, month, year,
   *   batchSize: 10,
   *   onProgress: async (p) => {
   *     await Job.findByIdAndUpdate(jobId, { progress: p });
   *   }
   * });
   * ```
   *
   * @example With cancellation
   * ```typescript
   * const controller = new AbortController();
   * payroll.processBulkPayroll({ signal: controller.signal });
   * // Later: controller.abort();
   * ```
   */
  async processBulkPayroll(params: ProcessBulkPayrollParams): Promise<BulkPayrollResult> {
    this.ensureInitialized();
    return this.bulkOperationsManager.processBulkPayroll(params);
  }

  /**
   * Get payroll history
   */
  async payrollHistory(params: PayrollHistoryParams): Promise<TPayrollRecord[]> {
    this.ensureInitialized();
    return this.payrollHistoryManager.payrollHistory(params);
  }

  /**
   * Get payroll summary
   */
  async payrollSummary(params: PayrollSummaryParams): Promise<PayrollSummaryResult> {
    this.ensureInitialized();
    return this.payrollHistoryManager.payrollSummary(params);
  }

  // ========================================
  // Void / Reversal Methods (v2.4.0+)
  // ========================================

  /**
   * Void a payroll record (before payment)
   *
   * Use for payrolls that haven't been paid yet (pending, processing, failed).
   * Creates audit trail but doesn't create a reversal transaction.
   *
   * @example
   * ```typescript
   * await payroll.voidPayroll({
   *   organizationId: org._id,
   *   payrollRecordId: record._id,
   *   reason: 'Test payroll - not intended for production',
   *   context: { userId: admin._id },
   * });
   * ```
   */
  async voidPayroll(params: VoidPayrollParams): Promise<VoidPayrollResult> {
    this.ensureInitialized();
    const result = await this.payrollStateManager.voidPayroll(params);

    // Clear idempotency cache to allow re-processing if needed
    // (voided payrolls block re-processing, but cache should be cleared for consistency)
    // IMPORTANT: Must include payrollRunType and period.startDate for non-monthly frequencies
    const { employeeId, period, organizationId, payrollRunType = 'regular', paymentFrequency = 'monthly' } = result.payrollRecord;

    // For non-monthly frequencies, include period.startDate in idempotency key
    // Use stored paymentFrequency (not date heuristics) for reliable detection
    const isNonMonthly = paymentFrequency !== 'monthly';
    const idempotencyKey = generatePayrollIdempotencyKey(
      organizationId,
      employeeId,
      period.month,
      period.year,
      payrollRunType as import('./core/idempotency.js').PayrollRunType,
      isNonMonthly ? period.startDate : undefined
    );
    this._idempotency.delete(idempotencyKey);

    return result;
  }

  /**
   * Reverse a paid payroll
   *
   * Creates a reversal (negative) transaction to offset the original payment.
   * Required for compliance as it maintains a full audit trail.
   *
   * @example
   * ```typescript
   * const result = await payroll.reversePayroll({
   *   organizationId: org._id,
   *   payrollRecordId: record._id,
   *   reason: 'Duplicate payment - reversing',
   *   createReversalTransaction: true,
   * });
   * ```
   */
  async reversePayroll(params: ReversePayrollParams): Promise<ReversePayrollResult> {
    this.ensureInitialized();
    const result = await this.payrollStateManager.reversePayroll(params);

    // Clear idempotency cache to allow re-processing after reversal
    // Reversed payrolls should allow creating a new record for the same period
    // IMPORTANT: Must include payrollRunType and period.startDate for non-monthly frequencies
    const { employeeId, period, organizationId, payrollRunType = 'regular', paymentFrequency = 'monthly' } = result.payrollRecord;

    // For non-monthly frequencies, include period.startDate in idempotency key
    // Use stored paymentFrequency (not date heuristics) for reliable detection
    const isNonMonthly = paymentFrequency !== 'monthly';
    const idempotencyKey = generatePayrollIdempotencyKey(
      organizationId,
      employeeId,
      period.month,
      period.year,
      payrollRunType as import('./core/idempotency.js').PayrollRunType,
      isNonMonthly ? period.startDate : undefined
    );
    this._idempotency.delete(idempotencyKey);

    return result;
  }

  /**
   * Restore a voided payroll
   *
   * Only works for voided payrolls (not reversed ones, as they have financial transactions).
   *
   * @example
   * ```typescript
   * await payroll.restorePayroll({
   *   organizationId: org._id,
   *   payrollRecordId: record._id,
   *   reason: 'Voided in error, restoring',
   * });
   * ```
   */
  async restorePayroll(params: RestorePayrollParams): Promise<RestorePayrollResult> {
    this.ensureInitialized();
    return this.payrollStateManager.restorePayroll(params);
  }

  // ========================================
  // Tax Withholding Methods
  // ========================================

  /**
   * Get pending tax withholdings with optional filters
   */
  async getPendingTaxWithholdings(params: GetPendingTaxParams): Promise<TaxWithholdingDocument[]> {
    this.ensureInitialized();

    if (!this.models.TaxWithholdingModel) {
      throw new Error('TaxWithholding model not provided. Please add TaxWithholdingModel to your models configuration.');
    }

    const { TaxWithholdingService } = await import('./services/tax-withholding.service.js');
    const service = new TaxWithholdingService(this.models.TaxWithholdingModel as unknown as TaxWithholdingModel);

    return service.getPending(params);
  }

  /**
   * Get tax summary aggregated by type, period, or employee
   */
  async getTaxSummary(params: TaxSummaryParams): Promise<TaxSummaryResult> {
    this.ensureInitialized();

    if (!this.models.TaxWithholdingModel) {
      throw new Error('TaxWithholding model not provided. Please add TaxWithholdingModel to your models configuration.');
    }

    const { TaxWithholdingService } = await import('./services/tax-withholding.service.js');
    const service = new TaxWithholdingService(this.models.TaxWithholdingModel as unknown as TaxWithholdingModel);

    return service.getSummary(params);
  }

  /**
   * Mark tax withholdings as paid
   *
   * Updates status, optionally creates government payment transaction,
   * and emits tax:paid event
   */
  async markTaxWithholdingsPaid(params: MarkTaxPaidParams): Promise<{
    withholdings: TaxWithholdingDocument[];
    transaction?: AnyDocument;
  }> {
    this.ensureInitialized();

    if (!this.models.TaxWithholdingModel) {
      throw new Error('TaxWithholding model not provided. Please add TaxWithholdingModel to your models configuration.');
    }

    const { TaxWithholdingService } = await import('./services/tax-withholding.service.js');
    const service = new TaxWithholdingService(
      this.models.TaxWithholdingModel as unknown as TaxWithholdingModel,
      this.models.TransactionModel as AnyModel,
      this._events
    );

    return service.markPaid(params);
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Calculate salary breakdown
   *
   * Delegates to pure calculator for testability and reusability
   */
  private async calculateSalaryBreakdown(
    employee: EmployeeDocument,
    period: { month: number; year: number; startDate: Date; endDate: Date; payDate: Date },
    input: { attendance?: AttendanceInput | null; options?: PayrollProcessingOptions } = {},
    session?: ClientSession
  ): Promise<import('./types.js').PayrollBreakdown> {
    const options = input.options || {};
    let attendanceData = input.attendance;

    // Handle DB-based attendance lookup (if not provided and AttendanceModel exists)
    // Priority: 1. Explicit attendance (passed in) → 2. Auto-fetch from DB → 3. Full attendance (no deduction)
    if (!options.skipAttendance && this.config.payroll.attendanceIntegration && !attendanceData && this.models.AttendanceModel) {
      try {
        // Auto-fetch attendance from database
        let query = this.models.AttendanceModel.findOne({
          organizationId: employee.organizationId,
          targetId: employee._id,
          targetModel: 'Employee',
          year: period.year,
          month: period.month,
        });
        if (session) query = query.session(session);

        const attendance = await query;
        if (attendance) {
          const workedDays = (attendance as { totalWorkDays?: number }).totalWorkDays || 0;
          attendanceData = {
            // Don't set expectedDays - let calculator derive from workSchedule/proRating
            actualDays: workedDays,
          };
          getLogger().debug('Auto-fetched attendance from DB', {
            employeeId: employee._id.toString(),
            workedDays,
            month: period.month,
            year: period.year,
          });
        }
      } catch (error) {
        getLogger().warn('Failed to fetch attendance data', {
          employeeId: employee._id.toString(),
          error: (error as Error).message,
        });
      }
    }

    const currency = employee.compensation.currency || this.config.payroll.defaultCurrency;
    const taxBrackets = TAX_BRACKETS[currency] || [];

    return calculateSalaryBreakdownPure({
      employee: {
        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
        compensation: employee.compensation,
        workSchedule: employee.workSchedule,
      },
      period,
      attendance: attendanceData,
      options,
      config: {
        allowProRating: this.config.payroll.allowProRating,
        autoDeductions: this.config.payroll.autoDeductions,
        defaultCurrency: this.config.payroll.defaultCurrency,
        attendanceIntegration: this.config.payroll.attendanceIntegration,
      },
      taxBrackets,
    });
  }

  private async updatePayrollStats(
    employee: EmployeeDocument,
    amount: number,
    paymentDate: Date,
    repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
    session?: ClientSession
  ): Promise<void> {
    if (!employee.payrollStats) {
      employee.payrollStats = {
        totalPaid: 0,
        paymentsThisYear: 0,
        averageMonthly: 0,
      };
    }

    employee.payrollStats.totalPaid = (employee.payrollStats.totalPaid || 0) + amount;
    employee.payrollStats.lastPaymentDate = paymentDate;
    employee.payrollStats.paymentsThisYear = (employee.payrollStats.paymentsThisYear || 0) + 1;
    employee.payrollStats.averageMonthly = roundMoney(
      employee.payrollStats.totalPaid / employee.payrollStats.paymentsThisYear, 2
    );

    // Calculate next payment date based on payment frequency
    const frequency = employee.compensation?.frequency || 'monthly';
    switch (frequency) {
      case 'hourly':
      case 'daily':
        // Daily/hourly workers typically get paid daily
        employee.payrollStats.nextPaymentDate = addDays(paymentDate, 1);
        break;
      case 'weekly':
        employee.payrollStats.nextPaymentDate = addDays(paymentDate, 7);
        break;
      case 'bi_weekly':
        employee.payrollStats.nextPaymentDate = addDays(paymentDate, 14);
        break;
      case 'monthly':
      default:
        employee.payrollStats.nextPaymentDate = addMonths(paymentDate, 1);
        break;
    }

    // Use repository update instead of document.save()
    await repos.employee.update(
      employee._id,
      { payrollStats: employee.payrollStats },
      { session }
    );
  }

  // ========================================
  // Crash Recovery Methods (v2.8.0+)
  // ========================================

  /**
   * Recover stuck payroll records
   *
   * Finds payroll records stuck in 'processing' or 'pending' status for longer
   * than the threshold and handles them appropriately:
   * - Records WITHOUT transactionId: Marked as 'failed' (safe to retry)
   * - Records WITH transactionId: Flagged for manual review (orphaned transaction)
   *
   * This helps recover from server crashes or partial failures.
   *
   * @example
   * ```typescript
   * const recovered = await payroll.recoverStuckPayrolls({
   *   organizationId: org._id,
   *   staleThresholdMinutes: 30,
   * });
   * console.log(`Recovered ${recovered.markedFailed} records`);
   * if (recovered.requiresManualReview.length > 0) {
   *   console.warn('Manual review needed:', recovered.requiresManualReview);
   * }
   * ```
   */
  async recoverStuckPayrolls(params: {
    organizationId: ObjectIdLike;
    staleThresholdMinutes?: number;
    dryRun?: boolean;
  }): Promise<{
    markedFailed: number;
    requiresManualReview: Array<{ _id: ObjectId; status: string; transactionId?: ObjectId }>;
    scanned: number;
  }> {
    this.ensureInitialized();

    const orgId = this.resolveOrganizationId(params.organizationId);
    const threshold = params.staleThresholdMinutes ?? 30;
    const cutoffTime = new Date(Date.now() - threshold * 60 * 1000);
    const dryRun = params.dryRun ?? false;

    // Find stuck records
    const stuckRecords = await this.models.PayrollRecordModel.find({
      organizationId: orgId,
      status: { $in: ['processing', 'pending'] },
      processedAt: { $lt: cutoffTime },
    });

    const result = {
      markedFailed: 0,
      requiresManualReview: [] as Array<{ _id: ObjectId; status: string; transactionId?: ObjectId }>,
      scanned: stuckRecords.length,
    };

    for (const record of stuckRecords) {
      if (record.transactionId) {
        // Has transaction - needs manual review (don't auto-mark to prevent orphaning)
        result.requiresManualReview.push({
          _id: record._id,
          status: record.status,
          transactionId: record.transactionId,
        });
        getLogger().warn('Stuck payroll record with transaction needs manual review', {
          payrollRecordId: record._id.toString(),
          status: record.status,
          transactionId: record.transactionId.toString(),
          processedAt: record.processedAt,
        });
      } else {
        // No transaction - safe to mark as failed
        if (!dryRun) {
          await this.models.PayrollRecordModel.updateOne(
            { _id: record._id },
            { $set: { status: 'failed' } }
          );
        }
        result.markedFailed++;
        getLogger().info('Marked stuck payroll record as failed', {
          payrollRecordId: record._id.toString(),
          status: record.status,
          processedAt: record.processedAt,
          dryRun,
        });
      }
    }

    getLogger().info('Crash recovery completed', {
      organizationId: orgId.toString(),
      scanned: result.scanned,
      markedFailed: result.markedFailed,
      requiresManualReview: result.requiresManualReview.length,
      dryRun,
    });

    return result;
  }

  // ========================================
  // Two-Phase Export Methods (v2.8.0+)
  // ========================================

  /**
   * Prepare payroll data for export (Phase 1)
   *
   * Retrieves records but does NOT mark them as exported yet.
   * Returns an exportId that must be used to confirm or cancel the export.
   *
   * @example
   * ```typescript
   * // Phase 1: Prepare
   * const { records, exportId } = await payroll.prepareExport({
   *   organizationId: org._id,
   *   startDate: new Date('2024-01-01'),
   *   endDate: new Date('2024-01-31'),
   * });
   *
   * // Send records to external system...
   *
   * // Phase 2: Confirm (if successful) or Cancel (if failed)
   * await payroll.confirmExport({ organizationId: org._id, exportId });
   * ```
   */
  async prepareExport(params: ExportPayrollParams): Promise<{
    records: TPayrollRecord[];
    exportId: string;
    total: number;
  }> {
    this.ensureInitialized();

    const orgId = this.resolveOrganizationId(params.organizationId);
    const { startDate, endDate } = params;

    const query = {
      organizationId: toObjectId(orgId),
      'period.payDate': { $gte: startDate, $lte: endDate },
    };

    const records = await this.models.PayrollRecordModel.find(query)
      .populate('employeeId', 'employeeId position department')
      .populate('userId', 'name email')
      .populate('transactionId', 'amount method status date')
      .sort({ 'period.year': -1, 'period.month': -1 });

    // Generate export ID for tracking
    const exportId = `export-${orgId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Store pending export info in idempotency cache (temporary storage)
    this._idempotency.set(`pending-export:${exportId}`, {
      organizationId: orgId.toString(),
      recordIds: records.map(r => r._id.toString()),
      createdAt: new Date(),
      startDate,
      endDate,
    });

    getLogger().info('Prepared payroll export', {
      organizationId: orgId.toString(),
      exportId,
      recordCount: records.length,
      dateRange: { start: startDate, end: endDate },
    });

    return {
      records: records as unknown as TPayrollRecord[],
      exportId,
      total: records.length,
    };
  }

  /**
   * Confirm export success (Phase 2a)
   *
   * Marks records as exported after downstream system confirms receipt.
   */
  async confirmExport(params: {
    organizationId: ObjectIdLike;
    exportId: string;
  }): Promise<{ confirmed: number }> {
    this.ensureInitialized();

    const orgId = this.resolveOrganizationId(params.organizationId);
    const { exportId } = params;

    // Retrieve pending export info
    const pendingExport = this._idempotency.get<{
      organizationId: string;
      recordIds: string[];
      createdAt: Date;
    }>(`pending-export:${exportId}`);

    if (!pendingExport) {
      throw new PayrollError(
        `Export ${exportId} not found or already processed`,
        'EXPORT_NOT_FOUND',
        404,
        { exportId }
      );
    }

    // Verify organization match
    if (pendingExport.value.organizationId !== orgId.toString()) {
      throw new PayrollError(
        'Organization mismatch for export confirmation',
        'EXPORT_ORG_MISMATCH',
        403,
        { exportId, expectedOrg: pendingExport.value.organizationId }
      );
    }

    const recordIds = pendingExport.value.recordIds.map(id => toObjectId(id));

    // Mark records as exported
    const result = await this.models.PayrollRecordModel.updateMany(
      { _id: { $in: recordIds }, organizationId: orgId },
      { $set: { exported: true, exportedAt: new Date() } }
    );

    // Clear pending export
    this._idempotency.delete(`pending-export:${exportId}`);

    // Emit event
    this._events.emitSync('payroll:exported', {
      organizationId: orgId,
      exportId,
      recordCount: result.modifiedCount,
      format: 'json',
    });

    getLogger().info('Confirmed payroll export', {
      organizationId: orgId.toString(),
      exportId,
      confirmed: result.modifiedCount,
    });

    return { confirmed: result.modifiedCount ?? 0 };
  }

  /**
   * Cancel export (Phase 2b)
   *
   * Called when downstream system fails to process the export.
   * Records remain unmarked and can be exported again.
   */
  async cancelExport(params: {
    organizationId: ObjectIdLike;
    exportId: string;
    reason?: string;
  }): Promise<{ cancelled: boolean }> {
    this.ensureInitialized();

    const orgId = this.resolveOrganizationId(params.organizationId);
    const { exportId, reason } = params;

    // Just clear the pending export - records were never marked
    const pendingExport = this._idempotency.get(`pending-export:${exportId}`);

    if (!pendingExport) {
      getLogger().warn('Export cancellation for unknown export', { exportId });
      return { cancelled: false };
    }

    this._idempotency.delete(`pending-export:${exportId}`);

    getLogger().info('Cancelled payroll export', {
      organizationId: orgId.toString(),
      exportId,
      reason,
    });

    return { cancelled: true };
  }

  // ========================================
  // Static Factory
  // ========================================

  /**
   * Create a new Payroll instance with default types
   */
  static create<
    E extends EmployeeDocument = EmployeeDocument,
    P extends PayrollRecordDocument = PayrollRecordDocument,
    T extends AnyDocument = AnyDocument,
    A extends AnyDocument = AnyDocument,
  >(): Payroll<E, P, T, A> {
    return new Payroll<E, P, T, A>();
  }
}

// ============================================================================
// Payroll Builder
// ============================================================================

/**
 * Generic models configuration - infers types from your models
 */
export interface ModelsConfig<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument,
> {
  EmployeeModel: Model<TEmployee>;
  PayrollRecordModel: Model<TPayrollRecord>;
  TransactionModel: Model<TTransaction>;
  AttendanceModel?: Model<TAttendance> | null;
  LeaveRequestModel?: Model<TLeaveRequest> | null;
  TaxWithholdingModel?: Model<TTaxWithholding> | null;
}

/**
 * Generic Payroll Builder with full type inference.
 *
 * Types flow from withModels() through to build(), giving you a fully typed Payroll instance.
 *
 * @typeParam TEmployee - Inferred from EmployeeModel
 * @typeParam TPayrollRecord - Inferred from PayrollRecordModel
 * @typeParam TTransaction - Inferred from TransactionModel
 * @typeParam TAttendance - Inferred from AttendanceModel
 *
 * @example
 * ```typescript
 * // Types are automatically inferred!
 * const payroll = createPayrollInstance()
 *   .withModels({
 *     EmployeeModel,      // Model<MyEmployee>
 *     PayrollRecordModel, // Model<MyPayroll>
 *     TransactionModel,   // Model<MyTransaction>
 *   })
 *   .build(); // Returns PayrollInstance<MyEmployee, MyPayroll, MyTransaction, AnyDocument>
 * ```
 */
export class PayrollBuilder<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument,
  TLeaveRequest extends LeaveRequestDocument = LeaveRequestDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument,
> {
  private _models: ModelsConfig<TEmployee, TPayrollRecord, TTransaction, TAttendance, TLeaveRequest, TTaxWithholding> | null = null;
  private _config: DeepPartial<HRMConfig> | undefined;
  private _singleTenant: SingleTenantConfig | null = null;
  private _logger: Logger | undefined;

  /**
   * Set models - types are inferred automatically
   *
   * @example
   * ```typescript
   * .withModels({
   *   EmployeeModel,      // Your typed model
   *   PayrollRecordModel,
   *   TransactionModel,
   *   AttendanceModel,    // Optional
   * })
   * ```
   */
  withModels<
    E extends EmployeeDocument,
    P extends PayrollRecordDocument,
    T extends AnyDocument,
    A extends AnyDocument = AnyDocument,
    L extends LeaveRequestDocument = LeaveRequestDocument,
    TW extends TaxWithholdingDocument = TaxWithholdingDocument,
  >(
    models: ModelsConfig<E, P, T, A, L, TW>
  ): PayrollBuilder<E, P, T, A, L, TW> {
    // Cast to new builder type with inferred generics
    const builder = this as unknown as PayrollBuilder<E, P, T, A, L, TW>;
    builder._models = models;
    return builder;
  }

  /**
   * Set config overrides
   */
  withConfig(config: DeepPartial<HRMConfig>): this {
    this._config = config;
    return this;
  }

  /**
   * Enable single-tenant mode
   *
   * Use this when building a single-organization HRM (no organizationId needed)
   *
   * @example
   * ```typescript
   * const payroll = createPayrollInstance()
   *   .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
   *   .withSingleTenant({ organizationId: 'my-company' })
   *   .build();
   * ```
   */
  withSingleTenant(config: SingleTenantConfig): this {
    this._singleTenant = config;
    return this;
  }

  /**
   * Enable single-tenant mode (shorthand)
   *
   * Alias for withSingleTenant() - consistent with @classytic/clockin API
   *
   * @example
   * ```typescript
   * const payroll = createPayrollInstance()
   *   .withModels({ ... })
   *   .forSingleTenant() // ← No organizationId needed!
   *   .build();
   * ```
   */
  forSingleTenant(config: SingleTenantConfig = {}): this {
    return this.withSingleTenant(config);
  }

  /**
   * Set custom logger
   */
  withLogger(logger: Logger): this {
    this._logger = logger;
    return this;
  }

  /**
   * Build and initialize Payroll instance with inferred types
   */
  build(): PayrollInstance<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
    if (!this._models) {
      throw new Error('Models are required. Call withModels() first.');
    }

    const payroll = new Payroll<TEmployee, TPayrollRecord, TTransaction, TAttendance>();
    payroll.initialize({
      EmployeeModel: this._models.EmployeeModel,
      PayrollRecordModel: this._models.PayrollRecordModel,
      TransactionModel: this._models.TransactionModel,
      AttendanceModel: this._models.AttendanceModel,
      LeaveRequestModel: this._models.LeaveRequestModel,
      TaxWithholdingModel: this._models.TaxWithholdingModel,
      config: this._config,
      singleTenant: this._singleTenant,
      logger: this._logger,
    } as PayrollInitConfig<TEmployee, TPayrollRecord, TTransaction, TAttendance>);

    return payroll;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Payroll builder
 */
export function createPayrollInstance(): PayrollBuilder {
  return new PayrollBuilder();
}

// NOTE: No singleton exports.
// Use `createPayrollInstance().withModels(...).build()` to create instances.

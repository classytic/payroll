/**
 * @classytic/payroll - Main Payroll Class
 *
 * Clean, Stripe-like API for payroll management
 * Builder pattern for configuration
 *
 * ## Idempotency & Duplicate Protection
 *
 * The package implements multi-layer duplicate protection:
 *
 * ### 1. Database-Level Protection (PRIMARY)
 * - Unique index on `{ employeeId, period.month, period.year }` prevents duplicate payroll records
 * - MongoDB will reject duplicate inserts with E11000 error
 * - This works across server restarts and multiple instances
 *
 * ### 2. Application-Level Idempotency (SECONDARY)
 * - In-memory idempotency cache using `IdempotencyManager`
 * - Stores results for 24 hours by default
 * - Auto-generated keys: `payroll:{orgId}:{empId}:{year}-{month}`
 * - Custom keys supported via `idempotencyKey` parameter
 *
 * ### Idempotency Limitations
 *
 * **IMPORTANT:** The in-memory cache is process-local only:
 * - Does NOT persist across server restarts
 * - Does NOT work across multiple server instances (horizontal scaling)
 * - Only prevents duplicates within the same process lifetime
 *
 * After a restart or in a multi-instance deployment, the database unique index
 * is your primary protection. Duplicate requests will fail with:
 * ```
 * MongoServerError: E11000 duplicate key error collection: payroll_records
 * ```
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
 * // 2. Check before processing
 * const key = `payroll:${orgId}:${empId}:${year}-${month}`;
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
 * - Query the existing payroll record
 * - Return it to the caller
 * - Log for monitoring/alerting
 *
 * ```typescript
 * try {
 *   return await payroll.processSalary(params);
 * } catch (error) {
 *   if (error.code === 11000) {
 *     // Duplicate - fetch and return existing
 *     const existing = await PayrollRecord.findOne({
 *       employeeId: params.employeeId,
 *       'period.month': params.month,
 *       'period.year': params.year,
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
import { getPayPeriod, addMonths } from './utils/date.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions, applyTaxBrackets } from './utils/calculation.js';
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
  [key: string]: unknown;
  private _container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  private _events: EventBus;
  private _plugins: PluginManager | null = null;
  private _initialized = false;

  // Repository and service layers are now created per-request with proper organizationId scoping
  // No caching to ensure multi-tenant security at query level
  private repositoryManager!: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>;
  private salaryProcessingManager!: SalaryProcessingManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  private bulkOperationsManager!: BulkOperationsManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>;
  private employeeOperationsManager!: EmployeeOperationsManager<TEmployee>;
  private compensationManager!: CompensationManager<TEmployee>;
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
      },
      config: customConfig as Partial<HRMConfig>,
      singleTenant: singleTenant ?? null,
      logger: customLogger,
    });

    // Initialize repository manager
    this.repositoryManager = createRepositoryManager(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        LeaveRequestModel: (config as any).LeaveRequestModel ?? null,
        TaxWithholdingModel: (config as any).TaxWithholdingModel ?? null,
      },
      this._container as any
    ) as any;

    // Initialize salary processing manager
    this.salaryProcessingManager = createSalaryProcessingManager(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        AttendanceModel: AttendanceModel ?? null,
        LeaveRequestModel: (config as any).LeaveRequestModel ?? null,
        TaxWithholdingModel: (config as any).TaxWithholdingModel ?? null,
      },
      this._container as any,
      this._events,
      this._idempotency,
      this.repositoryManager as any,
      this.calculateSalaryBreakdown.bind(this),
      this.resolveOrganizationId.bind(this),
      this.resolveEmployeeId.bind(this),
      this.findEmployee.bind(this),
      this.updatePayrollStats.bind(this),
      this.config
    ) as any;

    // Initialize bulk operations manager
    this.bulkOperationsManager = createBulkOperationsManager(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        AttendanceModel: AttendanceModel ?? null,
      },
      this._events,
      this.processSalary.bind(this)
    ) as any;

    // Initialize employee operations manager
    this.employeeOperationsManager = createEmployeeOperationsManager(
      this._events,
      this.config,
      this.resolveOrganizationId.bind(this),
      this.findEmployee.bind(this),
      (orgId) => this.repositoryManager.getReposForRequest(orgId) as any,
      (repos: any) => {
        // Get organizationId from the first repo's model (they all have the same orgId)
        const orgId = repos.employee ? repos.employee._organizationId : undefined;
        return this.getServicesForRequest(repos);
      }
    ) as any;

    // Initialize compensation manager
    this.compensationManager = createCompensationManager(
      this._events,
      this.resolveOrganizationId.bind(this),
      this.resolveEmployeeId.bind(this),
      this.findEmployee.bind(this),
      (orgId) => this.repositoryManager.getReposForRequest(orgId) as any,
      (repos: any) => {
        // Get organizationId from the first repo's model (they all have the same orgId)
        const orgId = repos.employee ? repos.employee._organizationId : undefined;
        return this.getServicesForRequest(repos);
      }
    ) as any;

    // Initialize payroll history manager
    this.payrollHistoryManager = createPayrollHistoryManager(
      {
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
      },
      this._events,
      this.resolveOrganizationId.bind(this),
      this.findEmployee.bind(this)
    ) as any;

    // Initialize payroll state manager
    this.payrollStateManager = createPayrollStateManager(
      {
        PayrollRecordModel,
        TransactionModel,
        TaxWithholdingModel: (config as any).TaxWithholdingModel ?? null,
      },
      this._events
    ) as any;

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
    repos: PayrollRepositories<TEmployee, TPayrollRecord, any, TTransaction>
  ): {
    employee: EmployeeService;
    payroll: PayrollService;
    compensation: CompensationService;
  } {
    const employeeService = createEmployeeService(repos.employee as any, this.config);
    const payrollService = createPayrollService(repos.payrollRecord as any, employeeService);
    const compensationService = createCompensationService(repos.employee as any);

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
  ): PayrollRepositories<TEmployee, TPayrollRecord, any, TTransaction> {
    return this.repositoryManager.getReposForRequest(organizationId) as any;
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
            } catch {
              // Continue to next mode
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

  /**
   * Export payroll data
   */
  async exportPayroll(params: ExportPayrollParams): Promise<TPayrollRecord[]> {
    this.ensureInitialized();
    return this.payrollHistoryManager.exportPayroll(params);
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
    return this.payrollStateManager.voidPayroll(params);
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
    return this.payrollStateManager.reversePayroll(params);
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
    const service = new TaxWithholdingService(this.models.TaxWithholdingModel);

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
    const service = new TaxWithholdingService(this.models.TaxWithholdingModel);

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
    transaction?: any;
  }> {
    this.ensureInitialized();

    if (!this.models.TaxWithholdingModel) {
      throw new Error('TaxWithholding model not provided. Please add TaxWithholdingModel to your models configuration.');
    }

    const { TaxWithholdingService } = await import('./services/tax-withholding.service.js');
    const service = new TaxWithholdingService(
      this.models.TaxWithholdingModel,
      this.models.TransactionModel as any,
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

  /**
   * Calculate attendance deduction using working days (not calendar days)
   */
  private async calculateAttendanceDeduction(
    employeeId: mongoose.Types.ObjectId,
    organizationId: mongoose.Types.ObjectId,
    period: { month: number; year: number; startDate: Date; endDate: Date },
    dailyRate: number,
    expectedWorkingDays: number,
    session?: ClientSession
  ): Promise<number> {
    try {
      if (!this.models.AttendanceModel) return 0;

      let query = this.models.AttendanceModel.findOne({
        organizationId: organizationId,
        targetId: employeeId,
        targetModel: 'Employee',
        year: period.year,
        month: period.month,
      });
      if (session) query = query.session(session);

      const attendance = await query;
      if (!attendance) return 0;

      const workedDays = (attendance as { totalWorkDays?: number }).totalWorkDays || 0;
      
      // Calculate absent days based on expected working days (not calendar days)
      const absentDays = Math.max(0, expectedWorkingDays - workedDays);

      return Math.round(absentDays * dailyRate);
    } catch (error) {
      getLogger().warn('Failed to calculate attendance deduction', {
        employeeId: employeeId.toString(),
        error: (error as Error).message,
      });
      return 0;
    }
  }

  private async updatePayrollStats(
    employee: EmployeeDocument,
    amount: number,
    paymentDate: Date,
    repos: PayrollRepositories<TEmployee, TPayrollRecord, any, TTransaction>,
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
    employee.payrollStats.averageMonthly = Math.round(
      employee.payrollStats.totalPaid / employee.payrollStats.paymentsThisYear
    );
    employee.payrollStats.nextPaymentDate = addMonths(paymentDate, 1);

    // Use repository update instead of document.save()
    await repos.employee.update(
      employee._id,
      { payrollStats: employee.payrollStats },
      { session }
    );
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
      config: this._config,
      singleTenant: this._singleTenant,
      logger: this._logger,
    });

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

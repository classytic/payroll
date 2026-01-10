/**
 * @classytic/payroll - Main Payroll Class
 *
 * Clean, Stripe-like API for payroll management
 * Builder pattern for configuration
 */

import mongoose, { Model, ClientSession } from 'mongoose';
import type {
  PayrollInitConfig,
  HRMConfig,
  SingleTenantConfig,
  Logger,
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
  ListEmployeesParams,
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
  Allowance,
  Deduction,
  GetPendingTaxParams,
  TaxSummaryParams,
  TaxSummaryResult,
  MarkTaxPaidParams,
  OperationContext,
} from './types.js';
import { Container, type ModelsContainer, resetDefaultContainer } from './core/container.js';
import { EventBus, createEventBus, type PayrollEventMap, type PayrollEventType } from './core/events.js';
import { PluginManager, type PayrollPluginDefinition, type PluginContext } from './core/plugin.js';
import { IdempotencyManager, generatePayrollIdempotencyKey, type IdempotentResult } from './core/idempotency.js';
import { WebhookManager, type WebhookConfig } from './core/webhooks.js';
import { EmployeeFactory } from './factories/employee.factory.js';
import { createPayrollTransaction } from './factories/transaction.factory.js';
import { TAX_BRACKETS } from './config.js';
import { employee as employeeQuery, payroll as payrollQuery, toObjectId, isValidObjectId } from './utils/query-builders.js';
import { findEmployeeSecure, type SecureEmployeeLookupOptions } from './utils/employee-lookup.js';
import { resolveOrganizationId } from './utils/org-resolution.js';
import { getPayPeriod, addMonths } from './utils/date.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions, applyTaxBrackets } from './utils/calculation.js';
import { getLogger, setLogger } from './utils/logger.js';
import { NotInitializedError, EmployeeNotFoundError, DuplicatePayrollError, NotEligibleError, EmployeeTerminatedError, ValidationError } from './errors/index.js';
import { countWorkingDays, type AttendanceInput, type PayrollProcessingOptions } from './core/config.js';
import { EmployeeService, createEmployeeService } from './services/employee.service.js';
import { PayrollService, createPayrollService } from './services/payroll.service.js';
import { CompensationService, createCompensationService } from './services/compensation.service.js';
import { calculateSalaryBreakdown as calculateSalaryBreakdownPure } from './calculators/salary.calculator.js';

// ============================================================================
// Helper: Check plugin methods exist
// ============================================================================

function hasPluginMethod(obj: unknown, method: string): boolean {
  return typeof obj === 'object' && obj !== null && typeof (obj as Record<string, unknown>)[method] === 'function';
}

function assertPluginMethod(obj: unknown, method: string, context: string): void {
  if (!hasPluginMethod(obj, method)) {
    throw new Error(
      `Method '${method}' not found on employee. Did you forget to apply employeePlugin to your Employee schema? ` +
      `Context: ${context}`
    );
  }
}

// ============================================================================
// Helper: Check if date is within range
// ============================================================================

function isEffectiveForPeriod(
  item: { effectiveFrom?: Date | null; effectiveTo?: Date | null },
  periodStart: Date,
  periodEnd: Date
): boolean {
  const effectiveFrom = item.effectiveFrom ? new Date(item.effectiveFrom) : new Date(0);
  const effectiveTo = item.effectiveTo ? new Date(item.effectiveTo) : new Date('2099-12-31');
  
  // Item is effective if its range overlaps with the period
  return effectiveFrom <= periodEnd && effectiveTo >= periodStart;
}

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

  // Service layer delegation (lazy initialization)
  private _employeeService?: EmployeeService;
  private _payrollService?: PayrollService;
  private _compensationService?: CompensationService;

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
      const employee = await findEmployeeSecure(this.models.EmployeeModel, {
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
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
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
   * Get EmployeeService (lazy initialization)
   */
  private get employeeService(): EmployeeService {
    if (!this._employeeService) {
      this._employeeService = createEmployeeService(
        this.models.EmployeeModel as any,
        this.config
      );
    }
    return this._employeeService;
  }

  /**
   * Get PayrollService (lazy initialization)
   */
  private get payrollService(): PayrollService {
    if (!this._payrollService) {
      this._payrollService = createPayrollService(
        this.models.PayrollRecordModel as any,
        this.employeeService // Uses lazy getter
      );
    }
    return this._payrollService;
  }

  /**
   * Get CompensationService (lazy initialization)
   */
  private get compensationService(): CompensationService {
    if (!this._compensationService) {
      this._compensationService = createCompensationService(
        this.models.EmployeeModel as any
      );
    }
    return this._compensationService;
  }

  /**
   * Get models (strongly typed)
   */
  private get models(): ModelsContainer<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
    this.ensureInitialized();
    return this._container.getModels();
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
    const { userId, employment, compensation, bankDetails, context } = params;
    
    // Auto-inject organizationId in single-tenant mode
    const organizationId = params.organizationId ?? this._container.getOrganizationId();
    if (!organizationId) {
      throw new Error('organizationId is required (or configure single-tenant mode)');
    }

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

    const employee = await this.employeeService.create({
      userId,
      organizationId,
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
    this._events.emitSync('employee:hired', {
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, updates, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'updateEmployment'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, terminationDate = new Date(), reason = 'resignation', notes, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'terminate'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
      session
    });

    // Check plugin method exists
    assertPluginMethod(employee, 'terminate', 'terminate()');

    (employee as unknown as { terminate: (reason: string, date: Date) => void }).terminate(reason, terminationDate);

    if (notes) {
      employee.notes = (employee.notes || '') + `\nTermination: ${notes}`;
    }

    await employee.save({ session });

    // Emit event
    this._events.emitSync('employee:terminated', {
      employee: {
        id: employee._id,
        employeeId: employee.employeeId,
      },
      terminationDate,
      reason,
      organizationId: employee.organizationId,
      context,
    });

    getLogger().info('Employee terminated', {
      employeeId: employee.employeeId,
      reason,
    });

    return employee as TEmployee;
  }

  /**
   * Re-hire terminated employee
   */
  async reHire(params: ReHireEmployeeParams): Promise<TEmployee> {
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, hireDate = new Date(), position, department, compensation, context } = params;

    if (!this.config.employment.allowReHiring) {
      throw new Error('Re-hiring is not enabled');
    }

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'reHire'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
      session
    });

    // Check plugin method exists
    assertPluginMethod(employee, 'reHire', 'reHire()');

    (employee as unknown as { reHire: (date: Date, position?: string, department?: string) => void }).reHire(hireDate, position, department);

    if (compensation) {
      employee.compensation = { ...employee.compensation, ...compensation } as typeof employee.compensation;
    }

    await employee.save({ session });

    // Emit event
    this._events.emitSync('employee:rehired', {
      employee: {
        id: employee._id,
        employeeId: employee.employeeId,
        position: employee.position,
      },
      organizationId: employee.organizationId,
      context,
    });

    getLogger().info('Employee re-hired', {
      employeeId: employee.employeeId,
    });

    return employee as TEmployee;
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
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, populateUser = true, session, context } = params;

    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'getEmployee'
    });

    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
      session,
      populate: populateUser ? 'userId' : undefined
    });

    return employee as TEmployee;
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

    // Auto-inject organizationId in single-tenant mode
    const organizationId = params.organizationId ?? this._container.getOrganizationId();
    if (!organizationId) {
      throw new Error('organizationId is required (or configure single-tenant mode)');
    }

    const orgId = toObjectId(organizationId);
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
                organizationId,
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

  /**
   * List employees
   */
  async listEmployees(params: ListEmployeesParams): Promise<{
    docs: TEmployee[];
    totalDocs: number;
    page: number;
    limit: number;
  }> {
    this.ensureInitialized();
    const { organizationId, filters = {}, pagination = {} } = params;

    let queryBuilder = employeeQuery().forOrganization(organizationId);

    if (filters.status) queryBuilder = queryBuilder.withStatus(filters.status);
    if (filters.department) queryBuilder = queryBuilder.inDepartment(filters.department);
    if (filters.employmentType) queryBuilder = queryBuilder.withEmploymentType(filters.employmentType);
    if (filters.minSalary) queryBuilder = queryBuilder.withMinSalary(filters.minSalary);
    if (filters.maxSalary) queryBuilder = queryBuilder.withMaxSalary(filters.maxSalary);

    const query = queryBuilder.build();
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const sort = pagination.sort || { createdAt: -1 };

    const [docs, totalDocs] = await Promise.all([
      this.models.EmployeeModel.find(query)
        .populate('userId', 'name email phone')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      this.models.EmployeeModel.countDocuments(query),
    ]);

    return { docs: docs as unknown as TEmployee[], totalDocs, page, limit };
  }

  // ========================================
  // Compensation Management
  // ========================================

  /**
   * Update employee salary
   */
  async updateSalary(params: UpdateSalaryParams): Promise<TEmployee> {
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, compensation, effectiveFrom = new Date(), context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'updateSalary'
    });

    // Resolve employeeId to ObjectId if it's a string business ID
    const resolvedEmployeeId = await this.resolveEmployeeId(employeeId, employeeIdMode, organizationId, context?.session);

    // Get old salary for event (before update)
    const oldEmployee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId: resolvedEmployeeId,
      employeeIdMode: 'objectId',  // We resolved it to ObjectId
      organizationId,
      session: context?.session
    });

    if (oldEmployee.status === 'terminated') {
      throw new EmployeeTerminatedError(oldEmployee.employeeId);
    }

    const oldSalary = oldEmployee.compensation.netSalary;

    const employee = await this.employeeService.updateCompensation(
      resolvedEmployeeId,
      organizationId,
      {
        ...compensation,
        effectiveFrom,
      },
      { session: context?.session }
    );

    // Emit high-level business event
    this._events.emitSync('salary:updated', {
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, amount, isPercentage, value, taxable = true, recurring = true, effectiveFrom = new Date(), effectiveTo, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'addAllowance'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'removeAllowance'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
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
      throw new Error(`Allowance type '${type}' not found`);
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, amount, isPercentage, value, auto = false, recurring = true, description, effectiveFrom = new Date(), effectiveTo, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'addDeduction'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, type, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'removeDeduction'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
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
      throw new Error(`Deduction type '${type}' not found`);
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
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, bankDetails, context } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'updateBankDetails'
    });

    const session = context?.session;

    // ✅ SECURE: Use secure lookup with organizationId isolation
    const employee = await findEmployeeSecure(this.models.EmployeeModel, {
      employeeId,  // Supports both ObjectId and string
      employeeIdMode,  // Explicit disambiguation if needed
      organizationId,
      session
    });

    employee.bankDetails = { ...employee.bankDetails, ...bankDetails };
    await employee.save({ session });

    getLogger().info('Bank details updated', {
      employeeId: employee.employeeId,
    });

    return employee as TEmployee;
  }

  // ========================================
  // Payroll Processing
  // ========================================

  /**
   * Process salary for single employee
   * 
   * ATOMICITY: This method creates its own transaction if none provided.
   * All database operations (PayrollRecord, Transaction, Employee stats) 
   * are atomic - either all succeed or all fail.
   */
  async processSalary(
    params: ProcessSalaryParams
  ): Promise<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>> {
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, month, year, paymentDate = new Date(), paymentMethod = 'bank', attendance, options, context, idempotencyKey } = params;

    // CRITICAL: Resolve organizationId with smart detection
    const organizationId = resolveOrganizationId({
      explicit: explicitOrgId,
      context,
      container: this.container,
      operation: 'processSalary'
    });

    // Idempotency: Generate or use provided key
    const resolvedEmployeeId = await this.resolveEmployeeId(employeeId, employeeIdMode, organizationId, context?.session);
    const idempotentKey = idempotencyKey || generatePayrollIdempotencyKey(organizationId, resolvedEmployeeId, month, year);

    // Check idempotency cache (Stripe-style)
    const cached = this._idempotency.get<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>>(idempotentKey);
    if (cached) {
      getLogger().info('Returning cached payroll result (idempotent)', {
        idempotencyKey: idempotentKey,
        cachedAt: cached.createdAt,
      });
      return cached.value;
    }

    // CRITICAL: Use provided session OR create a new transaction
    const providedSession = context?.session;
    const session = providedSession || await mongoose.startSession();
    const shouldManageTransaction = !providedSession && session != null;

    try {
      if (shouldManageTransaction) {
        await session.startTransaction();
      }

      // ✅ SECURE: Use secure lookup with organizationId isolation
      const employee = await findEmployeeSecure(this.models.EmployeeModel, {
        employeeId,  // Supports both ObjectId and string
        employeeIdMode,  // Explicit disambiguation if needed
        organizationId,
        session,
        populate: 'userId'
      });

      // Check eligibility - with plugin method verification
      const canReceive = hasPluginMethod(employee, 'canReceiveSalary')
        ? (employee as unknown as { canReceiveSalary: () => boolean }).canReceiveSalary()
        : (employee.status === 'active' && (employee.compensation?.baseAmount || 0) > 0);

      if (!canReceive) {
        throw new NotEligibleError('Employee is not eligible to receive salary');
      }

      // Check for existing payroll
      // ✅ Use employee._id (not employeeId param) since we've resolved the employee
      const existingQuery = payrollQuery()
        .forEmployee(employee._id)
        .forPeriod(month, year)
        .whereIn('status', ['paid', 'processing'])
        .build();

      let existingRecordQuery = this.models.PayrollRecordModel.findOne(existingQuery);
      if (session) existingRecordQuery = existingRecordQuery.session(session);
      const existingRecord = await existingRecordQuery;
      
      if (existingRecord) {
        throw new DuplicatePayrollError(employee.employeeId, month, year);
      }

      const period = { ...getPayPeriod(month, year), payDate: paymentDate };
      const breakdown = await this.calculateSalaryBreakdown(employee, period, { attendance, options }, session);

      // Handle userId - could be ObjectId, populated doc, or null
      // Extract userId if present (optional for guest employees)
      const userIdValue = employee.userId
        ? (typeof employee.userId === 'object' && '_id' in employee.userId
            ? (employee.userId as { _id: mongoose.Types.ObjectId })._id
            : (employee.userId as mongoose.Types.ObjectId))
        : undefined;

      // Use type assertions for generic model create operations
      const [payrollRecord] = await (this.models.PayrollRecordModel as Model<PayrollRecordDocument>).create([{
        organizationId: employee.organizationId,
        employeeId: employee._id,
        userId: userIdValue,
        period,
        breakdown,
        status: 'processing',
        paymentMethod,
        processedAt: new Date(),
        processedBy: context?.userId ? toObjectId(context.userId) : undefined,
      }], session ? { session } : {}) as unknown as [TPayrollRecord & PayrollRecordDocument];

      // Aligned with @classytic/shared-types ITransactionCreateInput
      const [transaction] = await (this.models.TransactionModel as Model<AnyDocument>).create([{
        organizationId: employee.organizationId,

        // Classification (shared-types)
        type: 'salary',
        flow: 'outflow',
        tags: ['recurring', 'payroll', 'monthly'],
        status: 'completed',

        // Amounts (shared-types convention: amount = gross, net = after deductions)
        amount: breakdown.grossSalary, // Gross amount
        net: breakdown.netSalary, // Net after deductions
        currency: employee.compensation.currency || 'USD', // From employee, not hardcoded
        fee: 0,
        tax: breakdown.taxAmount || 0,

        // Tax details (shared-types structure)
        taxDetails: breakdown.taxAmount && breakdown.taxAmount > 0 ? {
          type: 'income_tax',
          rate: breakdown.grossSalary > 0 ? breakdown.taxAmount / breakdown.grossSalary : 0,
          jurisdiction: undefined, // App-controlled (can be added via metadata)
        } : undefined,

        // Payment (flexible method - users can pass any string)
        method: paymentMethod, // 'bank_transfer', 'cash', 'check', 'mobile_wallet', etc.
        date: paymentDate,

        // Parties (shared-types)
        employeeId: employee._id,
        customerId: employee.userId as mongoose.Types.ObjectId,
        processedBy: context?.userId ? toObjectId(context.userId) : undefined,

        // ✅ UNIFIED: Breakdown structure
        breakdown: {
          base: breakdown.baseAmount,
          additions: breakdown.allowances.map(a => ({
            type: a.type,
            amount: a.amount,
            description: a.type,
            isTaxable: a.taxable
          })),
          deductions: breakdown.deductions.map(d => ({
            type: d.type,
            amount: d.amount,
            description: d.description
          })),
          period: {
            month,
            year,
            start: new Date(year, month - 1, 1),
            end: new Date(year, month, 0)
          },
          workingDays: breakdown.workingDays ? {
            expected: breakdown.workingDays,
            actual: breakdown.actualDays || breakdown.workingDays
          } : undefined
        },

        // References (shared-types)
        sourceId: payrollRecord._id,
        sourceModel: 'PayrollRecord',

        // Idempotency (Stripe-style, shared-types)
        idempotencyKey: idempotentKey,

        // Timestamps (shared-types)
        processedAt: paymentDate,
        completedAt: paymentDate,

        // Description & metadata
        description: `Salary payment - ${(employee.userId as { name?: string })?.name || employee.employeeId} (${month}/${year})`,
        notes: breakdown.proRatedAmount ? `Pro-rated: ${breakdown.actualDays}/${breakdown.workingDays} days` : undefined,
        metadata: {
          employeeId: employee.employeeId,
          email: (employee as any).email, // For guest employees
          payrollRecordId: payrollRecord._id.toString(),
        },
      }], session ? { session } : {}) as unknown as [TTransaction & { _id: mongoose.Types.ObjectId }];

      // Update payroll record with transaction reference
      (payrollRecord as PayrollRecordDocument).transactionId = transaction._id;
      (payrollRecord as PayrollRecordDocument).status = 'paid';
      (payrollRecord as PayrollRecordDocument).paidAt = paymentDate;
      await (payrollRecord as PayrollRecordDocument).save(session ? { session } : {});

      // Create Tax Withholding Records (if tax > 0 and model provided)
      if (breakdown.taxAmount && breakdown.taxAmount > 0 && this.models.TaxWithholdingModel) {
        const { TaxWithholdingService } = await import('./services/tax-withholding.service.js');
        const taxService = new TaxWithholdingService(
          this.models.TaxWithholdingModel,
          this.models.TransactionModel as any,
          this._events
        );

        await taxService.createFromBreakdown({
          organizationId: employee.organizationId,
          employeeId: employee._id,
          userId: employee.userId as mongoose.Types.ObjectId | undefined,
          payrollRecordId: payrollRecord._id,
          transactionId: transaction._id,
          period: {
            month,
            year,
            startDate: period.startDate,
            endDate: period.endDate,
            payDate: paymentDate,
          },
          breakdown,
          currency: 'BDT',
          session,
          context,
        });
      }

      // Update employee payroll stats
      await this.updatePayrollStats(employee, breakdown.netSalary, paymentDate, session);

      // Commit transaction if we created it
      if (shouldManageTransaction) {
        await session.commitTransaction();
      }

      // Emit event (after commit to ensure data is persisted)
      this._events.emitSync('salary:processed', {
        employee: {
          id: employee._id,
          employeeId: employee.employeeId,
          name: (employee.userId as { name?: string })?.name,
        },
        payroll: {
          id: payrollRecord._id,
          period: { month, year },
          grossAmount: breakdown.grossSalary,
          netAmount: breakdown.netSalary,
        },
        transactionId: transaction._id,
        organizationId: employee.organizationId,
        context,
      });

      getLogger().info('Salary processed', {
        employeeId: employee.employeeId,
        month,
        year,
        amount: breakdown.netSalary,
        idempotencyKey: idempotentKey,
      });

      const result = {
        payrollRecord: payrollRecord as unknown as TPayrollRecord,
        transaction: transaction as unknown as TTransaction,
        employee: employee as unknown as TEmployee,
      };

      // Cache result for idempotency (Stripe-style)
      this._idempotency.set(idempotentKey, result);

      return result;

    } catch (error) {
      // Rollback transaction if we created it
      if (shouldManageTransaction && session?.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      // End session if we created it
      if (shouldManageTransaction && session) {
        await session.endSession();
      }
    }
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
    const {
      organizationId,
      month,
      year,
      employeeIds = [],
      paymentDate = new Date(),
      paymentMethod = 'bank',
      options,
      context,
      // Progress and control params
      onProgress,
      signal,
      batchSize = 10,
      batchDelay = 0,
      concurrency = 1,
      useStreaming,
    } = params;

    const query: Record<string, unknown> = { organizationId: toObjectId(organizationId), status: 'active' };
    if (employeeIds.length > 0) {
      query._id = { $in: employeeIds.map(toObjectId) };
    }

    // Auto-detect streaming: use for >10k employees
    const employeeCount = await this.models.EmployeeModel.countDocuments(query);
    const shouldStream = useStreaming ?? (employeeCount > 10000);

    // Use streaming for large datasets
    if (shouldStream) {
      return this.processBulkPayrollStreaming({
        query,
        organizationId,
        month,
        year,
        paymentDate,
        paymentMethod,
        options,
        context,
        signal,
        batchSize,
        batchDelay,
        concurrency,
        onProgress,
        total: employeeCount,
      });
    }

    // Original implementation for smaller datasets
    const employees = await this.models.EmployeeModel.find(query);
    const total = employees.length;

    const results: BulkPayrollResult = {
      successful: [],
      failed: [],
      total,
    };

    // Helper to report progress
    const reportProgress = async (currentEmployee?: string) => {
      if (onProgress) {
        const processed = results.successful.length + results.failed.length;
        await onProgress({
          processed,
          total,
          successful: results.successful.length,
          failed: results.failed.length,
          currentEmployee,
          percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
        });
      }
    };

    // Process in batches
    for (let i = 0; i < employees.length; i += batchSize) {
      // Check for cancellation before each batch
      if (signal?.aborted) {
        getLogger().warn('Bulk payroll cancelled', {
          organizationId: organizationId.toString(),
          processed: results.successful.length + results.failed.length,
          total,
        });
        throw new Error('Payroll processing cancelled by user');
      }

      const batch = employees.slice(i, i + batchSize);

      if (concurrency === 1) {
        // SEQUENTIAL (default, safest)
        for (const employee of batch) {
          if (signal?.aborted) throw new Error('Payroll processing cancelled by user');

          try {
            const result = await this.processSalary({
              employeeId: employee._id,
              organizationId,
              month,
              year,
              paymentDate,
              paymentMethod,
              options,
              context: { ...context, session: undefined },
            });

            results.successful.push({
              employeeId: employee.employeeId,
              amount: result.payrollRecord.breakdown.netSalary,
              transactionId: result.transaction._id,
            });
          } catch (error) {
            results.failed.push({
              employeeId: employee.employeeId,
              error: (error as Error).message,
            });

            getLogger().error('Failed to process salary', {
              employeeId: employee.employeeId,
              error: (error as Error).message,
            });
          }

          await reportProgress(employee.employeeId);
        }
      } else {
        // CONCURRENT (faster, more resources)
        const batchResults = await Promise.allSettled(
          batch.map((employee) =>
            this.processSalary({
              employeeId: employee._id,
              organizationId,
              month,
              year,
              paymentDate,
              paymentMethod,
              options,
              context: { ...context, session: undefined },
            }).then((result) => ({ employee, result }))
          )
        );

        // Aggregate batch results
        for (let j = 0; j < batchResults.length; j++) {
          const batchResult = batchResults[j];
          const employee = batch[j];

          if (batchResult.status === 'fulfilled') {
            results.successful.push({
              employeeId: batchResult.value.employee.employeeId,
              amount: batchResult.value.result.payrollRecord.breakdown.netSalary,
              transactionId: batchResult.value.result.transaction._id,
            });
          } else {
            results.failed.push({
              employeeId: employee.employeeId,
              error: (batchResult.reason as Error).message || 'Unknown error',
            });

            getLogger().error('Failed to process salary (concurrent)', {
              employeeId: employee.employeeId,
              error: (batchResult.reason as Error).message,
            });
          }
        }

        await reportProgress();
      }

      // Pause between batches
      if (batchDelay > 0 && i + batchSize < employees.length) {
        await new Promise((resolve) => setTimeout(resolve, batchDelay));
      }
    }

    // Emit completed event
    this._events.emitSync('payroll:completed', {
      organizationId: toObjectId(organizationId),
      period: { month, year },
      summary: {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        totalAmount: results.successful.reduce((sum, r) => sum + r.amount, 0),
      },
      context,
    });

    getLogger().info('Bulk payroll processed', {
      organizationId: organizationId.toString(),
      month,
      year,
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      concurrency,
      batchSize,
    });

    return results;
  }

  /**
   * Stream-based bulk payroll processing for millions of employees.
   * Uses MongoDB cursors to avoid loading everything into memory.
   *
   * @private
   */
  private async processBulkPayrollStreaming(params: {
    query: Record<string, unknown>;
    organizationId: ObjectIdLike;
    month: number;
    year: number;
    paymentDate: Date;
    paymentMethod?: string;
    options?: any;
    context?: any;
    signal?: AbortSignal;
    batchSize: number;
    batchDelay: number;
    concurrency: number;
    onProgress?: (progress: BulkPayrollProgress) => void | Promise<void>;
    total: number;
  }): Promise<BulkPayrollResult> {
    const {
      query,
      organizationId,
      month,
      year,
      paymentDate,
      paymentMethod,
      options,
      context,
      signal,
      batchSize,
      batchDelay,
      concurrency,
      onProgress,
      total,
    } = params;

    const startTime = Date.now();
    const results: BulkPayrollResult = {
      successful: [],
      failed: [],
      total,
    };

    // Create cursor (streams employees one at a time)
    const cursor = this.models.EmployeeModel.find(query).cursor();

    let processed = 0;
    let batchCount = 0;
    const batchPromises: Array<Promise<void>> = [];

    // Import p-limit for concurrency control
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(concurrency);

    // Progress reporting helper
    const reportProgress = async (currentEmployee?: string) => {
      if (onProgress) {
        await onProgress({
          processed,
          total,
          successful: results.successful.length,
          failed: results.failed.length,
          currentEmployee,
          percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
        });
      }
    };

    // Stream employees
    for await (const employee of cursor) {
      // Check cancellation
      if (signal?.aborted) {
        cursor.close();
        getLogger().warn('Streaming bulk payroll cancelled', {
          processed,
          total,
        });
        throw new Error('Payroll processing cancelled by user');
      }

      // Add to worker pool
      const promise = limit(async () => {
        try {
          const result = await this.processSalary({
            employeeId: employee._id,
            organizationId,
            month,
            year,
            paymentDate,
            paymentMethod: paymentMethod as PaymentMethod | undefined,
            options,
            context: { ...context, session: undefined },
          });

          results.successful.push({
            employeeId: employee.employeeId,
            amount: result.payrollRecord.breakdown.netSalary,
            transactionId: result.transaction._id,
          });
        } catch (error) {
          results.failed.push({
            employeeId: employee.employeeId,
            error: (error as Error).message,
          });

          getLogger().error('Failed to process salary (streaming)', {
            employeeId: employee.employeeId,
            error: (error as Error).message,
          });
        }
      });

      batchPromises.push(promise);
      processed++;

      // Batch completion
      if (processed % batchSize === 0) {
        await Promise.all(batchPromises);
        batchPromises.length = 0;
        batchCount++;

        await reportProgress();

        // Batch delay
        if (batchDelay > 0 && processed < total) {
          await new Promise((resolve) => setTimeout(resolve, batchDelay));
        }
      }
    }

    // Wait for final batch
    if (batchPromises.length > 0) {
      await Promise.all(batchPromises);
      await reportProgress();
    }

    // Emit completion event
    this._events.emitSync('payroll:completed', {
      organizationId: toObjectId(query.organizationId as ObjectIdLike),
      period: { month, year },
      summary: {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        totalAmount: results.successful.reduce((sum, r) => sum + r.amount, 0),
      },
      context,
    });

    const duration = Date.now() - startTime;

    getLogger().info('Streaming bulk payroll completed', {
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      duration,
      concurrency,
      batchSize,
    });

    return results;
  }

  /**
   * Get payroll history
   */
  async payrollHistory(params: PayrollHistoryParams): Promise<TPayrollRecord[]> {
    this.ensureInitialized();
    const { employeeId, employeeIdMode, organizationId, month, year, status, pagination = {} } = params;

    // Resolve employeeId to ObjectId _id if it's a string business ID
    // Respect explicit employeeIdMode hint before auto-detection
    let resolvedEmployeeId: mongoose.Types.ObjectId | undefined;
    if (employeeId) {
      const mode = employeeIdMode || 'auto';
      const shouldTreatAsObjectId =
        mode === 'objectId' ||
        (mode === 'auto' && isValidObjectId(employeeId));

      const shouldTreatAsBusinessId =
        mode === 'businessId' ||
        (mode === 'auto' && !isValidObjectId(employeeId));

      if (shouldTreatAsObjectId) {
        resolvedEmployeeId = toObjectId(employeeId as ObjectIdLike);
      } else if (shouldTreatAsBusinessId) {
        // String business ID - need to resolve to ObjectId _id
        if (!organizationId) {
          throw new Error('payrollHistory requires organizationId when using string employeeId');
        }
        const employee = await findEmployeeSecure(this.models.EmployeeModel, {
          employeeId,
          employeeIdMode,
          organizationId
        });
        resolvedEmployeeId = employee._id;
      }
    }

    let queryBuilder = payrollQuery();
    if (resolvedEmployeeId) queryBuilder = queryBuilder.forEmployee(resolvedEmployeeId);
    if (organizationId) queryBuilder = queryBuilder.forOrganization(organizationId);
    if (month || year) queryBuilder = queryBuilder.forPeriod(month, year);
    if (status) queryBuilder = queryBuilder.withStatus(status);

    const query = queryBuilder.build();
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const sort = pagination.sort || { 'period.year': -1, 'period.month': -1 };

    return this.models.PayrollRecordModel.find(query)
      .populate('employeeId', 'employeeId position department')
      .populate('userId', 'name email')
      .populate('transactionId', 'amount method status date')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);
  }

  /**
   * Get payroll summary
   */
  async payrollSummary(params: PayrollSummaryParams): Promise<PayrollSummaryResult> {
    this.ensureInitialized();
    const { organizationId, month, year } = params;

    const query: Record<string, unknown> = { organizationId: toObjectId(organizationId) };
    if (month) query['period.month'] = month;
    if (year) query['period.year'] = year;

    const [summary] = await this.models.PayrollRecordModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$breakdown.grossSalary' },
          totalNet: { $sum: '$breakdown.netSalary' },
          totalDeductions: { $sum: { $sum: '$breakdown.deductions.amount' } },
          totalTax: { $sum: { $ifNull: ['$breakdown.taxAmount', 0] } },
          employeeCount: { $sum: 1 },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        },
      },
    ]);

    return summary || {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      totalTax: 0,
      employeeCount: 0,
      paidCount: 0,
      pendingCount: 0,
    };
  }

  /**
   * Export payroll data
   */
  async exportPayroll(params: ExportPayrollParams): Promise<TPayrollRecord[]> {
    this.ensureInitialized();
    const { organizationId, startDate, endDate } = params;

    const query = {
      organizationId: toObjectId(organizationId),
      'period.payDate': { $gte: startDate, $lte: endDate },
    };

    const records = await this.models.PayrollRecordModel.find(query)
      .populate('employeeId', 'employeeId position department')
      .populate('userId', 'name email')
      .populate('transactionId', 'amount method status date')
      .sort({ 'period.year': -1, 'period.month': -1 });

    // Mark as exported
    await this.models.PayrollRecordModel.updateMany(query, {
      exported: true,
      exportedAt: new Date(),
    });

    // Emit event
    this._events.emitSync('payroll:exported', {
      organizationId: toObjectId(organizationId),
      dateRange: { start: startDate, end: endDate },
      recordCount: records.length,
      format: 'json',
    });

    getLogger().info('Payroll data exported', {
      organizationId: organizationId.toString(),
      count: records.length,
    });

    return records as unknown as TPayrollRecord[];
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

    await employee.save(session ? { session } : {});
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

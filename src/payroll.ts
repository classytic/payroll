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
  EmployeeDocument,
  PayrollRecordDocument,
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
  PayrollSummaryResult,
  OperationContext,
  DeepPartial,
  Allowance,
  Deduction,
  TaxBracket,
} from './types.js';
import { Container, type ModelsContainer, initializeContainer } from './core/container.js';
import { EventBus, createEventBus, type PayrollEventMap } from './core/events.js';
import { PluginManager, type PayrollPluginDefinition, type PluginContext } from './core/plugin.js';
import { EmployeeFactory } from './factories/employee.factory.js';
import { HRM_CONFIG, mergeConfig, TAX_BRACKETS } from './config.js';
import { HRM_TRANSACTION_CATEGORIES } from './enums.js';
import { employee as employeeQuery, payroll as payrollQuery, toObjectId } from './utils/query-builders.js';
import { getPayPeriod, diffInDays, addMonths, getWorkingDaysInMonth } from './utils/date.js';
import { calculateGross, calculateNet, sumAllowances, sumDeductions, applyTaxBrackets } from './utils/calculation.js';
import { logger as defaultLogger, getLogger, setLogger } from './utils/logger.js';
import { NotInitializedError, EmployeeNotFoundError, DuplicatePayrollError, NotEligibleError, EmployeeTerminatedError, ValidationError } from './errors/index.js';

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

export class Payroll {
  private _container: Container;
  private _events: EventBus;
  private _plugins: PluginManager | null = null;
  private _initialized = false;

  constructor() {
    this._container = Container.getInstance();
    this._events = createEventBus();
  }

  // ========================================
  // Initialization
  // ========================================

  /**
   * Initialize Payroll with models and configuration
   */
  initialize(config: PayrollInitConfig): this {
    const { EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel, singleTenant, logger: customLogger, config: customConfig } = config;

    if (!EmployeeModel || !PayrollRecordModel || !TransactionModel) {
      throw new Error('EmployeeModel, PayrollRecordModel, and TransactionModel are required');
    }

    if (customLogger) {
      setLogger(customLogger);
    }

    initializeContainer({
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
      payroll: this as unknown as import('./types.js').PayrollInstance,
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

  /**
   * Get models
   */
  private get models(): ModelsContainer {
    this.ensureInitialized();
    return this._container.getModels();
  }

  /**
   * Get config
   */
  private get config(): HRMConfig {
    return this._container.getConfig();
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

  // ========================================
  // Employment Lifecycle
  // ========================================

  /**
   * Hire a new employee
   */
  async hire(params: HireEmployeeParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { userId, employment, compensation, bankDetails, context } = params;
    const session = context?.session;

    // Auto-inject organizationId in single-tenant mode
    const organizationId = params.organizationId ?? this._container.getOrganizationId();
    if (!organizationId) {
      throw new Error('organizationId is required (or configure single-tenant mode)');
    }

    // Check for existing active employee
    const existingQuery = employeeQuery()
      .forUser(userId)
      .forOrganization(organizationId)
      .employed()
      .build();

    let existing = this.models.EmployeeModel.findOne(existingQuery);
    if (session) existing = existing.session(session);
    
    if (await existing) {
      throw new Error('User is already an active employee in this organization');
    }

    const employeeData = EmployeeFactory.create({
      userId,
      organizationId,
      employment,
      compensation: {
        ...compensation,
        currency: compensation.currency || this.config.payroll.defaultCurrency,
      },
      bankDetails,
    });

    const [employee] = await this.models.EmployeeModel.create([employeeData], { session });

    // Emit event
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

    getLogger().info('Employee hired', {
      employeeId: employee.employeeId,
      organizationId: organizationId.toString(),
      position: employment.position,
    });

    return employee;
  }

  /**
   * Update employment details
   * NOTE: Status changes to 'terminated' must use terminate() method
   */
  async updateEmployment(params: UpdateEmploymentParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, updates, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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
        (employee as Record<string, unknown>)[key] = value;
      }
    }

    await employee.save({ session });

    getLogger().info('Employee updated', {
      employeeId: employee.employeeId,
      updates: Object.keys(updates),
    });

    return employee;
  }

  /**
   * Terminate employee
   */
  async terminate(params: TerminateEmployeeParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, terminationDate = new Date(), reason = 'resignation', notes, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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

    return employee;
  }

  /**
   * Re-hire terminated employee
   */
  async reHire(params: ReHireEmployeeParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, hireDate = new Date(), position, department, compensation, context } = params;
    const session = context?.session;

    if (!this.config.employment.allowReHiring) {
      throw new Error('Re-hiring is not enabled');
    }

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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

    return employee;
  }

  /**
   * Get employee by ID
   */
  async getEmployee(params: {
    employeeId: ObjectIdLike;
    populateUser?: boolean;
    session?: ClientSession;
  }): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, populateUser = true, session } = params;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    if (populateUser) query = query.populate('userId', 'name email phone');

    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

    return employee;
  }

  /**
   * List employees
   */
  async listEmployees(params: ListEmployeesParams): Promise<{
    docs: EmployeeDocument[];
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

    return { docs, totalDocs, page, limit };
  }

  // ========================================
  // Compensation Management
  // ========================================

  /**
   * Update employee salary
   */
  async updateSalary(params: UpdateSalaryParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, compensation, effectiveFrom = new Date(), context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

    if (employee.status === 'terminated') {
      throw new EmployeeTerminatedError(employee.employeeId);
    }

    const oldSalary = employee.compensation.netSalary;

    if (compensation.baseAmount !== undefined) {
      employee.compensation.baseAmount = compensation.baseAmount;
    }
    if (compensation.frequency) {
      employee.compensation.frequency = compensation.frequency;
    }
    if (compensation.currency) {
      employee.compensation.currency = compensation.currency;
    }

    employee.compensation.effectiveFrom = effectiveFrom;
    
    // Check plugin method exists before calling
    if (hasPluginMethod(employee, 'updateSalaryCalculations')) {
      (employee as unknown as { updateSalaryCalculations: () => void }).updateSalaryCalculations();
    }

    await employee.save({ session });

    // Emit event
    this._events.emitSync('salary:updated', {
      employee: { id: employee._id, employeeId: employee.employeeId },
      previousSalary: oldSalary || 0,
      newSalary: employee.compensation.netSalary || 0,
      effectiveFrom,
      organizationId: employee.organizationId,
      context,
    });

    getLogger().info('Salary updated', {
      employeeId: employee.employeeId,
      oldSalary,
      newSalary: employee.compensation.netSalary,
    });

    return employee;
  }

  /**
   * Add allowance to employee
   */
  async addAllowance(params: AddAllowanceParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, type, amount, taxable = true, recurring = true, effectiveFrom = new Date(), effectiveTo, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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

    return employee;
  }

  /**
   * Remove allowance from employee
   */
  async removeAllowance(params: RemoveAllowanceParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, type, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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

    return employee;
  }

  /**
   * Add deduction to employee
   */
  async addDeduction(params: AddDeductionParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, type, amount, auto = false, recurring = true, description, effectiveFrom = new Date(), effectiveTo, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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

    return employee;
  }

  /**
   * Remove deduction from employee
   */
  async removeDeduction(params: RemoveDeductionParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, type, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

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

    return employee;
  }

  /**
   * Update bank details
   */
  async updateBankDetails(params: UpdateBankDetailsParams): Promise<EmployeeDocument> {
    this.ensureInitialized();
    const { employeeId, bankDetails, context } = params;
    const session = context?.session;

    let query = this.models.EmployeeModel.findById(toObjectId(employeeId));
    if (session) query = query.session(session);
    
    const employee = await query;
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId.toString());
    }

    employee.bankDetails = { ...employee.bankDetails, ...bankDetails };
    await employee.save({ session });

    getLogger().info('Bank details updated', {
      employeeId: employee.employeeId,
    });

    return employee;
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
  async processSalary(params: ProcessSalaryParams): Promise<ProcessSalaryResult> {
    this.ensureInitialized();
    const { employeeId, month, year, paymentDate = new Date(), paymentMethod = 'bank', context } = params;

    // CRITICAL: Use provided session OR create a new transaction
    const providedSession = context?.session;
    const session = providedSession || await mongoose.startSession();
    const shouldManageTransaction = !providedSession && session != null;

    try {
      if (shouldManageTransaction) {
        await session.startTransaction();
      }

      let query = this.models.EmployeeModel.findById(toObjectId(employeeId)).populate('userId', 'name email');
      if (session) query = query.session(session);
      
      const employee = await query;
      if (!employee) {
        throw new EmployeeNotFoundError(employeeId.toString());
      }

      // Check eligibility - with plugin method verification
      const canReceive = hasPluginMethod(employee, 'canReceiveSalary')
        ? (employee as unknown as { canReceiveSalary: () => boolean }).canReceiveSalary()
        : (employee.status === 'active' && (employee.compensation?.baseAmount || 0) > 0);

      if (!canReceive) {
        throw new NotEligibleError('Employee is not eligible to receive salary');
      }

      // Check for existing payroll
      const existingQuery = payrollQuery()
        .forEmployee(employeeId)
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
      const breakdown = await this.calculateSalaryBreakdown(employee, period, session);

      // Handle userId - could be ObjectId, populated doc, or null
      const userIdValue = employee.userId
        ? (typeof employee.userId === 'object' && '_id' in employee.userId
            ? (employee.userId as { _id: mongoose.Types.ObjectId })._id
            : employee.userId)
        : undefined;

      const [payrollRecord] = await this.models.PayrollRecordModel.create([{
        organizationId: employee.organizationId,
        employeeId: employee._id,
        userId: userIdValue,
        period,
        breakdown,
        status: 'processing',
        paymentMethod,
        processedAt: new Date(),
        processedBy: context?.userId ? toObjectId(context.userId) : undefined,
      }], session ? { session } : {});

      const [transaction] = await this.models.TransactionModel.create([{
        organizationId: employee.organizationId,
        type: 'expense',
        category: HRM_TRANSACTION_CATEGORIES.SALARY,
        amount: breakdown.netSalary,
        method: paymentMethod,
        status: 'completed',
        date: paymentDate,
        referenceId: employee._id,
        referenceModel: 'Employee',
        handledBy: context?.userId ? toObjectId(context.userId) : undefined,
        notes: `Salary payment - ${(employee.userId as { name?: string })?.name || employee.employeeId} (${month}/${year})`,
        metadata: {
          employeeId: employee.employeeId,
          payrollRecordId: payrollRecord._id,
          period: { month, year },
          breakdown: {
            base: breakdown.baseAmount,
            allowances: sumAllowances(breakdown.allowances),
            deductions: sumDeductions(breakdown.deductions),
            tax: breakdown.taxAmount || 0,
            gross: breakdown.grossSalary,
            net: breakdown.netSalary,
          },
        },
      }], session ? { session } : {});

      // Update payroll record with transaction reference
      payrollRecord.transactionId = transaction._id;
      payrollRecord.status = 'paid';
      payrollRecord.paidAt = paymentDate;
      await payrollRecord.save(session ? { session } : {});

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
      });

      return { payrollRecord, transaction, employee };

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
   * Process bulk payroll
   * 
   * ATOMICITY STRATEGY: Each employee is processed in its own transaction.
   * This allows partial success - some employees can succeed while others fail.
   * Failed employees don't affect successful ones.
   */
  async processBulkPayroll(params: ProcessBulkPayrollParams): Promise<BulkPayrollResult> {
    this.ensureInitialized();
    const { organizationId, month, year, employeeIds = [], paymentDate = new Date(), paymentMethod = 'bank', context } = params;

    const query: Record<string, unknown> = { organizationId: toObjectId(organizationId), status: 'active' };
    if (employeeIds.length > 0) {
      query._id = { $in: employeeIds.map(toObjectId) };
    }

    const employees = await this.models.EmployeeModel.find(query);

    const results: BulkPayrollResult = {
      successful: [],
      failed: [],
      total: employees.length,
    };

    // Process each employee in its own transaction for isolation
    for (const employee of employees) {
      try {
        // Each processSalary call manages its own transaction
        const result = await this.processSalary({
          employeeId: employee._id,
          month,
          year,
          paymentDate,
          paymentMethod,
          context: { ...context, session: undefined }, // Don't pass session - let processSalary create its own
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
    });

    return results;
  }

  /**
   * Get payroll history
   */
  async payrollHistory(params: PayrollHistoryParams): Promise<PayrollRecordDocument[]> {
    this.ensureInitialized();
    const { employeeId, organizationId, month, year, status, pagination = {} } = params;

    let queryBuilder = payrollQuery();
    if (employeeId) queryBuilder = queryBuilder.forEmployee(employeeId);
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
  async exportPayroll(params: ExportPayrollParams): Promise<PayrollRecordDocument[]> {
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

    return records;
  }

  // ========================================
  // Helper Methods
  // ========================================

  /**
   * Calculate salary breakdown with proper handling for:
   * - Effective dates on allowances/deductions
   * - Pro-rating for mid-period hires AND terminations
   * - Tax calculation
   * - Working days vs calendar days for attendance
   */
  private async calculateSalaryBreakdown(
    employee: EmployeeDocument,
    period: { month: number; year: number; startDate: Date; endDate: Date; payDate: Date },
    session?: ClientSession
  ): Promise<import('./types.js').PayrollBreakdown> {
    const comp = employee.compensation;
    let baseAmount = comp.baseAmount;

    // Calculate working days in the period (excluding weekends)
    const workingDaysInMonth = getWorkingDaysInMonth(period.year, period.month);
    
    // Pro-rating calculation considering both hire date AND termination date
    const proRating = this.calculateProRatingAdvanced(
      employee.hireDate,
      employee.terminationDate || null,
      period.startDate,
      period.endDate,
      workingDaysInMonth
    );

    if (proRating.isProRated && this.config.payroll.allowProRating) {
      baseAmount = Math.round(baseAmount * proRating.ratio);
    }

    // Filter allowances by effective date
    const effectiveAllowances = (comp.allowances || [])
      .filter((a) => isEffectiveForPeriod(a, period.startDate, period.endDate))
      .filter((a) => a.recurring !== false);

    // Filter deductions by effective date
    const effectiveDeductions = (comp.deductions || [])
      .filter((d) => isEffectiveForPeriod(d, period.startDate, period.endDate))
      .filter((d) => d.auto || d.recurring);

    // Apply pro-rating to allowances if needed
    const allowances = effectiveAllowances.map((a) => ({
      type: a.type,
      amount: proRating.isProRated && this.config.payroll.allowProRating
        ? Math.round(a.amount * proRating.ratio)
        : a.amount,
      taxable: a.taxable ?? true,
    }));

    // Apply pro-rating to deductions if needed
    const deductions = effectiveDeductions.map((d) => ({
      type: d.type,
      amount: proRating.isProRated && this.config.payroll.allowProRating
        ? Math.round(d.amount * proRating.ratio)
        : d.amount,
      description: d.description,
    }));

    // Attendance deduction calculation (uses working days, not calendar days)
    let attendanceDeduction = 0;
    if (this.models.AttendanceModel && this.config.payroll.attendanceIntegration) {
      attendanceDeduction = await this.calculateAttendanceDeduction(
        employee._id,
        employee.organizationId,
        period,
        baseAmount / proRating.workingDays, // Daily rate based on working days
        proRating.workingDays,
        session
      );
    }

    if (attendanceDeduction > 0) {
      deductions.push({
        type: 'absence',
        amount: attendanceDeduction,
        description: 'Unpaid leave deduction',
      });
    }

    // Calculate gross salary
    const grossSalary = calculateGross(baseAmount, allowances);
    
    // Calculate taxable amount (only taxable allowances)
    const taxableAllowances = allowances.filter(a => a.taxable);
    const taxableAmount = baseAmount + sumAllowances(taxableAllowances);
    
    // Calculate tax
    let taxAmount = 0;
    const currency = comp.currency || this.config.payroll.defaultCurrency;
    const taxBrackets = TAX_BRACKETS[currency] || [];
    
    if (taxBrackets.length > 0 && this.config.payroll.autoDeductions) {
      // Annualize the taxable amount for tax bracket calculation
      const annualTaxable = taxableAmount * 12;
      const annualTax = applyTaxBrackets(annualTaxable, taxBrackets);
      taxAmount = Math.round(annualTax / 12); // Monthly tax
    }

    // Add tax to deductions if applicable
    if (taxAmount > 0) {
      deductions.push({
        type: 'tax',
        amount: taxAmount,
        description: 'Income tax',
      });
    }

    // Calculate net salary
    const netSalary = calculateNet(grossSalary, deductions);

    return {
      baseAmount,
      allowances,
      deductions,
      grossSalary,
      netSalary,
      taxableAmount,
      taxAmount,
      workingDays: proRating.workingDays,
      actualDays: proRating.actualDays,
      proRatedAmount: proRating.isProRated ? baseAmount : 0,
      attendanceDeduction,
    };
  }

  /**
   * Advanced pro-rating calculation that handles:
   * - Mid-period hires
   * - Mid-period terminations
   * - Working days (not calendar days)
   */
  private calculateProRatingAdvanced(
    hireDate: Date,
    terminationDate: Date | null,
    periodStart: Date,
    periodEnd: Date,
    workingDaysInMonth: number
  ): {
    isProRated: boolean;
    ratio: number;
    workingDays: number;
    actualDays: number;
  } {
    const hire = new Date(hireDate);
    const termination = terminationDate ? new Date(terminationDate) : null;
    
    // Determine the actual start and end dates for this employee in this period
    const effectiveStart = hire > periodStart ? hire : periodStart;
    const effectiveEnd = termination && termination < periodEnd ? termination : periodEnd;
    
    // If employee wasn't active during this period
    if (effectiveStart > periodEnd || (termination && termination < periodStart)) {
      return {
        isProRated: true,
        ratio: 0,
        workingDays: workingDaysInMonth,
        actualDays: 0,
      };
    }
    
    // Calculate working days in the effective period
    const totalDays = diffInDays(periodStart, periodEnd) + 1;
    const actualDays = diffInDays(effectiveStart, effectiveEnd) + 1;
    
    // For working days calculation, we use a simple ratio
    // A more accurate implementation would count actual working days
    const ratio = actualDays / totalDays;
    const actualWorkingDays = Math.round(workingDaysInMonth * ratio);
    
    const isProRated = hire > periodStart || (termination !== null && termination < periodEnd);

    return {
      isProRated,
      ratio,
      workingDays: workingDaysInMonth,
      actualDays: actualWorkingDays,
    };
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
        tenantId: organizationId,
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
   * Create a new Payroll instance
   */
  static create(): Payroll {
    return new Payroll();
  }
}

// ============================================================================
// Payroll Builder
// ============================================================================

export interface ModelsConfig {
  EmployeeModel: Model<any>;
  PayrollRecordModel: Model<any>;
  TransactionModel: Model<any>;
  AttendanceModel?: Model<any> | null;
}

export interface PayrollBuilderOptions {
  models?: ModelsConfig;
  config?: DeepPartial<HRMConfig>;
  singleTenant?: SingleTenantConfig | null;
  logger?: Logger;
}

export class PayrollBuilder {
  private _models: ModelsConfig | null = null;
  private _config: DeepPartial<HRMConfig> | undefined;
  private _singleTenant: SingleTenantConfig | null = null;
  private _logger: Logger | undefined;

  /**
   * Set models
   */
  withModels(models: ModelsConfig): this {
    this._models = models;
    return this;
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
   * Build and initialize Payroll instance
   */
  build(): Payroll {
    if (!this._models) {
      throw new Error('Models are required. Call withModels() first.');
    }

    const payroll = new Payroll();
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

// ============================================================================
// Singleton Instance
// ============================================================================

let payrollInstance: Payroll | null = null;

/**
 * Get or create singleton Payroll instance
 */
export function getPayroll(): Payroll {
  if (!payrollInstance) {
    payrollInstance = new Payroll();
  }
  return payrollInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetPayroll(): void {
  payrollInstance = null;
  Container.resetInstance();
}

// ============================================================================
// Exports
// ============================================================================

export const payroll = getPayroll();
export default payroll;

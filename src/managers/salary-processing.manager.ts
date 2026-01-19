/**
 * @classytic/payroll - Salary Processing Manager
 *
 * Handles individual salary processing with transaction management,
 * retry logic, and multi-tenant security.
 */

import mongoose, { Model, type ClientSession } from 'mongoose';
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  AnyDocument,
  ProcessSalaryParams,
  ProcessSalaryResult,
  ObjectId,
  ObjectIdLike,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { NotEligibleError, DuplicatePayrollError, PayrollError } from '../errors/index.js';
import { payroll as payrollQuery, toObjectId } from '../utils/query-builders.js';
import { getPayPeriod } from '../utils/date.js';
import { generatePayrollIdempotencyKey, type IdempotencyManager } from '../core/idempotency.js';
import type { EventBus } from '../core/events.js';
import type { Container } from '../core/container.js';
import type { RepositoryManager } from './repository.manager.js';
import type { PayrollRepositories } from '../types.js';
import { hasPluginMethod } from '../utils/validation.js';

/**
 * SalaryProcessingManager
 *
 * Extracts salary processing logic from the main Payroll class.
 * Handles individual salary processing with proper transaction management,
 * idempotency, retry logic, and multi-tenant security.
 *
 * Key responsibilities:
 * - Process individual employee salary
 * - Calculate salary breakdowns
 * - Manage retry behavior (only safe retries)
 * - Cascade delete related records
 * - Create transactions and tax withholdings
 *
 * @example
 * ```typescript
 * const manager = new SalaryProcessingManager(models, container, events, idempotency, repositoryManager);
 * const result = await manager.processSalary({
 *   employeeId: 'EMP-001',
 *   organizationId: orgId,
 *   month: 1,
 *   year: 2024,
 * });
 * ```
 */
export class SalaryProcessingManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument
> {
  constructor(
    private readonly models: {
      EmployeeModel: Model<TEmployee>;
      PayrollRecordModel: Model<TPayrollRecord>;
      TransactionModel: Model<TTransaction>;
      AttendanceModel?: Model<TAttendance> | null;
      LeaveRequestModel?: Model<any> | null;
      TaxWithholdingModel?: Model<any> | null;
    },
    // TODO(@classytic/payroll): Container reserved for future plugin/extension support
    private readonly _container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>,
    private readonly events: EventBus,
    private readonly idempotency: IdempotencyManager,
    private readonly repositoryManager: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>,
    private readonly calculateSalaryBreakdownFn: any,
    private readonly resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
    private readonly resolveEmployeeIdFn: (
      employeeId: ObjectIdLike | string,
      employeeIdMode: 'auto' | 'objectId' | 'businessId' | undefined,
      organizationId: ObjectIdLike,
      session?: ClientSession
    ) => Promise<mongoose.Types.ObjectId>,
    private readonly findEmployeeFn: any,
    private readonly updatePayrollStatsFn: any,
    private readonly config: any
  ) {}

  /**
   * Cascade delete payroll record and related documents
   * Deletes the payroll record and any related tax withholdings
   *
   * @param payrollRecordId - ID of payroll record to delete
   * @param session - Optional transaction session
   * @private
   */
  private async cascadeDeletePayrollRecord(
    payrollRecordId: mongoose.Types.ObjectId,
    session?: mongoose.ClientSession
  ): Promise<void> {
    const sessionOpt = session ? { session } : {};

    // Delete the payroll record itself
    await this.models.PayrollRecordModel.deleteOne({ _id: payrollRecordId }, sessionOpt);

    // Cascade delete related tax withholdings (if model provided)
    if (this.models.TaxWithholdingModel) {
      const deleted = await this.models.TaxWithholdingModel.deleteMany(
        { payrollRecordId },
        sessionOpt
      );

      if (deleted.deletedCount && deleted.deletedCount > 0) {
        getLogger().info('Cascade deleted tax withholdings', {
          payrollRecordId: payrollRecordId.toString(),
          count: deleted.deletedCount,
        });
      }
    }

    // Note: We do NOT delete transactions because:
    // 1. If transactionId exists, we should never reach this code (caught earlier)
    // 2. Transactions are financial records that should be preserved even if orphaned
    // 3. Transaction model is app-provided and we can't assume its structure
  }

  /**
   * Process salary for a single employee
   */
  async processSalary(
    params: ProcessSalaryParams
  ): Promise<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, month, year, paymentDate = new Date(), paymentMethod = 'bank', attendance, options, context, idempotencyKey } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    // Idempotency: Generate or use provided key
    const resolvedEmployeeId = await this.resolveEmployeeIdFn(employeeId, employeeIdMode, orgId, context?.session);
    const idempotentKey = idempotencyKey || generatePayrollIdempotencyKey(orgId, resolvedEmployeeId, month, year);

    // Check idempotency cache (Stripe-style)
    const cached = this.idempotency.get<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>>(idempotentKey);
    if (cached) {
      getLogger().info('Returning cached payroll result (idempotent)', {
        idempotencyKey: idempotentKey,
        cachedAt: cached.createdAt,
      });
      return cached.value;
    }

    // CRITICAL: Transaction management - enforce atomicity
    const providedSession = context?.session;
    const session = providedSession || await mongoose.startSession();
    const weCreatedSession = !providedSession; // Track if we own the session

    // Determine if we need to start a transaction:
    // 1. No session provided (we created it), OR
    // 2. Session provided but not already in a transaction
    const sessionNeedsTransaction = providedSession && !providedSession.inTransaction();
    const shouldManageTransaction = !providedSession || sessionNeedsTransaction;

    try {
      // Start transaction if needed to ensure atomicity
      // This prevents partial writes even when session provided without transaction
      if (shouldManageTransaction && session) {
        await session.startTransaction();
      }

      // Create request-scoped repositories for proper multi-tenant isolation
      const repos = this.repositoryManager.getReposForRequest(orgId) as PayrollRepositories<TEmployee, TPayrollRecord, any, TTransaction>;

      // SECURE: Use secure lookup with organizationId isolation
      const employee = await this.findEmployeeFn({
        employeeId,  // Supports both ObjectId and string
        employeeIdMode,  // Explicit disambiguation if needed
        organizationId: orgId,
        session,
        populate: 'userId'
      });

      // Check eligibility - with plugin method verification
      const canReceive = hasPluginMethod(employee, 'canReceiveSalary')
        ? (employee as unknown as { canReceiveSalary: () => boolean }).canReceiveSalary()
        : ((employee.status === 'active' || employee.status === 'on_leave') && (employee.compensation?.baseAmount || 0) > 0);

      if (!canReceive) {
        throw new NotEligibleError('Employee is not eligible to receive salary');
      }

      // Check for existing payroll
      // ✅ Use employee._id (not employeeId param) since we've resolved the employee
      // ✅ DEFENSE-IN-DEPTH: Include organizationId even though employee is already org-scoped
      const existingQuery = payrollQuery()
        .forOrganization(orgId)
        .forEmployee(employee._id)
        .forPeriod(month, year)
        .build();

      let existingRecordQuery = this.models.PayrollRecordModel.findOne(existingQuery);
      if (session) existingRecordQuery = existingRecordQuery.session(session);
      const existingRecord = await existingRecordQuery;

      // Handle existing records based on status
      if (existingRecord) {
        // ✅ RETRY SAFETY: Only allow retry for truly failed operations
        // - 'paid'/'processing': Cannot retry (already completed/in-progress)
        // - 'voided': Cannot retry (intentionally cancelled, keep for audit)
        // - 'reversed': Cannot retry (was reversed, keep for audit)
        // - 'pending' with transactionId: Cannot retry (has financial record)
        // - 'failed' with transactionId: Cannot retry (has orphaned transaction)
        // - 'failed' without transactionId: CAN retry (safe to delete and retry)

        if (existingRecord.status === 'paid' || existingRecord.status === 'processing') {
          throw new DuplicatePayrollError(employee.employeeId, month, year);
        }

        if (existingRecord.status === 'voided' || existingRecord.status === 'reversed') {
          throw new PayrollError(
            `Cannot retry ${existingRecord.status} payroll for employee ${employee.employeeId} in ${month}/${year} - preserve audit trail`,
            'DUPLICATE_PAYROLL',
            409,
            { status: existingRecord.status, reason: 'audit_trail_preservation' }
          );
        }

        // For pending or failed with transaction: cannot retry (would orphan transaction)
        if (existingRecord.transactionId) {
          throw new PayrollError(
            `Cannot retry ${existingRecord.status} payroll for employee ${employee.employeeId} in ${month}/${year} with existing transaction - would orphan financial records`,
            'DUPLICATE_PAYROLL',
            409,
            {
              status: existingRecord.status,
              transactionId: existingRecord.transactionId.toString(),
              reason: 'financial_record_orphan_prevention'
            }
          );
        }

        // ONLY retry failed records without transactions (safe to delete)
        if (existingRecord.status === 'failed') {
          getLogger().info('Removing failed record without transaction for retry', {
            recordId: existingRecord._id.toString(),
            status: existingRecord.status,
            employeeId: employee.employeeId,
            month,
            year,
          });

          // Cascade delete related records (tax withholdings, etc.)
          await this.cascadeDeletePayrollRecord(existingRecord._id, session);
        } else {
          // pending without transaction - also cannot retry to preserve data integrity
          throw new PayrollError(
            `Cannot retry ${existingRecord.status} payroll for employee ${employee.employeeId} in ${month}/${year} - preserve data integrity`,
            'DUPLICATE_PAYROLL',
            409,
            { status: existingRecord.status, reason: 'data_integrity_preservation' }
          );
        }
      }

      const period = { ...getPayPeriod(month, year), payDate: paymentDate };
      const breakdown = await this.calculateSalaryBreakdownFn(employee, period, { attendance, options }, session);

      // Handle userId - could be ObjectId, populated doc, or null
      // Extract userId if present (optional for guest employees)
      const userIdValue = employee.userId
        ? (typeof employee.userId === 'object' && '_id' in employee.userId
            ? (employee.userId as { _id: mongoose.Types.ObjectId })._id
            : (employee.userId as mongoose.Types.ObjectId))
        : undefined;

      // TODO(@classytic/payroll): Refactor to use properly typed generic create operations
      // Current limitation: Mongoose's Model.create() doesn't play well with generic types
      // when the document type is parametric. Consider creating a typed wrapper or using
      // repository pattern exclusively to avoid these casts.
      // SECURITY: Use resolved orgId, not employee.organizationId (could be stale/missing)
      const [payrollRecord] = await (this.models.PayrollRecordModel as Model<PayrollRecordDocument>).create([{
        organizationId: orgId,
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
      // Use employee's payment frequency for accurate transaction tags
      const frequency = employee.compensation.frequency || 'monthly';
      // SECURITY: Use resolved orgId, not employee.organizationId (could be stale/missing)
      // SECURITY: Use normalized userIdValue, not employee.userId (could be populated object)
      const [transaction] = await (this.models.TransactionModel as Model<AnyDocument>).create([{
        organizationId: orgId,

        // Classification (shared-types)
        type: 'salary',
        flow: 'outflow',
        tags: ['recurring', 'payroll', frequency],
        status: 'completed',

        // Amounts (shared-types convention: amount = gross, net = after deductions)
        amount: breakdown.grossSalary, // Gross amount
        net: breakdown.netSalary, // Net after deductions
        currency: employee.compensation.currency || this.config.payroll?.defaultCurrency || 'USD',
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
        customerId: userIdValue, // Use normalized value (handles populated docs)
        processedBy: context?.userId ? toObjectId(context.userId) : undefined,

        // ✅ UNIFIED: Breakdown structure
        breakdown: {
          base: breakdown.baseAmount,
          additions: breakdown.allowances.map((a: any) => ({
            type: a.type,
            amount: a.amount,
            description: a.type,
            isTaxable: a.taxable
          })),
          deductions: breakdown.deductions.map((d: any) => ({
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
        const { TaxWithholdingService } = await import('../services/tax-withholding.service.js');
        const taxService = new TaxWithholdingService(
          this.models.TaxWithholdingModel,
          this.models.TransactionModel as any,
          this.events
        );

        // SECURITY: Use resolved orgId and normalized userIdValue (consistent with payroll/transaction)
        await taxService.createFromBreakdown({
          organizationId: orgId,
          employeeId: employee._id,
          userId: userIdValue,
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
          currency: employee.compensation.currency || this.config.payroll?.defaultCurrency || 'USD',
          session,
          context,
        });
      }

      // Update employee payroll stats
      await this.updatePayrollStatsFn(employee, breakdown.netSalary, paymentDate, repos, session);

      // Commit transaction if we created it
      if (shouldManageTransaction && session) {
        await session.commitTransaction();
      }

      // Emit event (after commit to ensure data is persisted)
      // SECURITY: Use resolved orgId for consistent tenant scoping
      this.events.emitSync('salary:processed', {
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
        organizationId: orgId,
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
      this.idempotency.set(idempotentKey, result);

      return result;

    } catch (error) {
      // Rollback transaction if we created it
      if (shouldManageTransaction && session?.inTransaction()) {
        await session.abortTransaction();
      }

      // Handle duplicate payroll record (E11000 error from unique index)
      if ((error as any).code === 11000) {
        getLogger().warn('Duplicate payroll record detected, fetching existing', {
          employeeId: resolvedEmployeeId.toString(),
          month,
          year,
          idempotencyKey: idempotentKey,
        });

        // Determine if session is safe to use for reads:
        // - If we managed the transaction, we already aborted it, so session is safe
        // - If caller's session is still in a transaction (aborted state), don't use it
        // - If session is not in a transaction, it's safe to use for read consistency
        const sessionSafeForReads = session && (
          shouldManageTransaction || // We aborted it
          !session.inTransaction()   // Not in a transaction
        );

        // Fetch existing payroll record with populated transaction
        // ✅ DEFENSE-IN-DEPTH: Include organizationId for multi-tenant safety
        // ✅ FIX: Only use session if safe (avoids "transaction aborted" errors)
        let existingPayrollQuery = (this.models.PayrollRecordModel as Model<PayrollRecordDocument>)
          .findOne({
            organizationId: orgId,
            employeeId: resolvedEmployeeId,
            'period.month': month,
            'period.year': year,
          })
          .populate('transactionId');
        if (sessionSafeForReads) existingPayrollQuery = existingPayrollQuery.session(session);
        const existingPayroll = await existingPayrollQuery;

        if (existingPayroll && existingPayroll.transactionId) {
          // Fetch employee for the result
          // ✅ DEFENSE-IN-DEPTH: Include organizationId for multi-tenant safety
          // ✅ FIX: Only use session if safe
          let existingEmployeeQuery = this.models.EmployeeModel.findOne({
            _id: resolvedEmployeeId,
            organizationId: orgId,
          });
          if (sessionSafeForReads) existingEmployeeQuery = existingEmployeeQuery.session(session);
          const existingEmployee = await existingEmployeeQuery;

          // ✅ FIX: Guard against null employee (deleted or org mismatch)
          if (!existingEmployee) {
            throw new PayrollError(
              `Data inconsistency: Payroll record exists but employee not found for ${resolvedEmployeeId.toString()} in organization ${orgId.toString()}. ` +
              `The employee may have been deleted after payroll was processed.`,
              'PAYROLL_ERROR',
              500,
              {
                reason: 'data_inconsistency',
                employeeId: resolvedEmployeeId.toString(),
                organizationId: orgId.toString(),
                payrollRecordId: existingPayroll._id.toString(),
                month,
                year,
              }
            );
          }

          const result = {
            payrollRecord: existingPayroll as unknown as TPayrollRecord,
            transaction: existingPayroll.transactionId as unknown as TTransaction,
            employee: existingEmployee as unknown as TEmployee,
          };

          // Cache for future idempotent requests
          this.idempotency.set(idempotentKey, result);

          return result;
        }
      }

      throw error;
    } finally {
      // Only end session if we created it (not if caller provided it)
      // This prevents closing caller's session
      if (weCreatedSession && session) {
        await session.endSession();
      }
    }
  }
}

/**
 * Factory function for creating SalaryProcessingManager
 *
 * TODO(@classytic/payroll): Migrate to context-based construction pattern.
 * See managers/context.ts for SalaryProcessingContext interface.
 * The `any` casts here are due to TypeScript's limitations with generic
 * class instantiation across module boundaries. Future refactor should:
 * 1. Use SalaryProcessingContext to group all dependencies
 * 2. Create properly typed overloads or use conditional types
 *
 * @see SalaryProcessingContext in managers/context.ts
 */
export function createSalaryProcessingManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TAttendance extends AnyDocument = AnyDocument
>(
  models: {
    EmployeeModel: Model<TEmployee>;
    PayrollRecordModel: Model<TPayrollRecord>;
    TransactionModel: Model<TTransaction>;
    AttendanceModel?: Model<TAttendance> | null;
    LeaveRequestModel?: Model<any> | null;
    TaxWithholdingModel?: Model<any> | null;
  },
  container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>,
  events: EventBus,
  idempotency: IdempotencyManager,
  repositoryManager: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>,
  calculateSalaryBreakdownFn: any, // TODO: Type as CalculateSalaryBreakdownFn from context.ts
  resolveOrganizationIdFn: any,    // TODO: Type as ResolveOrganizationIdFn from context.ts
  resolveEmployeeIdFn: any,        // TODO: Type as ResolveEmployeeIdFn from context.ts
  findEmployeeFn: any,             // TODO: Type as FindEmployeeFn from context.ts
  updatePayrollStatsFn: any,       // TODO: Type as UpdatePayrollStatsFn from context.ts
  config: any                      // TODO: Type as HRMConfig
): SalaryProcessingManager<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
  return new SalaryProcessingManager(
    models,
    container as any,
    events,
    idempotency,
    repositoryManager as any,
    calculateSalaryBreakdownFn,
    resolveOrganizationIdFn,
    resolveEmployeeIdFn,
    findEmployeeFn,
    updatePayrollStatsFn,
    config
  ) as any;
}

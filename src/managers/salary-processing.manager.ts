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
  LeaveRequestDocument,
  ProcessSalaryParams,
  ProcessSalaryResult,
  ObjectId,
  ObjectIdLike,
  TaxWithholdingModel,
  PayrollRunType,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { NotEligibleError, DuplicatePayrollError, PayrollError } from '../errors/index.js';
import { payroll as payrollQuery, toObjectId } from '../utils/query-builders.js';
import { getPayPeriod, getPayPeriodForFrequency } from '../utils/date.js';
import { generatePayrollIdempotencyKey, type IdempotencyManager } from '../core/idempotency.js';
import type { EventBus } from '../core/events.js';
import type { Container } from '../core/container.js';
import type { RepositoryManager } from './repository.manager.js';
import type { PayrollRepositories } from '../types.js';
import { hasPluginMethod } from '../utils/validation.js';
import { getEmployeeEmail, getEmployeeName } from '../utils/employee-type-guards.js';
import { isDuplicateKeyError, parseDuplicateKeyError } from '../utils/type-guards.js';

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
      LeaveRequestModel?: Model<LeaveRequestDocument> | null;
      TaxWithholdingModel?: TaxWithholdingModel | null;
    },
    // TODO(@classytic/payroll): Container reserved for future plugin/extension support
    private readonly _container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>,
    private readonly events: EventBus,
    private readonly idempotency: IdempotencyManager,
    private readonly repositoryManager: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>,
    private readonly calculateSalaryBreakdownFn: (
      employee: EmployeeDocument,
      period: { month: number; year: number; startDate: Date; endDate: Date; payDate: Date },
      input?: { attendance?: import('../core/config.js').AttendanceInput | null; options?: import('../core/config.js').PayrollProcessingOptions },
      session?: ClientSession
    ) => Promise<import('../types.js').PayrollBreakdown>,
    private readonly resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
    private readonly resolveEmployeeIdFn: (
      employeeId: ObjectIdLike | string,
      employeeIdMode: 'auto' | 'objectId' | 'businessId' | undefined,
      organizationId: ObjectIdLike,
      session?: ClientSession
    ) => Promise<mongoose.Types.ObjectId>,
    private readonly findEmployeeFn: import('./context.js').FindEmployeeFn<TEmployee>,
    private readonly updatePayrollStatsFn: import('./context.js').UpdatePayrollStatsFn<TEmployee, TPayrollRecord, TTransaction>,
    private readonly config: import('../types.js').HRMConfig
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
    const {
      employeeId,
      employeeIdMode,
      organizationId: explicitOrgId,
      month,
      year,
      paymentDate = new Date(),
      paymentMethod = 'bank',
      attendance,
      options,
      context,
      idempotencyKey,
      payrollRunType = 'regular',
      retroactiveAdjustment,
      employerContributions,
    } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId || context?.organizationId);

    // Create request-scoped repositories for proper multi-tenant isolation
    const repos = this.repositoryManager.getReposForRequest(orgId) as PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>;

    // Resolve employee ID and fetch employee to get frequency for proper idempotency key
    const resolvedEmployeeId = await this.resolveEmployeeIdFn(employeeId, employeeIdMode, orgId, context?.session);

    // Fetch employee early to determine frequency for idempotency key generation
    // This is necessary for non-monthly frequencies where the same month can have multiple pay periods
    const employee = await this.findEmployeeFn({
      employeeId,
      employeeIdMode,
      organizationId: orgId,
      session: context?.session ?? undefined,
      populate: 'userId'
    });

    // Calculate period based on employee's payment frequency
    // This is needed for proper idempotency key generation
    const employeeFrequency = employee.compensation?.frequency || 'monthly';
    const frequencyPeriod = getPayPeriodForFrequency(employeeFrequency, paymentDate, month, year);
    const period = { ...frequencyPeriod, payDate: paymentDate };

    // Idempotency: Generate or use provided key
    // For non-monthly frequencies, include period.startDate to differentiate runs within the same month
    const idempotentKey = idempotencyKey || generatePayrollIdempotencyKey(
      orgId,
      resolvedEmployeeId,
      month,
      year,
      payrollRunType,
      employeeFrequency !== 'monthly' ? period.startDate : undefined
    );

    // Check idempotency cache (Stripe-style)
    const cached = this.idempotency.get<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>>(idempotentKey);
    if (cached) {
      getLogger().info('Returning cached payroll result (idempotent)', {
        idempotencyKey: idempotentKey,
        cachedAt: cached.createdAt,
        frequency: employeeFrequency,
      });
      return cached.value;
    }

    // CRITICAL: Transaction management - enforce atomicity
    const providedSession = context?.session;

    // If session provided, use it directly (caller manages transaction lifecycle)
    // Otherwise, use mongokit's withTransaction() for proper retry handling
    if (providedSession) {
      return this._processSalaryWithSession(providedSession, repos, params, resolvedEmployeeId, orgId, idempotentKey, employee, period);
    }

    // Use mongokit's withTransaction() to prevent transaction number mismatch
    // This properly handles MongoDB retries and transaction lifecycle
    try {
      return await repos.employee.withTransaction(
        async (session) => this._processSalaryWithSession(session, repos, params, resolvedEmployeeId, orgId, idempotentKey, employee, period),
        { allowFallback: true } // Fallback to non-transactional for standalone MongoDB
      );
    } catch (error) {
      // Handle duplicate key error OUTSIDE transaction to avoid session corruption
      // E11000 inside a transaction auto-aborts it; catching inside withTransaction()
      // and returning success causes commit to fail on already-aborted transaction
      if (isDuplicateKeyError(error)) {
        return this._handleDuplicateKeyError(error, resolvedEmployeeId, orgId, params.month, params.year, payrollRunType, idempotentKey, period.startDate, employeeFrequency);
      }
      throw error;
    }
  }

  /**
   * Handle duplicate key error by fetching existing payroll record
   * MUST be called OUTSIDE transaction to avoid session state corruption
   */
  private async _handleDuplicateKeyError(
    error: unknown,
    resolvedEmployeeId: ObjectId,
    orgId: ObjectId,
    month: number,
    year: number,
    payrollRunType: PayrollRunType,
    idempotentKey: string,
    periodStartDate: Date,
    employeeFrequency: string
  ): Promise<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>> {
    // Safe cast: only called after isDuplicateKeyError() returns true
    const duplicateField = parseDuplicateKeyError(error as import('mongodb').MongoServerError);
    getLogger().warn('Duplicate payroll record detected (E11000), fetching existing', {
      employeeId: resolvedEmployeeId.toString(),
      month,
      year,
      payrollRunType,
      idempotencyKey: idempotentKey,
      duplicateField,
      periodStartDate: periodStartDate.toISOString(),
      frequency: employeeFrequency,
    });

    // Build query to fetch existing payroll record
    // For non-monthly frequencies, include period.startDate to find the correct record
    const query: Record<string, unknown> = {
      organizationId: orgId,
      employeeId: resolvedEmployeeId,
      'period.month': month,
      'period.year': year,
      payrollRunType,
    };

    // For non-monthly frequencies, include period.startDate to fetch the correct record
    if (employeeFrequency !== 'monthly') {
      query['period.startDate'] = periodStartDate;
    }

    // Fetch existing payroll record with populated transaction (NO session - clean query)
    const existingPayroll = await (this.models.PayrollRecordModel as Model<PayrollRecordDocument>)
      .findOne(query)
      .populate('transactionId');

    if (existingPayroll && existingPayroll.transactionId) {
      // Fetch employee for the result
      const existingEmployee = await this.models.EmployeeModel.findOne({
        _id: resolvedEmployeeId,
        organizationId: orgId,
      });

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

    // Existing record found but missing transactionId - orphaned/partial record
    // This can happen when a previous non-transactional attempt failed after creating
    // the payroll record but before creating the transaction.
    if (existingPayroll && !existingPayroll.transactionId) {
      const status = existingPayroll.status;

      // If the record is 'failed', the retry logic in _processSalaryWithSession
      // will cascade-delete it on the next attempt. Throw a retryable error.
      if (status === 'failed') {
        throw new PayrollError(
          `Previous payroll attempt failed for employee in ${month}/${year}. Retry to automatically clean up and reprocess.`,
          'DUPLICATE_PAYROLL',
          409,
          {
            existingRecordId: existingPayroll._id.toString(),
            status,
            reason: 'orphaned_failed_record',
            retryable: true,
          }
        );
      }

      // For processing/pending without transaction, mark as failed for future retry
      if (status === 'processing' || status === 'pending') {
        try {
          await (this.models.PayrollRecordModel as Model<PayrollRecordDocument>).updateOne(
            { _id: existingPayroll._id },
            { $set: { status: 'failed' } }
          );
          getLogger().warn('Marked orphaned payroll record as failed', {
            payrollRecordId: existingPayroll._id.toString(),
            previousStatus: status,
          });
        } catch {
          // Best-effort cleanup
        }

        throw new PayrollError(
          `Previous payroll attempt was incomplete for employee in ${month}/${year}. The record has been marked as failed - retry to reprocess.`,
          'DUPLICATE_PAYROLL',
          409,
          {
            existingRecordId: existingPayroll._id.toString(),
            status: 'failed',
            reason: 'orphaned_record_cleaned',
            retryable: true,
          }
        );
      }
    }

    // No valid existing record found - rethrow original error
    throw error;
  }

  /**
   * Internal: Process salary with a specific session
   * Extracted to support both external sessions and withTransaction() pattern
   *
   * @param session - Database session (for transactions)
   * @param repos - Request-scoped repositories
   * @param params - Salary processing parameters
   * @param resolvedEmployeeId - Pre-resolved employee ObjectId
   * @param orgId - Organization ID
   * @param idempotentKey - Pre-calculated idempotency key
   * @param prefetchedEmployee - Pre-fetched employee (to avoid duplicate DB call)
   * @param prefetchedPeriod - Pre-calculated period (to avoid duplicate calculation)
   */
  private async _processSalaryWithSession(
    session: ClientSession | null,
    repos: PayrollRepositories<TEmployee, TPayrollRecord, LeaveRequestDocument, TTransaction>,
    params: ProcessSalaryParams,
    resolvedEmployeeId: ObjectId,
    orgId: ObjectId,
    idempotentKey: string,
    prefetchedEmployee: TEmployee,
    prefetchedPeriod: { month: number; year: number; startDate: Date; endDate: Date; workingDays: number; payDate: Date }
  ): Promise<ProcessSalaryResult<TEmployee, TPayrollRecord, TTransaction>> {
    const {
      month,
      year,
      paymentDate = new Date(),
      paymentMethod = 'bank',
      attendance,
      options,
      context,
      payrollRunType = 'regular',
      retroactiveAdjustment,
      employerContributions,
    } = params;

    // Convert null to undefined for Mongoose API compatibility
    const mongooseSession = session ?? undefined;

    // Track created records for non-transactional cleanup on failure
    let createdPayrollRecordId: mongoose.Types.ObjectId | null = null;
    let createdTransactionId: mongoose.Types.ObjectId | null = null;

    try {
      // Use pre-fetched employee (already fetched in processSalary for idempotency key generation)
      const employee = prefetchedEmployee;

      // Check eligibility - with plugin method verification
      const canReceive = hasPluginMethod(employee, 'canReceiveSalary')
        ? (employee as unknown as { canReceiveSalary: () => boolean }).canReceiveSalary()
        : ((employee.status === 'active' || employee.status === 'on_leave') && (employee.compensation?.baseAmount || 0) > 0);

      if (!canReceive) {
        throw new NotEligibleError('Employee is not eligible to receive salary');
      }

      // Use pre-calculated period (already calculated in processSalary for idempotency key)
      const period = prefetchedPeriod;
      const employeeFrequency = employee.compensation?.frequency || 'monthly';

      // Check for existing payroll of the SAME run type AND period
      // ✅ Use employee._id (not employeeId param) since we've resolved the employee
      // ✅ DEFENSE-IN-DEPTH: Include organizationId even though employee is already org-scoped
      // ✅ Include payrollRunType to allow multiple run types per period (regular + supplemental)
      // ✅ Include period.startDate for non-monthly frequencies to allow multiple runs/month
      const existingQuery: Record<string, unknown> = {
        ...payrollQuery()
          .forOrganization(orgId)
          .forEmployee(employee._id)
          .forPeriod(month, year)
          .build(),
        payrollRunType, // Only check for same run type
      };

      // For non-monthly frequencies, include period.startDate in duplicate check
      // This allows multiple runs per month (e.g., 4 weekly runs in March)
      // Monthly frequency uses only month/year for the entire calendar month
      if (employeeFrequency !== 'monthly') {
        existingQuery['period.startDate'] = period.startDate;
      }

      let existingRecordQuery = this.models.PayrollRecordModel.findOne(existingQuery);
      if (mongooseSession) existingRecordQuery = existingRecordQuery.session(mongooseSession);
      const existingRecord = await existingRecordQuery;

      // Handle existing records based on status
      if (existingRecord) {
        // ✅ RETRY SAFETY: Only allow retry for truly failed operations
        // - 'paid'/'processing': Cannot retry (already completed/in-progress)
        // - 'voided': Cannot retry (intentionally cancelled, keep for audit)
        // - 'reversed': CAN re-process (was wrong, create new record, keep reversed for audit)
        // - 'pending' with transactionId: Cannot retry (has financial record)
        // - 'failed' with transactionId: Cannot retry (has orphaned transaction)
        // - 'failed' without transactionId: CAN retry (safe to delete and retry)

        if (existingRecord.status === 'paid' || existingRecord.status === 'processing') {
          throw new DuplicatePayrollError(employee.employeeId, month, year, payrollRunType);
        }

        if (existingRecord.status === 'voided') {
          throw new PayrollError(
            `Cannot re-process voided payroll for employee ${employee.employeeId} in ${month}/${year}. ` +
            `To re-process, first call restorePayroll() to restore the voided record to 'pending' status.`,
            'VOIDED_PAYROLL_REPROCESS',
            409,
            {
              status: existingRecord.status,
              reason: 'voided_requires_restore',
              suggestedAction: 'Call restorePayroll({ payrollRecordId }) first',
              existingRecordId: existingRecord._id.toString(),
            }
          );
        }

        // Reversed: Allow re-processing (create new record, keep reversed for audit trail)
        if (existingRecord.status === 'reversed') {
          getLogger().info('Creating new payroll after reversal', {
            reversedRecordId: existingRecord._id.toString(),
            employeeId: employee.employeeId,
            month,
            year,
          });
          // Continue to create new record - don't delete reversed, don't throw
        } else {
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

          // Retry failed OR pending records without transactions (safe to delete)
          // These represent incomplete operations that can be safely retried
          if (existingRecord.status === 'failed' || existingRecord.status === 'pending') {
            getLogger().info('Removing incomplete record without transaction for retry', {
              recordId: existingRecord._id.toString(),
              status: existingRecord.status,
              employeeId: employee.employeeId,
              month,
              year,
              payrollRunType,
            });

            // Cascade delete related records (tax withholdings, etc.)
            await this.cascadeDeletePayrollRecord(existingRecord._id, mongooseSession);
          } else {
            // Unknown status without transaction - should not happen, but block for safety
            throw new PayrollError(
              `Cannot retry ${existingRecord.status} payroll for employee ${employee.employeeId} in ${month}/${year} - unexpected status`,
              'DUPLICATE_PAYROLL',
              409,
              { status: existingRecord.status, reason: 'unexpected_status' }
            );
          }
        }
      }

      // Period was calculated above (before duplicate check)
      const breakdown = await this.calculateSalaryBreakdownFn(employee, period, { attendance, options }, mongooseSession);

      // Handle userId - could be ObjectId, populated doc, or null
      // Extract userId if present (optional for guest employees)
      const userIdValue = employee.userId
        ? (typeof employee.userId === 'object' && '_id' in employee.userId
            ? (employee.userId as { _id: mongoose.Types.ObjectId })._id
            : (employee.userId as mongoose.Types.ObjectId))
        : undefined;

      // SECURITY: Use resolved orgId, not employee.organizationId (could be stale/missing)
      // Routes through repository for multi-tenant plugin enforcement
      const payrollRecord = await repos.payrollRecord.create({
        organizationId: orgId,
        employeeId: employee._id,
        userId: userIdValue,
        period,
        breakdown,
        status: 'processing',
        paymentMethod,
        processedAt: new Date(),
        processedBy: context?.userId ? toObjectId(context.userId) : undefined,
        // Payroll run type and related fields (v2.8.0+)
        payrollRunType,
        // Payment frequency at time of processing (v2.9.0+)
        // Stored for proper idempotency key reconstruction in void/reverse
        paymentFrequency: employeeFrequency,
        retroactiveAdjustment,
        employerContributions,
      }, mongooseSession ? { session: mongooseSession } : {}) as TPayrollRecord & PayrollRecordDocument;

      // Track for non-transactional cleanup
      createdPayrollRecordId = payrollRecord._id;

      // Aligned with @classytic/shared-types ITransactionCreateInput
      // Use employee's payment frequency for accurate transaction tags
      const frequency = employee.compensation.frequency || 'monthly';
      // SECURITY: Use resolved orgId, not employee.organizationId (could be stale/missing)
      // SECURITY: Use normalized userIdValue, not employee.userId (could be populated object)
      // Routes through repository for multi-tenant plugin enforcement
      const transaction = await repos.transaction!.create({
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

        // Breakdown structure
        breakdown: {
          base: breakdown.baseAmount,
          additions: breakdown.allowances.map((a) => ({
            type: a.type,
            amount: a.amount,
            description: a.type,
            isTaxable: a.taxable
          })),
          deductions: breakdown.deductions.map((d) => ({
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
        // Include payrollRecordId to allow new transaction on re-processing after reversal
        idempotencyKey: `${idempotentKey}:${payrollRecord._id}`,

        // Timestamps (shared-types)
        processedAt: paymentDate,
        completedAt: paymentDate,

        // Description & metadata
        description: `Salary payment - ${getEmployeeName(employee)} (${month}/${year})`,
        notes: breakdown.proRatedAmount ? `Pro-rated: ${breakdown.actualDays}/${breakdown.workingDays} days` : undefined,
        metadata: {
          employeeId: employee.employeeId,
          email: getEmployeeEmail(employee),
          payrollRecordId: payrollRecord._id.toString(),
        },
      }, mongooseSession ? { session: mongooseSession } : {}) as TTransaction & { _id: mongoose.Types.ObjectId };

      // Track for non-transactional cleanup (preserve transaction reference on failure)
      createdTransactionId = transaction._id;

      // Update payroll record with transaction reference
      (payrollRecord as PayrollRecordDocument).transactionId = transaction._id;
      (payrollRecord as PayrollRecordDocument).status = 'paid';
      (payrollRecord as PayrollRecordDocument).paidAt = paymentDate;
      await (payrollRecord as PayrollRecordDocument).save(mongooseSession ? { session: mongooseSession } : {});

      // Create Tax Withholding Records (if tax > 0 and model provided)
      if (breakdown.taxAmount && breakdown.taxAmount > 0 && this.models.TaxWithholdingModel) {
        const { TaxWithholdingService } = await import('../services/tax-withholding.service.js');
        const taxService = new TaxWithholdingService(
          this.models.TaxWithholdingModel,
          this.models.TransactionModel as import('../types.js').AnyModel,
          this.events
        );

        // SECURITY: Use resolved orgId and normalized userIdValue (consistent with payroll/transaction)
        await taxService.createFromBreakdown({
          organizationId: orgId,
          employeeId: employee._id,
          employeeBusinessId: employee.employeeId,
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
          session: mongooseSession,
          context,
        });
      }

      // Update employee payroll stats
      await this.updatePayrollStatsFn(employee, breakdown.netSalary, paymentDate, repos, mongooseSession);

      // Emit event (transaction will be committed by withTransaction() or caller)
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
      /**
       * NON-TRANSACTIONAL FALLBACK CLEANUP
       *
       * When running without transactions (standalone MongoDB), failures after
       * payroll record creation require cleanup. We mark as 'failed' rather than
       * delete to preserve the transactionId reference and prevent orphaning.
       *
       * Why mark as 'failed' instead of deleting:
       * 1. If transactionId exists, we preserve it on the payroll record
       * 2. The retry logic sees `existingRecord.transactionId` and blocks cascade-deletion
       * 3. This prevents orphaning financial transactions in the database
       * 4. Users can investigate failed records with transaction references
       *
       * Recovery guidance for operators:
       * - Records with 'failed' status AND transactionId need manual investigation
       * - Records with 'failed' status WITHOUT transactionId can be safely retried
       *
       * @see recoverStuckPayrolls() for automated recovery of stuck records
       */
      if (!session && createdPayrollRecordId) {
        try {
          // CRITICAL: Check current status before overwriting
          // If record is already 'paid' with a transaction, don't corrupt it
          const existingRecord = await this.models.PayrollRecordModel.findById(createdPayrollRecordId);

          if (existingRecord?.status === 'paid' && existingRecord?.transactionId) {
            // Record is already paid with transaction - do NOT mark as failed
            // This preserves ledger integrity when failure occurs after commit
            getLogger().warn('Payroll record already paid with transaction - not marking as failed', {
              payrollRecordId: createdPayrollRecordId.toString(),
              transactionId: existingRecord.transactionId.toString(),
              status: existingRecord.status,
              error: (error as Error).message,
            });
          } else {
            // Safe to mark as failed - record wasn't successfully paid
            const updateFields: Record<string, unknown> = { status: 'failed' };
            if (createdTransactionId) {
              updateFields.transactionId = createdTransactionId;
            }
            await repos.payrollRecord.update(
              createdPayrollRecordId,
              updateFields,
              { throwOnNotFound: false }
            );
            getLogger().warn('Marked payroll record as failed after non-transactional error', {
              payrollRecordId: createdPayrollRecordId.toString(),
              transactionId: createdTransactionId?.toString(),
              error: (error as Error).message,
            });
          }
        } catch (cleanupError) {
          // Log but don't mask the original error
          getLogger().error('Failed to mark payroll record as failed during cleanup', {
            payrollRecordId: createdPayrollRecordId.toString(),
            transactionId: createdTransactionId?.toString(),
            cleanupError: (cleanupError as Error).message,
            originalError: (error as Error).message,
          });
        }
      }

      // Let all errors propagate - transaction abort handled by withTransaction()
      // Duplicate key errors are handled OUTSIDE the transaction in processSalary()
      throw error;
    }
  }
}

/**
 * Factory function for creating SalaryProcessingManager
 *
 * Creates a salary processing manager with injected dependencies using
 * the dependency injection pattern to avoid tight coupling.
 *
 * @template TEmployee - Employee document type
 * @template TPayrollRecord - Payroll record document type
 * @template TTransaction - Transaction document type
 * @template TAttendance - Attendance document type
 *
 * @param models - Model instances for database access
 * @param container - Dependency container instance
 * @param events - Event bus for emitting payroll events
 * @param idempotency - Idempotency manager for duplicate prevention
 * @param repositoryManager - Repository manager for data access
 * @param calculateSalaryBreakdownFn - Function to calculate salary breakdown
 * @param resolveOrganizationIdFn - Function to resolve organization ID
 * @param resolveEmployeeIdFn - Function to resolve employee ID
 * @param findEmployeeFn - Function to find employee with security
 * @param updatePayrollStatsFn - Function to update employee payroll stats
 * @param config - HRM configuration
 *
 * @returns Configured salary processing manager instance
 *
 * @example
 * ```typescript
 * const manager = createSalaryProcessingManager(
 *   { EmployeeModel, PayrollRecordModel, TransactionModel },
 *   container,
 *   eventBus,
 *   idempotencyManager,
 *   repositoryManager,
 *   payroll.calculateSalaryBreakdown.bind(payroll),
 *   payroll.resolveOrganizationId.bind(payroll),
 *   payroll.resolveEmployeeId.bind(payroll),
 *   payroll.findEmployee.bind(payroll),
 *   payroll.updatePayrollStats.bind(payroll),
 *   config
 * );
 * ```
 *
 * @see SalaryProcessingContext in managers/context.ts for context-based alternative
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
    LeaveRequestModel?: Model<LeaveRequestDocument> | null;
    TaxWithholdingModel?: TaxWithholdingModel | null;
  },
  container: Container<TEmployee, TPayrollRecord, TTransaction, TAttendance>,
  events: EventBus,
  idempotency: IdempotencyManager,
  repositoryManager: RepositoryManager<TEmployee, TPayrollRecord, TTransaction>,
  calculateSalaryBreakdownFn: (
    employee: EmployeeDocument,
    period: { month: number; year: number; startDate: Date; endDate: Date; payDate: Date },
    input?: { attendance?: import('../core/config.js').AttendanceInput | null; options?: import('../core/config.js').PayrollProcessingOptions },
    session?: ClientSession
  ) => Promise<import('../types.js').PayrollBreakdown>,
  resolveOrganizationIdFn: import('./context.js').ResolveOrganizationIdFn,
  resolveEmployeeIdFn: import('./context.js').ResolveEmployeeIdFn,
  findEmployeeFn: import('./context.js').FindEmployeeFn<TEmployee>,
  updatePayrollStatsFn: import('./context.js').UpdatePayrollStatsFn<TEmployee, TPayrollRecord, TTransaction>,
  config: import('../types.js').HRMConfig
): SalaryProcessingManager<TEmployee, TPayrollRecord, TTransaction, TAttendance> {
  return new SalaryProcessingManager<TEmployee, TPayrollRecord, TTransaction, TAttendance>(
    models,
    container,
    events,
    idempotency,
    repositoryManager,
    calculateSalaryBreakdownFn,
    resolveOrganizationIdFn,
    resolveEmployeeIdFn,
    findEmployeeFn,
    updatePayrollStatsFn,
    config
  );
}

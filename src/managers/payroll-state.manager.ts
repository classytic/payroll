/**
 * @classytic/payroll - Payroll State Manager
 *
 * Handles all payroll state transitions and corrections:
 * - Void operations (for unpaid payrolls)
 * - Reverse operations (for paid payrolls with reversal transactions)
 * - Restore operations (undo void)
 */

import { Model } from 'mongoose';
import type {
  PayrollRecordDocument,
  AnyDocument,
  AnyModel,
  ObjectIdLike,
  VoidPayrollParams,
  VoidPayrollResult,
  ReversePayrollParams,
  ReversePayrollResult,
  RestorePayrollParams,
  RestorePayrollResult,
  TaxWithholdingDocument,
  TaxWithholdingModel,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { toObjectId } from '../utils/query-builders.js';
import { ValidationError, EmployeeNotFoundError } from '../errors/index.js';
import { PayrollStatusMachine } from '../core/payroll-states.js';
import { PAYROLL_STATUS, isVoidablePayrollStatus } from '../enums.js';
import type { EventBus } from '../core/events.js';

/**
 * PayrollStateManager
 *
 * Master of payroll state transitions, corrections, and reversal operations.
 * Handles complex audit trail and compliance requirements for payroll modifications.
 *
 * Key responsibilities:
 * - Void unpaid payrolls (pending, processing, failed)
 * - Reverse paid payrolls (with offsetting transactions)
 * - Restore voided payrolls (undo void)
 * - State machine validation
 * - Audit trail maintenance
 * - Tax withholding coordination
 *
 * SECURITY: All operations enforce multi-tenant isolation via organizationId
 *
 * @example Void unpaid payroll
 * ```typescript
 * await manager.voidPayroll({
 *   organizationId,
 *   payrollRecordId,
 *   reason: 'Test payroll - not intended for production',
 *   voidTransaction: true
 * });
 * ```
 *
 * @example Reverse paid payroll
 * ```typescript
 * const result = await manager.reversePayroll({
 *   organizationId,
 *   payrollRecordId,
 *   reason: 'Duplicate payment detected',
 *   createReversalTransaction: true
 * });
 * console.log(`Created reversal: ${result.reversalTransaction._id}`);
 * ```
 *
 * @example Restore voided payroll
 * ```typescript
 * await manager.restorePayroll({
 *   organizationId,
 *   payrollRecordId,
 *   reason: 'Voided in error, restoring'
 * });
 * ```
 */
export class PayrollStateManager<
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument
> {
  constructor(
    private readonly models: {
      PayrollRecordModel: Model<TPayrollRecord>;
      TransactionModel: Model<TTransaction> | null;
      TaxWithholdingModel?: Model<TTaxWithholding> | null;
    },
    private readonly events: EventBus
  ) {}

  /**
   * Void a payroll record (before payment)
   *
   * Use for payrolls that haven't been paid yet (pending, processing, failed).
   * Creates audit trail but doesn't create a reversal transaction.
   *
   * Features:
   * - State machine validation (only voidable statuses)
   * - Transaction cancellation (optional)
   * - Tax withholding cancellation
   * - Full audit trail
   *
   * @param params - Void parameters
   * @returns Void result with status flags
   * @throws ValidationError if payroll is already paid (use reversePayroll instead)
   */
  async voidPayroll(params: VoidPayrollParams): Promise<VoidPayrollResult> {
    const { organizationId, payrollRecordId, reason, context, voidTransaction = true } = params;
    const session = context?.session;

    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('Void reason must be at least 5 characters');
    }

    // Find the payroll record with org isolation
    const payrollRecord = await this.models.PayrollRecordModel.findOne({
      _id: toObjectId(payrollRecordId),
      organizationId: toObjectId(organizationId),
    }).session(session || null);

    if (!payrollRecord) {
      throw new EmployeeNotFoundError(`Payroll record not found: ${payrollRecordId}`);
    }

    // Validate state transition using state machine
    const transition = PayrollStatusMachine.validateTransition(
      payrollRecord.status,
      PAYROLL_STATUS.VOIDED
    );
    if (!transition.success) {
      if (payrollRecord.status === PAYROLL_STATUS.PAID) {
        throw new ValidationError(
          `Cannot void a paid payroll. Use reversePayroll() instead.`
        );
      }
      throw new ValidationError(transition.error);
    }

    // Update payroll record
    payrollRecord.status = PAYROLL_STATUS.VOIDED;
    payrollRecord.isVoided = true;
    payrollRecord.voidedAt = new Date();
    payrollRecord.voidedBy = context?.userId ? toObjectId(context.userId) : undefined;
    payrollRecord.voidReason = reason;
    payrollRecord.notes = `${payrollRecord.notes || ''}\n[VOIDED] ${reason}`.trim();

    await payrollRecord.save({ session });

    // Void associated transaction if requested
    let transactionVoided = false;
    if (voidTransaction && payrollRecord.transactionId && this.models.TransactionModel) {
      await this.models.TransactionModel.updateOne(
        { _id: payrollRecord.transactionId },
        {
          $set: {
            status: 'cancelled',
            notes: `Voided: ${reason}`,
            'metadata.voidedAt': new Date(),
            'metadata.voidedBy': context?.userId,
          },
        },
        { session }
      );
      transactionVoided = true;
    }

    // Void associated tax withholdings if TaxWithholdingModel is provided
    let taxWithholdingsVoided = 0;
    if (this.models.TaxWithholdingModel) {
      const { TaxWithholdingService } = await import('../services/tax-withholding.service.js');
      const taxService = new TaxWithholdingService(
        this.models.TaxWithholdingModel as unknown as TaxWithholdingModel,
        this.models.TransactionModel as AnyModel | undefined,
        this.events
      );

      const taxResult = await taxService.voidByPayrollRecord({
        payrollRecordId,
        organizationId,
        reason,
        voidedBy: context?.userId,
        session,
      });
      taxWithholdingsVoided = taxResult.voidedCount;
    }

    getLogger().info('Payroll voided', {
      payrollRecordId: payrollRecordId.toString(),
      organizationId: organizationId.toString(),
      reason,
      transactionVoided,
      taxWithholdingsVoided,
    });

    return {
      payrollRecord: payrollRecord as unknown as PayrollRecordDocument,
      transactionVoided,
      taxWithholdingsVoided,
    };
  }

  /**
   * Reverse a paid payroll
   *
   * Creates a reversal (negative) transaction to offset the original payment.
   * Required for compliance as it maintains a full audit trail.
   *
   * Features:
   * - State machine validation (only paid payrolls)
   * - Reversal transaction creation (negative amount)
   * - Original transaction metadata update
   * - Tax withholding cancellation
   * - Full audit trail
   *
   * @param params - Reversal parameters
   * @returns Reversal result with transaction details
   * @throws ValidationError if payroll is not paid (use voidPayroll instead)
   */
  async reversePayroll(params: ReversePayrollParams): Promise<ReversePayrollResult> {
    const { organizationId, payrollRecordId, reason, createReversalTransaction = true, paymentMethod = 'manual', context } = params;
    const session = context?.session;

    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('Reversal reason must be at least 5 characters');
    }

    // Find the payroll record with org isolation
    const payrollRecord = await this.models.PayrollRecordModel.findOne({
      _id: toObjectId(payrollRecordId),
      organizationId: toObjectId(organizationId),
    }).session(session || null);

    if (!payrollRecord) {
      throw new EmployeeNotFoundError(`Payroll record not found: ${payrollRecordId}`);
    }

    // Validate state transition using state machine
    const transition = PayrollStatusMachine.validateTransition(
      payrollRecord.status,
      PAYROLL_STATUS.REVERSED
    );
    if (!transition.success) {
      if (isVoidablePayrollStatus(payrollRecord.status)) {
        throw new ValidationError(
          `Cannot reverse an unpaid payroll. Use voidPayroll() instead.`
        );
      }
      throw new ValidationError(transition.error);
    }

    // Validate breakdown exists before reversal (HRM compliance: must know exact amounts)
    if (!payrollRecord.breakdown) {
      throw new ValidationError(
        'Cannot reverse payroll without breakdown data. Breakdown is required for audit trail.'
      );
    }

    const originalAmount = payrollRecord.breakdown.netSalary;
    const grossAmount = payrollRecord.breakdown.grossSalary;
    const taxAmount = payrollRecord.breakdown.taxAmount || 0;

    // Validate amounts are valid (prevent reversing $0 or negative amounts)
    if (grossAmount <= 0 || originalAmount <= 0) {
      throw new ValidationError(
        `Cannot reverse payroll with invalid amounts. Gross: ${grossAmount}, Net: ${originalAmount}`
      );
    }

    // Create reversal transaction (positive amount with inflow)
    let reversalTransaction: AnyDocument | undefined;
    let originalTx: AnyDocument | null = null;

    if (createReversalTransaction && this.models.TransactionModel) {
      // Get original transaction for reconciliation
      let currency = 'USD'; // Default fallback
      if (payrollRecord.transactionId) {
        originalTx = await this.models.TransactionModel.findById(payrollRecord.transactionId).session(session || null);
        if (originalTx) {
          if (originalTx.currency) {
            currency = originalTx.currency as string;
          }

          // Reconciliation check: warn if amounts don't match (allows 1 cent rounding difference)
          const amountDiff = Math.abs((originalTx.amount as number) - grossAmount);
          if (amountDiff > 0.01) {
            getLogger().warn('Reversal amount mismatch with original transaction', {
              payrollRecordId: payrollRecordId.toString(),
              originalTransactionAmount: originalTx.amount,
              breakdownGrossAmount: grossAmount,
              difference: amountDiff,
            });
          }
        }
      }

      const [created] = await (this.models.TransactionModel as Model<AnyDocument>).create([{
        organizationId: toObjectId(organizationId),

        // Classification (aligned with @classytic/shared-types)
        type: 'salary_reversal',
        flow: 'inflow', // Reversal is an inflow (money back)
        tags: ['reversal', 'payroll', 'correction'],
        status: 'completed',

        // Amounts (positive values - ITransaction requires amount >= 0)
        amount: Math.abs(grossAmount), // ✅ Ensure positive
        net: Math.abs(originalAmount), // ✅ Ensure positive
        currency,
        fee: 0,
        tax: Math.abs(payrollRecord.breakdown?.taxAmount || 0),

        // Payment (default: manual for reversals, configurable for different scenarios)
        method: paymentMethod,
        date: new Date(),

        // Parties
        employeeId: payrollRecord.employeeId,
        customerId: payrollRecord.userId,

        // References (correct field names per ITransaction)
        sourceId: payrollRecord._id,
        sourceModel: 'PayrollRecord',
        relatedTransactionId: payrollRecord.transactionId,

        // Metadata
        description: `Payroll Reversal: ${reason}`,
        metadata: {
          originalPayrollId: payrollRecord._id,
          originalTransactionId: payrollRecord.transactionId,
          reversalReason: reason,
          reversedBy: context?.userId,
          reversedAt: new Date(),
          employeeId: payrollRecord.employeeId,
          period: payrollRecord.period,
        },
      }], session ? { session } : {});

      reversalTransaction = created;

      // Link reversal transaction to original payroll
      payrollRecord.reversalTransactionId = reversalTransaction._id;
    }

    // Update payroll record
    payrollRecord.status = PAYROLL_STATUS.REVERSED;
    payrollRecord.isVoided = true;
    payrollRecord.voidedAt = new Date();
    payrollRecord.voidedBy = context?.userId ? toObjectId(context.userId) : undefined;
    payrollRecord.voidReason = reason;
    payrollRecord.reversedAt = new Date();
    payrollRecord.reversedBy = context?.userId ? toObjectId(context.userId) : undefined;
    payrollRecord.reversalReason = reason;
    payrollRecord.notes = `${payrollRecord.notes || ''}\n[REVERSED] ${reason}`.trim();

    await payrollRecord.save({ session });

    // Update original transaction if it exists
    if (payrollRecord.transactionId && this.models.TransactionModel) {
      await this.models.TransactionModel.updateOne(
        { _id: payrollRecord.transactionId },
        {
          $set: {
            'metadata.reversed': true,
            'metadata.reversedAt': new Date(),
            'metadata.reversedBy': context?.userId,
            'metadata.reversalTransactionId': reversalTransaction?._id,
            'metadata.reversalReason': reason,
          },
        },
        { session }
      );
    }

    // Cancel associated tax withholdings if TaxWithholdingModel is provided
    let taxWithholdingsCancelled = 0;
    if (this.models.TaxWithholdingModel) {
      const { TaxWithholdingService } = await import('../services/tax-withholding.service.js');
      const taxService = new TaxWithholdingService(
        this.models.TaxWithholdingModel as unknown as TaxWithholdingModel,
        this.models.TransactionModel as AnyModel | undefined,
        this.events
      );

      const taxResult = await taxService.voidByPayrollRecord({
        payrollRecordId,
        organizationId,
        reason: `Payroll reversed: ${reason}`,
        voidedBy: context?.userId,
        session,
      });
      taxWithholdingsCancelled = taxResult.voidedCount;
    }

    getLogger().info('Payroll reversed', {
      payrollRecordId: payrollRecordId.toString(),
      organizationId: organizationId.toString(),
      reason,
      reversalTransactionId: reversalTransaction?._id?.toString(),
      taxWithholdingsCancelled,
    });

    return {
      payrollRecord: payrollRecord as unknown as PayrollRecordDocument,
      reversalTransaction,
      taxWithholdingsCancelled,
    };
  }

  /**
   * Restore a voided payroll
   *
   * Only works for voided payrolls (not reversed ones, as they have financial transactions).
   *
   * Features:
   * - State machine validation (only voided payrolls)
   * - Prevents restoring reversed payrolls (would orphan reversal transaction)
   * - Transaction restoration
   * - Audit trail preservation (keeps void metadata)
   *
   * @param params - Restore parameters
   * @returns Restored payroll record
   * @throws ValidationError if payroll is reversed or has reversal transaction
   */
  async restorePayroll(params: RestorePayrollParams): Promise<RestorePayrollResult> {
    const { organizationId, payrollRecordId, reason, context } = params;
    const session = context?.session;

    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('Restore reason must be at least 5 characters');
    }

    // Find the payroll record with org isolation
    const payrollRecord = await this.models.PayrollRecordModel.findOne({
      _id: toObjectId(payrollRecordId),
      organizationId: toObjectId(organizationId),
    }).session(session || null);

    if (!payrollRecord) {
      throw new EmployeeNotFoundError(`Payroll record not found: ${payrollRecordId}`);
    }

    // Validate state transition using state machine
    const transition = PayrollStatusMachine.validateTransition(
      payrollRecord.status,
      PAYROLL_STATUS.PENDING
    );
    if (!transition.success) {
      if (payrollRecord.status === PAYROLL_STATUS.REVERSED) {
        throw new ValidationError(
          'Cannot restore a reversed payroll. The reversal transaction would become orphaned.'
        );
      }
      throw new ValidationError(transition.error);
    }

    // Cannot restore if there's a reversal transaction
    if (payrollRecord.reversalTransactionId) {
      throw new ValidationError(
        'Cannot restore a payroll with reversal transaction. The transaction would become orphaned.'
      );
    }

    // Check if an active (non-voided) record already exists for this period
    // This can happen if a replacement payroll was created after voiding the original
    const existingActive = await this.models.PayrollRecordModel.findOne({
      organizationId: toObjectId(organizationId),
      employeeId: payrollRecord.employeeId,
      'period.month': payrollRecord.period.month,
      'period.year': payrollRecord.period.year,
      payrollRunType: payrollRecord.payrollRunType,
      isVoided: { $ne: true },
      _id: { $ne: payrollRecord._id },
    }).session(session || null);

    if (existingActive) {
      throw new ValidationError(
        `Cannot restore: An active payroll record already exists for employee ${payrollRecord.employeeId} ` +
        `in ${payrollRecord.period.month}/${payrollRecord.period.year} with run type '${payrollRecord.payrollRunType}'. ` +
        `Void or reverse the existing record first.`
      );
    }

    // Restore to pending status
    payrollRecord.status = PAYROLL_STATUS.PENDING;
    payrollRecord.isVoided = false;
    payrollRecord.notes = `${payrollRecord.notes || ''}\n[RESTORED] ${reason || 'Restored by user'}`.trim();

    // Keep voidedAt/voidedBy/voidReason for audit trail

    await payrollRecord.save({ session });

    // Restore associated transaction if exists
    if (payrollRecord.transactionId && this.models.TransactionModel) {
      await this.models.TransactionModel.updateOne(
        { _id: payrollRecord.transactionId },
        {
          $set: {
            status: 'pending',
            'metadata.restoredAt': new Date(),
            'metadata.restoredBy': context?.userId,
          },
          $unset: {
            'metadata.voidedAt': '',
            'metadata.voidedBy': '',
          },
        },
        { session }
      );
    }

    getLogger().info('Payroll restored', {
      payrollRecordId: payrollRecordId.toString(),
      organizationId: organizationId.toString(),
      reason,
    });

    return {
      payrollRecord: payrollRecord as unknown as PayrollRecordDocument,
    };
  }
}

/**
 * Factory function for creating PayrollStateManager
 */
export function createPayrollStateManager<
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument,
  TTaxWithholding extends TaxWithholdingDocument = TaxWithholdingDocument
>(
  models: {
    PayrollRecordModel: Model<TPayrollRecord>;
    TransactionModel: Model<TTransaction> | null;
    TaxWithholdingModel?: Model<TTaxWithholding> | null;
  },
  events: EventBus
): PayrollStateManager<TPayrollRecord, TTransaction, TTaxWithholding> {
  return new PayrollStateManager<TPayrollRecord, TTransaction, TTaxWithholding>(models, events);
}

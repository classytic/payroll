/**
 * @classytic/payroll - Tax Withholding Service
 *
 * Business logic for tax withholding tracking and management
 */

import type { Model, ClientSession } from 'mongoose';
import type {
  TaxWithholdingDocument,
  TaxType,
  TaxStatus,
  ObjectIdLike,
  ObjectId,
  PayrollBreakdown,
  PayrollPeriod,
  AnyModel,
  AnyDocument,
  OperationContext,
  GetPendingTaxParams,
  TaxSummaryParams,
  TaxSummaryResult,
  MarkTaxPaidParams,
} from '../types.js';
import type { EventBus } from '../core/events.js';
import { TaxStatusMachine } from '../core/payroll-states.js';
import { toObjectId } from '../utils/index.js';
import { logger } from '../utils/logger.js';
import { TAX_TYPE, TAX_STATUS } from '../enums.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface TaxWithholdingServiceConfig {
  TaxWithholdingModel: Model<TaxWithholdingDocument>;
  TransactionModel?: AnyModel;
  events?: EventBus;
}

export interface CreateFromBreakdownParams {
  organizationId: ObjectId;
  employeeId: ObjectId;
  userId?: ObjectId;
  payrollRecordId: ObjectId;
  transactionId: ObjectId;
  period: PayrollPeriod;
  breakdown: PayrollBreakdown;
  currency?: string;
  session?: ClientSession;
  context?: OperationContext;
}

// ============================================================================
// Tax Withholding Service
// ============================================================================

/**
 * Service for managing tax withholdings
 *
 * Provides methods for creating, querying, and updating tax withholding records
 */
export class TaxWithholdingService {
  constructor(
    private readonly TaxWithholdingModel: Model<TaxWithholdingDocument>,
    private readonly TransactionModel?: AnyModel,
    private readonly events?: EventBus
  ) {}

  /**
   * Create tax withholding records from payroll breakdown
   *
   * Extracts tax deductions from the breakdown and creates separate
   * TaxWithholding records for each tax type
   */
  async createFromBreakdown(params: CreateFromBreakdownParams): Promise<TaxWithholdingDocument[]> {
    const {
      organizationId,
      employeeId,
      userId,
      payrollRecordId,
      transactionId,
      period,
      breakdown,
      currency = 'USD',
      session,
      context,
    } = params;

    // Extract tax deductions from breakdown
    const taxDeductions = breakdown.deductions?.filter((d) =>
      d.type === 'tax' || this.isTaxDeduction(d.type)
    ) || [];

    if (taxDeductions.length === 0) {
      return [];
    }

    const withholdings: TaxWithholdingDocument[] = [];

    // Create one TaxWithholding record per tax type
    for (const deduction of taxDeductions) {
      const taxType = this.mapDeductionTypeToTaxType(deduction.type);
      const taxRate = breakdown.taxableAmount && breakdown.taxableAmount > 0
        ? deduction.amount / breakdown.taxableAmount
        : 0;

      const withholdingData = {
        organizationId,
        employeeId,
        userId,
        payrollRecordId,
        transactionId,
        period,
        amount: deduction.amount,
        currency,
        taxType,
        taxRate,
        taxableAmount: breakdown.taxableAmount || breakdown.grossSalary,
        status: TAX_STATUS.PENDING as TaxStatus,
      };

      const [withholding] = await this.TaxWithholdingModel.create([withholdingData], {
        session,
      });

      withholdings.push(withholding);

      // Emit tax:withheld event
      if (this.events) {
        this.events.emitSync('tax:withheld', {
          withholding: {
            id: withholding._id,
            taxType: withholding.taxType,
            amount: withholding.amount,
          },
          employee: {
            id: employeeId,
            employeeId: '', // Will be filled by caller if needed
          },
          payrollRecord: {
            id: payrollRecordId,
          },
          period: {
            month: period.month,
            year: period.year,
          },
          organizationId,
          context,
        });
      }

      logger.info('Tax withholding created', {
        withholdingId: withholding._id.toString(),
        employeeId: employeeId.toString(),
        taxType,
        amount: deduction.amount,
        period: `${period.month}/${period.year}`,
      });
    }

    return withholdings;
  }

  /**
   * Get pending tax withholdings with optional filters
   */
  async getPending(params: GetPendingTaxParams): Promise<TaxWithholdingDocument[]> {
    const { organizationId, fromPeriod, toPeriod, taxType, employeeId } = params;

    const options: {
      fromMonth?: number;
      fromYear?: number;
      toMonth?: number;
      toYear?: number;
      taxType?: TaxType;
    } = {};

    if (fromPeriod) {
      options.fromMonth = fromPeriod.month;
      options.fromYear = fromPeriod.year;
    }
    if (toPeriod) {
      options.toMonth = toPeriod.month;
      options.toYear = toPeriod.year;
    }
    if (taxType) {
      options.taxType = taxType;
    }

    let query = (this.TaxWithholdingModel as any).findPending(
      toObjectId(organizationId),
      options
    );

    // Additional filter by employee if provided
    if (employeeId) {
      query = query.where({ employeeId: toObjectId(employeeId) });
    }

    return query.exec();
  }

  /**
   * Get tax summary aggregated by type, period, or employee
   */
  async getSummary(params: TaxSummaryParams): Promise<TaxSummaryResult> {
    const { organizationId, fromPeriod, toPeriod, groupBy = 'type' } = params;

    if (groupBy === 'type') {
      const byType = await (this.TaxWithholdingModel as any).getSummaryByType(
        toObjectId(organizationId),
        fromPeriod,
        toPeriod
      );

      const totalAmount = byType.reduce((sum: number, item: { totalAmount: number }) => sum + item.totalAmount, 0);
      const count = byType.reduce((sum: number, item: { count: number }) => sum + item.count, 0);

      return {
        totalAmount,
        count,
        byType,
        period: {
          fromMonth: fromPeriod.month,
          fromYear: fromPeriod.year,
          toMonth: toPeriod.month,
          toYear: toPeriod.year,
        },
      };
    }

    // For now, only support groupBy: 'type'
    // Can extend for 'period' and 'employee' later
    throw new Error(`groupBy '${groupBy}' not yet implemented`);
  }

  /**
   * Mark tax withholdings as paid
   *
   * Updates status, optionally creates government payment transaction,
   * and emits tax:paid event
   */
  async markPaid(params: MarkTaxPaidParams): Promise<{
    withholdings: TaxWithholdingDocument[];
    transaction?: AnyDocument;
  }> {
    const {
      organizationId,
      withholdingIds,
      createTransaction = false,
      referenceNumber,
      paidAt = new Date(),
      notes,
      context,
    } = params;

    const session = context?.session;

    // Fetch withholdings
    const withholdings = await this.TaxWithholdingModel.find({
      _id: { $in: withholdingIds.map(toObjectId) },
      organizationId: toObjectId(organizationId),
    }).session(session || null);

    if (withholdings.length === 0) {
      throw new Error('No tax withholdings found with provided IDs');
    }

    // Calculate total amount
    const totalAmount = withholdings.reduce((sum, w) => sum + w.amount, 0);

    let governmentTransaction: any = null;

    // Optionally create government payment transaction
    if (createTransaction && this.TransactionModel) {
      const transactionData = {
        organizationId: toObjectId(organizationId),
        type: 'tax_payment',
        flow: 'outflow',
        tags: ['tax', 'government', 'withholding'],
        amount: totalAmount,
        grossAmount: totalAmount,
        currency: withholdings[0].currency || 'USD',
        status: 'completed',
        date: paidAt,
        description: `Tax payment to government - ${referenceNumber || 'Multiple withholdings'}`,
        notes,
        metadata: {
          withholdingIds: withholdingIds.map((id) => id.toString()),
          referenceNumber,
        },
      };

      [governmentTransaction] = await this.TransactionModel.create([transactionData], {
        session,
      });
    }

    // Update all withholdings
    for (const withholding of withholdings) {
      withholding.markAsPaid(
        governmentTransaction?._id,
        referenceNumber,
        paidAt
      );
      await withholding.save({ session });
    }

    // Emit tax:paid event
    if (this.events) {
      this.events.emitSync('tax:paid', {
        withholdings: withholdings.map((w) => ({
          id: w._id,
          taxType: w.taxType,
          amount: w.amount,
        })),
        transaction: governmentTransaction
          ? {
              id: governmentTransaction._id,
              amount: governmentTransaction.amount,
            }
          : undefined,
        totalAmount,
        referenceNumber,
        paidAt,
        organizationId: toObjectId(organizationId),
        context,
      });
    }

    logger.info('Tax withholdings marked as paid', {
      count: withholdings.length,
      totalAmount,
      referenceNumber,
      transactionId: governmentTransaction?._id.toString(),
    });

    return {
      withholdings,
      transaction: governmentTransaction,
    };
  }

  /**
   * Get tax withholdings for a specific payroll record
   *
   * @param organizationId - Required for multi-tenant isolation
   * @param payrollRecordId - The payroll record ID to find withholdings for
   */
  async getByPayrollRecord(
    organizationId: ObjectIdLike,
    payrollRecordId: ObjectIdLike
  ): Promise<TaxWithholdingDocument[]> {
    // Use direct query with organizationId enforcement for security
    return this.TaxWithholdingModel.find({
      organizationId: toObjectId(organizationId),
      payrollRecordId: toObjectId(payrollRecordId),
    }).exec();
  }

  /**
   * Void/cancel tax withholdings for a payroll record
   *
   * Used when voiding or reversing a payroll to invalidate associated tax withholdings.
   * Changes status to 'cancelled' and adds void metadata.
   *
   * @returns Number of withholdings voided
   */
  async voidByPayrollRecord(params: {
    payrollRecordId: ObjectIdLike;
    organizationId: ObjectIdLike;
    reason: string;
    voidedBy?: ObjectIdLike;
    session?: ClientSession;
  }): Promise<{ voidedCount: number; withholdings: TaxWithholdingDocument[] }> {
    const { payrollRecordId, organizationId, reason, voidedBy, session } = params;

    // Find all withholdings for this payroll record
    const withholdings = await this.TaxWithholdingModel.find({
      payrollRecordId: toObjectId(payrollRecordId),
      organizationId: toObjectId(organizationId),
      status: { $in: ['pending', 'submitted'] }, // Only cancel pending/submitted (per TaxStatusMachine)
    }).session(session || null);

    if (withholdings.length === 0) {
      return { voidedCount: 0, withholdings: [] };
    }

    // Update all withholdings to cancelled status (with state machine validation)
    const voidedAt = new Date();
    for (const withholding of withholdings) {
      // Validate state transition
      const transition = TaxStatusMachine.validateTransition(
        withholding.status,
        TAX_STATUS.CANCELLED
      );
      if (!transition.success) {
        logger.warn('Cannot cancel tax withholding', {
          withholdingId: withholding._id.toString(),
          currentStatus: withholding.status,
          error: transition.error,
        });
        continue; // Skip withholdings that cannot be cancelled
      }

      withholding.status = TAX_STATUS.CANCELLED;
      withholding.voidedAt = voidedAt;
      withholding.voidedBy = voidedBy ? toObjectId(voidedBy) : undefined;
      withholding.voidReason = reason;
      withholding.notes = `${withholding.notes || ''}\n[VOIDED] ${reason}`.trim();
      await withholding.save({ session });
    }

    // Emit tax:voided event
    if (this.events) {
      this.events.emitSync('tax:voided', {
        withholdings: withholdings.map((w) => ({
          id: w._id,
          taxType: w.taxType,
          amount: w.amount,
        })),
        payrollRecordId: toObjectId(payrollRecordId),
        organizationId: toObjectId(organizationId),
        reason,
        voidedAt,
        voidedBy,
      });
    }

    logger.info('Tax withholdings voided', {
      count: withholdings.length,
      payrollRecordId: payrollRecordId.toString(),
      reason,
    });

    return {
      voidedCount: withholdings.length,
      withholdings,
    };
  }

  /**
   * Get tax withholdings for a specific employee
   *
   * @param organizationId - Required for multi-tenant isolation
   * @param employeeId - The employee ID to find withholdings for
   * @param options - Optional filters for year, taxType, status
   */
  async getByEmployee(
    organizationId: ObjectIdLike,
    employeeId: ObjectIdLike,
    options?: { year?: number; taxType?: TaxType; status?: TaxStatus }
  ): Promise<TaxWithholdingDocument[]> {
    // Build query with organizationId enforcement for security
    const query: Record<string, unknown> = {
      organizationId: toObjectId(organizationId),
      employeeId: toObjectId(employeeId),
    };

    if (options?.year) {
      query['period.year'] = options.year;
    }
    if (options?.taxType) {
      query.taxType = options.taxType;
    }
    if (options?.status) {
      query.status = options.status;
    }

    return this.TaxWithholdingModel.find(query).exec();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Check if deduction type is a tax deduction
   */
  private isTaxDeduction(deductionType: string): boolean {
    const taxTypes = ['tax', 'income_tax', 'social_security', 'health_insurance', 'pension', 'employment_insurance', 'local_tax'];
    return taxTypes.includes(deductionType.toLowerCase());
  }

  /**
   * Map deduction type to TaxType enum
   */
  private mapDeductionTypeToTaxType(deductionType: string): TaxType {
    const typeMap: Record<string, TaxType> = {
      'tax': TAX_TYPE.INCOME_TAX,
      'income_tax': TAX_TYPE.INCOME_TAX,
      'social_security': TAX_TYPE.SOCIAL_SECURITY,
      'health_insurance': TAX_TYPE.HEALTH_INSURANCE,
      'pension': TAX_TYPE.PENSION,
      'employment_insurance': TAX_TYPE.EMPLOYMENT_INSURANCE,
      'local_tax': TAX_TYPE.LOCAL_TAX,
    };

    return typeMap[deductionType.toLowerCase()] || TAX_TYPE.OTHER;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TaxWithholdingService instance
 *
 * @example
 * const service = createTaxWithholdingService({
 *   TaxWithholdingModel,
 *   TransactionModel,
 *   events: eventBus
 * });
 */
export function createTaxWithholdingService(
  config: TaxWithholdingServiceConfig
): TaxWithholdingService {
  return new TaxWithholdingService(
    config.TaxWithholdingModel,
    config.TransactionModel,
    config.events
  );
}

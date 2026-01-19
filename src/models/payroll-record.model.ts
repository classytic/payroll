/**
 * @classytic/payroll - PayrollRecord Model
 *
 * Mongoose schema for payroll records with TTL and auto-export
 */

import mongoose, { Schema, Model } from 'mongoose';
import type { PayrollRecordDocument, PayrollStatus, PaymentMethod, PayrollBreakdown } from '../types.js';
import { HRM_CONFIG } from '../config.js';
import { PAYROLL_STATUS } from '../enums.js';
import { PayrollStatusMachine } from '../core/payroll-states.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Schema Definition
// ============================================================================

const allowanceBreakdownSchema = new Schema(
  {
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    taxable: { type: Boolean, default: true },
  },
  { _id: false }
);

const deductionBreakdownSchema = new Schema(
  {
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String },
  },
  { _id: false }
);

const breakdownSchema = new Schema(
  {
    baseAmount: { type: Number, required: true },
    allowances: [allowanceBreakdownSchema],
    deductions: [deductionBreakdownSchema],
    grossSalary: { type: Number, required: true },
    netSalary: { type: Number, required: true },
    taxableAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    workingDays: { type: Number },
    actualDays: { type: Number },
    proRatedAmount: { type: Number, default: 0 },
    attendanceDeduction: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    bonusAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const periodSchema = new Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    payDate: { type: Date },
  },
  { _id: false }
);

const payrollRecordSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Organization',
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Employee',
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: false,  // Optional for guest employees
      ref: 'User',
    },
    period: {
      type: periodSchema,
      required: true,
    },
    breakdown: {
      type: breakdownSchema,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PAYROLL_STATUS),
      default: PAYROLL_STATUS.PENDING,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'check', 'mobile', 'bkash', 'nagad', 'rocket'],
      default: 'bank',
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    paidAt: Date,
    processedAt: Date,
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: String,
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    exported: {
      type: Boolean,
      default: false,
    },
    exportedAt: Date,
    corrections: [
      {
        previousAmount: Number,
        newAmount: Number,
        reason: String,
        correctedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        correctedAt: { type: Date, default: Date.now },
      },
    ],

    // Soft delete / void / reversal fields (v2.4.0+)
    /** Whether this record has been voided or reversed */
    isVoided: { type: Boolean, default: false },
    /** When the record was voided/reversed */
    voidedAt: { type: Date },
    /** User who voided/reversed the record */
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Reason for voiding/reversing */
    voidReason: { type: String },
    /** When the record was reversed (for REVERSED status) */
    reversedAt: { type: Date },
    /** User who reversed the record */
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Reason for reversing the record */
    reversalReason: { type: String },
    /** For reversed payrolls: ID of the reversal transaction */
    reversalTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    /** For reversal records: ID of the original payroll record being reversed */
    originalPayrollId: { type: Schema.Types.ObjectId, ref: 'PayrollRecord' },

    /**
     * Payroll run type: regular, off-cycle, supplemental, or retroactive
     * Default: 'regular'
     */
    payrollRunType: {
      type: String,
      enum: ['regular', 'off-cycle', 'supplemental', 'retroactive'],
      default: 'regular',
    },
    /**
     * Retroactive adjustment details (for back-pay or corrections)
     */
    retroactiveAdjustment: {
      type: {
        originalPeriod: {
          month: { type: Number, required: true, min: 1, max: 12 },
          year: { type: Number, required: true },
        },
        originalPayrollId: Schema.Types.ObjectId,
        reason: { type: String, required: true },
        adjustmentAmount: { type: Number, required: true },
        approved: Boolean,
        approvedBy: Schema.Types.ObjectId,
        approvedAt: Date,
      },
      required: false,
      _id: false,
    },
    /**
     * Employer contributions (costs borne by employer, not deducted from employee)
     */
    employerContributions: [
      {
        type: {
          type: String,
          enum: ['social_security', 'pension', 'unemployment', 'health_insurance', 'other'],
          required: true,
        },
        amount: { type: Number, required: true },
        description: String,
        mandatory: Boolean,
        referenceNumber: String,
      },
    ],
    /**
     * Optional per-document expiration date for custom TTL.
     *
     * If set, this document will be automatically deleted by MongoDB at this date.
     * Use this for jurisdiction-specific retention requirements.
     *
     * @example
     * // 7-year retention for USA (IRS requirement)
     * const expireAt = new Date();
     * expireAt.setFullYear(expireAt.getFullYear() + 7);
     *
     * @example
     * // 10-year retention for Germany
     * const expireAt = new Date();
     * expireAt.setFullYear(expireAt.getFullYear() + 10);
     *
     * @example
     * // Never expire (compliance record)
     * expireAt: undefined // or don't set this field
     */
    expireAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================================
// Indexes
// ============================================================================

payrollRecordSchema.index({ organizationId: 1, 'period.month': 1, 'period.year': 1 });
payrollRecordSchema.index({ employeeId: 1, 'period.month': 1, 'period.year': 1 }, { unique: true });
payrollRecordSchema.index({ organizationId: 1, status: 1 });

/**
 * TTL Index Configuration
 *
 * Standard approach: Use expireAt field with MongoDB TTL index.
 * The index is configured dynamically via configureRetention() method.
 *
 * Documents expire when expireAt date is reached. If expireAt is not set,
 * it can be auto-calculated based on createdAt + retention period.
 *
 * MongoDB deletes expired documents approximately 60 seconds after expiration.
 *
 * @see configureRetention() method to set up TTL index
 */
payrollRecordSchema.index({ expireAt: 1 });

// ============================================================================
// Virtuals
// ============================================================================

payrollRecordSchema.virtual('isPaid').get(function () {
  return this.status === PAYROLL_STATUS.PAID;
});

payrollRecordSchema.virtual('totalDeductions').get(function () {
  return (this.breakdown?.deductions || []).reduce(
    (sum: number, d: { amount: number }) => sum + d.amount,
    0
  );
});

payrollRecordSchema.virtual('totalAllowances').get(function () {
  return (this.breakdown?.allowances || []).reduce(
    (sum: number, a: { amount: number }) => sum + a.amount,
    0
  );
});

// ============================================================================
// Methods
// ============================================================================

payrollRecordSchema.methods.markAsPaid = function (
  transactionId: mongoose.Types.ObjectId,
  paidAt = new Date()
) {
  // Validate state transition
  const transition = PayrollStatusMachine.validateTransition(this.status, PAYROLL_STATUS.PAID);
  if (!transition.success) {
    throw new Error(transition.error);
  }

  this.status = PAYROLL_STATUS.PAID;
  this.transactionId = transactionId;
  this.paidAt = paidAt;
};

payrollRecordSchema.methods.addCorrection = function (
  previousAmount: number,
  newAmount: number,
  reason: string,
  correctedBy: mongoose.Types.ObjectId
) {
  if (!this.corrections) {
    this.corrections = [];
  }
  this.corrections.push({
    previousAmount,
    newAmount,
    reason,
    correctedBy,
    correctedAt: new Date(),
  });

  this.breakdown.netSalary = newAmount;
  logger.info('Payroll correction added', {
    recordId: this._id.toString(),
    previousAmount,
    newAmount,
    reason,
  });
};

payrollRecordSchema.methods.getBreakdownSummary = function () {
  const { baseAmount, allowances, deductions, grossSalary, netSalary } = this.breakdown;
  return {
    base: baseAmount,
    totalAllowances: (allowances || []).reduce(
      (sum: number, a: { amount: number }) => sum + a.amount,
      0
    ),
    totalDeductions: (deductions || []).reduce(
      (sum: number, d: { amount: number }) => sum + d.amount,
      0
    ),
    gross: grossSalary,
    net: netSalary,
  };
};

// ============================================================================
// Statics
// ============================================================================

payrollRecordSchema.statics.findByPeriod = function (
  organizationId: mongoose.Types.ObjectId,
  month: number,
  year: number
) {
  return this.find({
    organizationId,
    'period.month': month,
    'period.year': year,
  });
};

payrollRecordSchema.statics.findByEmployee = function (
  employeeId: mongoose.Types.ObjectId,
  limit = 12
) {
  return this.find({ employeeId })
    .sort({ 'period.year': -1, 'period.month': -1 })
    .limit(limit);
};

payrollRecordSchema.statics.getSummary = function (
  organizationId: mongoose.Types.ObjectId,
  month?: number,
  year?: number
) {
  const match: Record<string, unknown> = { organizationId };
  if (month) match['period.month'] = month;
  if (year) match['period.year'] = year;

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalGross: { $sum: '$breakdown.grossSalary' },
        totalNet: { $sum: '$breakdown.netSalary' },
        count: { $sum: 1 },
        paidCount: {
          $sum: { $cond: [{ $eq: ['$status', PAYROLL_STATUS.PAID] }, 1, 0] },
        },
      },
    },
  ]).then((results: unknown[]) => results[0] || { totalGross: 0, totalNet: 0, count: 0, paidCount: 0 });
};

payrollRecordSchema.statics.getExpiringSoon = function (
  organizationId: mongoose.Types.ObjectId,
  daysBeforeExpiry = 30
) {
  const expiryThreshold = new Date();
  expiryThreshold.setSeconds(
    expiryThreshold.getSeconds() + HRM_CONFIG.dataRetention.payrollRecordsTTL - daysBeforeExpiry * 24 * 60 * 60
  );

  return this.find({
    organizationId,
    exported: false,
    createdAt: { $lte: expiryThreshold },
  });
};

/**
 * Calculate expireAt date based on retention period in years
 *
 * Use this to set jurisdiction-specific retention periods on payroll records.
 *
 * @param retentionYears - Number of years to retain (e.g., 7 for USA, 10 for Germany)
 * @param fromDate - Base date to calculate from (defaults to now)
 * @returns Date when the document should expire
 *
 * @example USA - 7 year retention
 * const expireAt = PayrollRecord.calculateExpireAt(7);
 * await PayrollRecord.create({ ...data, expireAt });
 *
 * @example Germany - 10 year retention
 * const expireAt = PayrollRecord.calculateExpireAt(10);
 *
 * @example Never expire (compliance record)
 * await PayrollRecord.create({ ...data }); // Don't set expireAt
 */
payrollRecordSchema.statics.calculateExpireAt = function (
  retentionYears: number,
  fromDate: Date = new Date()
): Date {
  const expireAt = new Date(fromDate);
  expireAt.setFullYear(expireAt.getFullYear() + retentionYears);
  return expireAt;
};

/**
 * Configure TTL index for automatic document expiration
 *
 * This method sets up MongoDB's TTL (Time To Live) index on the expireAt field.
 * Call this during application initialization to configure retention policy.
 *
 * @param ttlSeconds - Time in seconds after expireAt when document should be deleted.
 *                     Set to 0 to delete immediately when expireAt is reached.
 *                     Leave undefined to use default from config.
 *
 * @example Configure 7-year retention for USA
 * ```typescript
 * await PayrollRecord.configureRetention(0); // Delete when expireAt reached
 *
 * // Then set expireAt on records
 * const record = await PayrollRecord.create({
 *   ...data,
 *   expireAt: PayrollRecord.calculateExpireAt(7) // 7 years from now
 * });
 * ```
 *
 * @example Disable TTL (never auto-delete)
 * ```typescript
 * await PayrollRecord.collection.dropIndex('expireAt_1');
 * // Now documents never expire automatically
 * ```
 *
 * Note: MongoDB's TTL thread runs every 60 seconds, so deletion is approximate.
 */
payrollRecordSchema.statics.configureRetention = async function (
  ttlSeconds?: number
): Promise<void> {
  const collection = this.collection;
  const indexName = 'expireAt_1';

  try {
    // Drop existing TTL index if it exists
    const indexes = await collection.indexes();
    const hasTTLIndex = indexes.some((idx) => idx.name === indexName);

    if (hasTTLIndex) {
      await collection.dropIndex(indexName);
      logger.info('Dropped existing TTL index', { indexName });
    }

    // Create new TTL index with configured expireAfterSeconds
    const expireAfterSeconds = ttlSeconds !== undefined
      ? ttlSeconds
      : HRM_CONFIG.dataRetention.payrollRecordsTTL;

    if (expireAfterSeconds > 0 || expireAfterSeconds === 0) {
      await collection.createIndex(
        { expireAt: 1 },
        {
          name: indexName,
          expireAfterSeconds,
        }
      );

      logger.info('Configured TTL index for payroll records', {
        expireAfterSeconds,
        retentionYears: Math.round(expireAfterSeconds / (365.25 * 24 * 60 * 60) * 10) / 10,
      });
    }
  } catch (error) {
    logger.error('Failed to configure TTL index', {
      error: (error as Error).message,
    });
    throw error;
  }
};

/**
 * Add TTL index on any date field for automatic cleanup
 *
 * Creates a TTL index that automatically deletes documents after a specified time
 * from the date stored in the field. Useful for auto-cleanup of voided/reversed records.
 *
 * @param fieldName - Name of the date field (e.g., 'voidedAt', 'reversedAt', 'paidAt')
 * @param ttlSeconds - Time in seconds after field date when document should be deleted
 * @param options - Optional configuration
 *
 * @example Auto-delete voided records after 90 days
 * ```typescript
 * await PayrollRecord.addTTLIndex('voidedAt', 90 * 24 * 60 * 60);
 * // Documents with voidedAt field will be deleted 90 days after voidedAt date
 * ```
 *
 * @example Auto-delete reversed records after 1 year
 * ```typescript
 * await PayrollRecord.addTTLIndex('reversedAt', 365 * 24 * 60 * 60);
 * ```
 *
 * @example Using helper for readability
 * ```typescript
 * const DAYS = 24 * 60 * 60;
 * const YEARS = 365.25 * DAYS;
 *
 * await PayrollRecord.addTTLIndex('voidedAt', 90 * DAYS);
 * await PayrollRecord.addTTLIndex('reversedAt', 1 * YEARS);
 * ```
 *
 * @example Remove TTL index
 * ```typescript
 * await PayrollRecord.removeTTLIndex('voidedAt');
 * ```
 *
 * Important Notes:
 * - Only documents with the specified field set will be affected
 * - MongoDB's TTL thread runs every 60 seconds, so deletion is approximate
 * - You can have multiple TTL indexes on different fields
 * - TTL indexes work with partialFilterExpression to only affect relevant documents
 */
payrollRecordSchema.statics.addTTLIndex = async function (
  fieldName: string,
  ttlSeconds: number,
  options: { partialFilter?: Record<string, unknown> } = {}
): Promise<void> {
  const collection = this.collection;
  const indexName = `${fieldName}_ttl_1`;

  try {
    // Drop existing TTL index if it exists
    const indexes = await collection.indexes();
    const hasTTLIndex = indexes.some((idx) => idx.name === indexName);

    if (hasTTLIndex) {
      await collection.dropIndex(indexName);
      logger.info('Dropped existing TTL index', { indexName, fieldName });
    }

    // Build index options
    const indexOptions: {
      name: string;
      expireAfterSeconds: number;
      partialFilterExpression?: Record<string, unknown>;
    } = {
      name: indexName,
      expireAfterSeconds: ttlSeconds,
    };

    // Add partial filter to only apply TTL to documents with this field set
    indexOptions.partialFilterExpression = {
      [fieldName]: { $exists: true, $ne: null },
      ...options.partialFilter,
    };

    // Create TTL index
    await collection.createIndex(
      { [fieldName]: 1 },
      indexOptions
    );

    logger.info('Added TTL index for auto-cleanup', {
      fieldName,
      indexName,
      expireAfterSeconds: ttlSeconds,
      retentionDays: Math.round(ttlSeconds / (24 * 60 * 60)),
      partialFilter: indexOptions.partialFilterExpression,
    });
  } catch (error) {
    logger.error('Failed to add TTL index', {
      fieldName,
      error: (error as Error).message,
    });
    throw error;
  }
};

/**
 * Remove TTL index from a field
 *
 * @param fieldName - Name of the field to remove TTL index from
 *
 * @example
 * ```typescript
 * await PayrollRecord.removeTTLIndex('voidedAt');
 * ```
 */
payrollRecordSchema.statics.removeTTLIndex = async function (
  fieldName: string
): Promise<void> {
  const collection = this.collection;
  const indexName = `${fieldName}_ttl_1`;

  try {
    const indexes = await collection.indexes();
    const hasTTLIndex = indexes.some((idx) => idx.name === indexName);

    if (hasTTLIndex) {
      await collection.dropIndex(indexName);
      logger.info('Removed TTL index', { fieldName, indexName });
    } else {
      logger.warn('TTL index not found', { fieldName, indexName });
    }
  } catch (error) {
    logger.error('Failed to remove TTL index', {
      fieldName,
      error: (error as Error).message,
    });
    throw error;
  }
};

// ============================================================================
// Model Creation
// ============================================================================

export interface PayrollRecordModel extends Model<PayrollRecordDocument> {
  findByPeriod(
    organizationId: mongoose.Types.ObjectId,
    month: number,
    year: number
  ): ReturnType<Model<PayrollRecordDocument>['find']>;
  findByEmployee(
    employeeId: mongoose.Types.ObjectId,
    limit?: number
  ): ReturnType<Model<PayrollRecordDocument>['find']>;
  getSummary(
    organizationId: mongoose.Types.ObjectId,
    month?: number,
    year?: number
  ): Promise<{
    totalGross: number;
    totalNet: number;
    count: number;
    paidCount: number;
  }>;
  getExpiringSoon(
    organizationId: mongoose.Types.ObjectId,
    daysBeforeExpiry?: number
  ): ReturnType<Model<PayrollRecordDocument>['find']>;
  calculateExpireAt(retentionYears: number, fromDate?: Date): Date;
  configureRetention(ttlSeconds?: number): Promise<void>;
  addTTLIndex(
    fieldName: string,
    ttlSeconds: number,
    options?: { partialFilter?: Record<string, unknown> }
  ): Promise<void>;
  removeTTLIndex(fieldName: string): Promise<void>;
}

/**
 * Get or create PayrollRecord model
 */
export function getPayrollRecordModel(
  connection: mongoose.Connection = mongoose.connection
): PayrollRecordModel {
  const modelName = 'PayrollRecord';
  
  if (connection.models[modelName]) {
    return connection.models[modelName] as PayrollRecordModel;
  }

  return connection.model<PayrollRecordDocument, PayrollRecordModel>(
    modelName,
    payrollRecordSchema
  );
}

export { payrollRecordSchema };
export default payrollRecordSchema;


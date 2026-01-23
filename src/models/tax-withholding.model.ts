/**
 * @classytic/payroll - TaxWithholding Model
 *
 * Mongoose schema for tax withholding tracking with aggregation support
 */

import mongoose, { Schema, Model } from 'mongoose';
import type {
  TaxWithholdingDocument,
  TaxType,
  TaxStatus,
} from '../types.js';
import {
  TAX_STATUS,
  TAX_TYPE_VALUES,
  TAX_STATUS_VALUES,
} from '../enums.js';
import { TaxStatusMachine } from '../core/payroll-states.js';
import { logger } from '../utils/logger.js';
import { periodSchema } from '../schemas/common.js';

// ============================================================================
// Schema Definition
// ============================================================================

const taxWithholdingSchema = new Schema(
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
      required: false,
      ref: 'User',
    },
    payrollRecordId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PayrollRecord',
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Transaction',
    },

    period: {
      type: periodSchema,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },

    taxType: {
      type: String,
      enum: TAX_TYPE_VALUES,
      required: true,
    },
    taxRate: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    taxableAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: TAX_STATUS_VALUES,
      default: 'pending',
    },

    submittedAt: Date,
    paidAt: Date,
    governmentTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    referenceNumber: String,

    // Void metadata (when payroll is voided/reversed)
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String },
    voidMetadata: { type: Schema.Types.Mixed },

    notes: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// ============================================================================
// Indexes
// ============================================================================

taxWithholdingSchema.index({ organizationId: 1, status: 1, 'period.year': 1, 'period.month': 1 });
taxWithholdingSchema.index({ employeeId: 1, 'period.year': -1, 'period.month': -1 });
taxWithholdingSchema.index({ payrollRecordId: 1 });
taxWithholdingSchema.index({ transactionId: 1 });
taxWithholdingSchema.index({ organizationId: 1, taxType: 1, status: 1 });
taxWithholdingSchema.index({ governmentTransactionId: 1 }, { sparse: true });

// ============================================================================
// Virtuals
// ============================================================================

taxWithholdingSchema.virtual('isPending').get(function () {
  return this.status === TAX_STATUS.PENDING;
});

taxWithholdingSchema.virtual('isPaid').get(function () {
  return this.status === TAX_STATUS.PAID;
});

taxWithholdingSchema.virtual('isSubmitted').get(function () {
  return this.status === TAX_STATUS.SUBMITTED;
});

// ============================================================================
// Methods
// ============================================================================

taxWithholdingSchema.methods.markAsSubmitted = function (submittedAt = new Date()) {
  // Validate state transition
  const transition = TaxStatusMachine.validateTransition(this.status, TAX_STATUS.SUBMITTED);
  if (!transition.success) {
    throw new Error(transition.error);
  }

  this.status = TAX_STATUS.SUBMITTED;
  this.submittedAt = submittedAt;

  logger.info('Tax withholding marked as submitted', {
    withholdingId: this._id.toString(),
    employeeId: this.employeeId.toString(),
    taxType: this.taxType,
    amount: this.amount,
  });
};

taxWithholdingSchema.methods.markAsPaid = function (
  transactionId: mongoose.Types.ObjectId,
  referenceNumber?: string,
  paidAt = new Date()
) {
  // Validate state transition
  const transition = TaxStatusMachine.validateTransition(this.status, TAX_STATUS.PAID);
  if (!transition.success) {
    throw new Error(transition.error);
  }

  this.status = TAX_STATUS.PAID;
  this.governmentTransactionId = transactionId;
  this.referenceNumber = referenceNumber;
  this.paidAt = paidAt;

  logger.info('Tax withholding marked as paid', {
    withholdingId: this._id.toString(),
    employeeId: this.employeeId.toString(),
    taxType: this.taxType,
    amount: this.amount,
    referenceNumber,
  });
};

// ============================================================================
// Statics
// ============================================================================

taxWithholdingSchema.statics.findByPeriod = function (
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

taxWithholdingSchema.statics.findByEmployee = function (
  employeeId: mongoose.Types.ObjectId,
  options: { year?: number; taxType?: TaxType; status?: TaxStatus; limit?: number } = {}
) {
  const query: Record<string, unknown> = { employeeId };

  if (options.year) {
    query['period.year'] = options.year;
  }
  if (options.taxType) {
    query.taxType = options.taxType;
  }
  if (options.status) {
    query.status = options.status;
  }

  return this.find(query)
    .sort({ 'period.year': -1, 'period.month': -1 })
    .limit(options.limit || 50);
};

taxWithholdingSchema.statics.findPending = function (
  organizationId: mongoose.Types.ObjectId,
  options: {
    fromMonth?: number;
    fromYear?: number;
    toMonth?: number;
    toYear?: number;
    taxType?: TaxType;
  } = {}
) {
  const query: Record<string, unknown> = {
    organizationId,
    status: TAX_STATUS.PENDING,
  };

  if (options.taxType) {
    query.taxType = options.taxType;
  }

  if (options.fromMonth && options.fromYear) {
    query.$or = query.$or || [];
    (query.$or as Array<Record<string, unknown>>).push({
      $and: [
        { 'period.year': { $gt: options.fromYear } },
      ],
    });
    (query.$or as Array<Record<string, unknown>>).push({
      $and: [
        { 'period.year': options.fromYear },
        { 'period.month': { $gte: options.fromMonth } },
      ],
    });
  }

  if (options.toMonth && options.toYear) {
    const existingOr = query.$or;
    delete query.$or;

    query.$and = query.$and || [];
    if (existingOr) {
      (query.$and as Array<Record<string, unknown>>).push({ $or: existingOr });
    }

    (query.$and as Array<Record<string, unknown>>).push({
      $or: [
        { 'period.year': { $lt: options.toYear } },
        {
          $and: [
            { 'period.year': options.toYear },
            { 'period.month': { $lte: options.toMonth } },
          ],
        },
      ],
    });
  }

  return this.find(query).sort({ 'period.year': 1, 'period.month': 1 });
};

taxWithholdingSchema.statics.getSummaryByType = function (
  organizationId: mongoose.Types.ObjectId,
  fromPeriod: { month: number; year: number },
  toPeriod: { month: number; year: number }
) {
  return this.aggregate([
    {
      $match: {
        organizationId,
        $or: [
          { 'period.year': { $gt: fromPeriod.year } },
          {
            $and: [
              { 'period.year': fromPeriod.year },
              { 'period.month': { $gte: fromPeriod.month } },
            ],
          },
        ],
        $and: [
          {
            $or: [
              { 'period.year': { $lt: toPeriod.year } },
              {
                $and: [
                  { 'period.year': toPeriod.year },
                  { 'period.month': { $lte: toPeriod.month } },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      $group: {
        _id: '$taxType',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        withholdingIds: { $push: '$_id' },
      },
    },
    {
      $project: {
        _id: 0,
        taxType: '$_id',
        totalAmount: 1,
        count: 1,
        withholdingIds: 1,
      },
    },
  ]).then((results) =>
    results.map((r) => ({
      taxType: r.taxType,
      totalAmount: r.totalAmount,
      count: r.count,
      withholdingIds: r.withholdingIds,
    }))
  );
};

taxWithholdingSchema.statics.getByPayrollRecord = function (
  payrollRecordId: mongoose.Types.ObjectId
) {
  return this.find({ payrollRecordId });
};

taxWithholdingSchema.statics.getTotalByOrganization = function (
  organizationId: mongoose.Types.ObjectId,
  options: { status?: TaxStatus; year?: number } = {}
) {
  const match: Record<string, unknown> = { organizationId };

  if (options.status) {
    match.status = options.status;
  }
  if (options.year) {
    match['period.year'] = options.year;
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]).then((results) =>
    results[0] || { totalAmount: 0, count: 0 }
  );
};

// ============================================================================
// TTL Index Management
// ============================================================================

/**
 * Add TTL index on any date field for automatic cleanup
 *
 * Creates a TTL index that automatically deletes documents after a specified time
 * from the date stored in the field. Useful for auto-cleanup of voided tax withholdings.
 *
 * @param fieldName - Name of the date field (e.g., 'voidedAt', 'paidAt')
 * @param ttlSeconds - Time in seconds after field date when document should be deleted
 * @param options - Optional configuration
 *
 * @example Auto-delete voided withholdings after 90 days
 * ```typescript
 * await TaxWithholding.addTTLIndex('voidedAt', 90 * 24 * 60 * 60);
 * ```
 *
 * @example Auto-delete paid withholdings after 7 years
 * ```typescript
 * const YEARS = 365.25 * 24 * 60 * 60;
 * await TaxWithholding.addTTLIndex('paidAt', 7 * YEARS);
 * ```
 */
taxWithholdingSchema.statics.addTTLIndex = async function (
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
    // Note: MongoDB partial filters don't support $ne operator
    indexOptions.partialFilterExpression = {
      [fieldName]: { $exists: true },
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
 * await TaxWithholding.removeTTLIndex('voidedAt');
 * ```
 */
taxWithholdingSchema.statics.removeTTLIndex = async function (
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
// Model Interface
// ============================================================================

export interface TaxWithholdingModel extends Model<TaxWithholdingDocument> {
  findByPeriod(
    organizationId: mongoose.Types.ObjectId,
    month: number,
    year: number
  ): ReturnType<Model<TaxWithholdingDocument>['find']>;

  findByEmployee(
    employeeId: mongoose.Types.ObjectId,
    options?: { year?: number; taxType?: TaxType; status?: TaxStatus; limit?: number }
  ): ReturnType<Model<TaxWithholdingDocument>['find']>;

  findPending(
    organizationId: mongoose.Types.ObjectId,
    options?: {
      fromMonth?: number;
      fromYear?: number;
      toMonth?: number;
      toYear?: number;
      taxType?: TaxType;
    }
  ): ReturnType<Model<TaxWithholdingDocument>['find']>;

  getSummaryByType(
    organizationId: mongoose.Types.ObjectId,
    fromPeriod: { month: number; year: number },
    toPeriod: { month: number; year: number }
  ): Promise<
    Array<{
      taxType: TaxType;
      totalAmount: number;
      count: number;
      withholdingIds: mongoose.Types.ObjectId[];
    }>
  >;

  getByPayrollRecord(
    payrollRecordId: mongoose.Types.ObjectId
  ): ReturnType<Model<TaxWithholdingDocument>['find']>;

  getTotalByOrganization(
    organizationId: mongoose.Types.ObjectId,
    options?: { status?: TaxStatus; year?: number }
  ): Promise<{ totalAmount: number; count: number }>;

  addTTLIndex(
    fieldName: string,
    ttlSeconds: number,
    options?: { partialFilter?: Record<string, unknown> }
  ): Promise<void>;
  removeTTLIndex(fieldName: string): Promise<void>;
}

// ============================================================================
// Model Factory
// ============================================================================

/**
 * Get or create TaxWithholding model
 *
 * @example
 * const TaxWithholding = getTaxWithholdingModel();
 *
 * // With custom connection
 * const TaxWithholding = getTaxWithholdingModel(customConnection);
 */
export function getTaxWithholdingModel(
  connection: mongoose.Connection = mongoose.connection
): TaxWithholdingModel {
  const modelName = 'TaxWithholding';

  if (connection.models[modelName]) {
    return connection.models[modelName] as TaxWithholdingModel;
  }

  return connection.model<TaxWithholdingDocument, TaxWithholdingModel>(
    modelName,
    taxWithholdingSchema
  );
}

export { taxWithholdingSchema };
export default taxWithholdingSchema;

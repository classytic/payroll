/**
 * @classytic/payroll - PayrollRecord Model
 *
 * Mongoose schema for payroll records with TTL and auto-export
 */

import mongoose, { Schema, Model } from 'mongoose';
import type { PayrollRecordDocument, PayrollStatus, PaymentMethod, PayrollBreakdown } from '../types.js';
import { HRM_CONFIG } from '../config.js';
import { PAYROLL_STATUS } from '../enums.js';
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
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Employee',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
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
      index: true,
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
payrollRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: HRM_CONFIG.dataRetention.payrollRecordsTTL });

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
  this.status = PAYROLL_STATUS.PAID;
  this.transactionId = transactionId;
  this.paidAt = paidAt;
};

payrollRecordSchema.methods.markAsCancelled = function (reason: string) {
  if (this.status === PAYROLL_STATUS.PAID) {
    throw new Error('Cannot cancel paid payroll record');
  }
  this.status = PAYROLL_STATUS.CANCELLED;
  this.notes = (this.notes || '') + `\nCancelled: ${reason}`;
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


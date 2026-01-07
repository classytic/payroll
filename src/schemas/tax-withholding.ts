/**
 * @classytic/payroll - Tax Withholding Schema
 *
 * Mongoose schema definitions for tax withholding tracking
 */

import mongoose, { Schema, type SchemaDefinition } from 'mongoose';
import { TAX_TYPE_VALUES, TAX_STATUS_VALUES } from '../enums.js';
import { periodSchema } from './common.js';

// ============================================================================
// Field Definitions
// ============================================================================

/**
 * Tax withholding field definitions
 * Can be spread into custom schemas
 */
export const taxWithholdingFields: SchemaDefinition = {
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
    required: false,
    ref: 'User',
  },
  payrollRecordId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'PayrollRecord',
    index: true,
  },
  transactionId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Transaction',
    index: true,
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
    default: 'BDT',
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

  notes: String,
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
};

// ============================================================================
// Index Definitions
// ============================================================================

/**
 * Recommended indexes for tax withholding collection
 */
export const taxWithholdingIndexes = [
  {
    fields: { organizationId: 1, status: 1, 'period.year': 1, 'period.month': 1 },
  },
  {
    fields: { employeeId: 1, 'period.year': -1, 'period.month': -1 },
  },
  {
    fields: { payrollRecordId: 1 },
  },
  {
    fields: { transactionId: 1 },
  },
  {
    fields: { organizationId: 1, taxType: 1, status: 1 },
  },
  {
    fields: { governmentTransactionId: 1 },
    options: { sparse: true },
  },
];

// ============================================================================
// Apply Indexes Function
// ============================================================================

/**
 * Apply all recommended indexes to a tax withholding schema
 */
export function applyTaxWithholdingIndexes(schema: Schema): void {
  for (const { fields, options } of taxWithholdingIndexes) {
    schema.index(fields as any, options);
  }
}

// ============================================================================
// Schema Creator Function
// ============================================================================

/**
 * Create a complete tax withholding schema with indexes, virtuals, and methods
 * @param additionalFields - Additional fields to add to the schema
 * @returns Configured tax withholding schema
 */
export function createTaxWithholdingSchema(additionalFields: SchemaDefinition = {}): Schema {
  const schema = new Schema(
    {
      ...taxWithholdingFields,
      ...additionalFields,
    },
    { timestamps: true }
  );

  // Apply indexes
  applyTaxWithholdingIndexes(schema);

  // Virtuals
  schema.virtual('isPending').get(function () {
    return this.status === 'pending';
  });

  schema.virtual('isPaid').get(function () {
    return this.status === 'paid';
  });

  schema.virtual('isSubmitted').get(function () {
    return this.status === 'submitted';
  });

  // Instance Methods
  schema.methods.markAsSubmitted = function (submittedAt = new Date()) {
    this.status = 'submitted';
    this.submittedAt = submittedAt;
  };

  schema.methods.markAsPaid = function (
    transactionId?: mongoose.Types.ObjectId,
    referenceNumber?: string,
    paidAt = new Date()
  ) {
    this.status = 'paid';
    this.governmentTransactionId = transactionId;
    this.referenceNumber = referenceNumber;
    this.paidAt = paidAt;
  };

  return schema;
}

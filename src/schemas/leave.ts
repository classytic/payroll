/**
 * @classytic/payroll - Leave Schemas
 *
 * Reusable schema definitions for leave management
 */

import { Schema, type SchemaDefinition } from 'mongoose';
import { LEAVE_TYPE_VALUES, LEAVE_REQUEST_STATUS_VALUES } from '../enums.js';

// ============================================================================
// Sub-Schemas
// ============================================================================

/**
 * Leave balance schema (embedded in Employee)
 */
export const leaveBalanceSchema = new Schema(
  {
    type: {
      type: String,
      enum: LEAVE_TYPE_VALUES,
      required: true,
    },
    allocated: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    pending: { type: Number, default: 0, min: 0 },
    carriedOver: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    year: { type: Number, required: true },
  },
  { _id: false }
);

// ============================================================================
// Leave Balance Fields (for Employee schema)
// ============================================================================

/**
 * Leave balance fields to add to Employee schema
 * Use with employmentFields spread
 *
 * @example
 * const employeeSchema = new Schema({
 *   ...employmentFields,
 *   ...leaveBalanceFields,
 * });
 */
export const leaveBalanceFields: SchemaDefinition = {
  leaveBalances: [leaveBalanceSchema],
};

// ============================================================================
// Leave Request Fields
// ============================================================================

/**
 * Leave request fields for LeaveRequest schema
 * Note: organizationId is optional to support single-tenant mode
 */
export const leaveRequestFields: SchemaDefinition = {
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: false, // Optional for single-tenant mode
  },
  employeeId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: LEAVE_TYPE_VALUES,
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: true, min: 0.5 },
  halfDay: { type: Boolean, default: false },
  reason: { type: String },
  status: {
    type: String,
    enum: LEAVE_REQUEST_STATUS_VALUES,
    default: 'pending',
  },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  reviewNotes: { type: String },
  attachments: [{ type: String }],
  metadata: { type: Schema.Types.Mixed, default: {} },
};

// ============================================================================
// Index Definitions
// ============================================================================

/**
 * Recommended indexes for LeaveRequest schema
 *
 * Note: In single-tenant mode where organizationId is optional/undefined,
 * indexes containing organizationId will still work but are less optimal.
 * The employeeId-based index (index 3) is most relevant for single-tenant.
 *
 * Multi-tenant apps should use all indexes for optimal query performance.
 */
export const leaveRequestIndexes = [
  { fields: { organizationId: 1, employeeId: 1, startDate: -1 } },
  { fields: { organizationId: 1, status: 1, createdAt: -1 } },
  { fields: { employeeId: 1, status: 1 } }, // Most relevant for single-tenant
  { fields: { organizationId: 1, type: 1, status: 1 } },
];

/**
 * TTL index for auto-cleanup (opt-in)
 */
export const leaveRequestTTLIndex = {
  fields: { createdAt: 1 },
  options: {
    expireAfterSeconds: 63072000, // 2 years default
    partialFilterExpression: {
      status: { $in: ['approved', 'rejected', 'cancelled'] },
    },
  },
};

/**
 * Apply indexes to LeaveRequest schema
 */
export function applyLeaveRequestIndexes(
  schema: Schema,
  options: { createIndexes?: boolean; enableTTL?: boolean; ttlSeconds?: number } = {}
): void {
  if (!options.createIndexes) return;

  for (const { fields } of leaveRequestIndexes) {
    schema.index(fields as unknown as Record<string, 1 | -1>);
  }

  if (options.enableTTL) {
    schema.index(leaveRequestTTLIndex.fields as unknown as Record<string, 1>, {
      ...leaveRequestTTLIndex.options,
      expireAfterSeconds:
        options.ttlSeconds ?? leaveRequestTTLIndex.options.expireAfterSeconds,
    });
  }
}

// ============================================================================
// Schema Creator
// ============================================================================

/**
 * Create a complete LeaveRequest schema
 *
 * @example
 * const LeaveRequest = model('LeaveRequest', createLeaveRequestSchema());
 *
 * // With indexes
 * const LeaveRequest = model('LeaveRequest', createLeaveRequestSchema({}, { createIndexes: true }));
 *
 * // Multi-tenant mode (require organizationId)
 * const LeaveRequest = model('LeaveRequest', createLeaveRequestSchema({}, {
 *   requireOrganizationId: true,
 * }));
 *
 * // With TTL for auto-cleanup
 * const LeaveRequest = model('LeaveRequest', createLeaveRequestSchema({}, {
 *   createIndexes: true,
 *   enableTTL: true,
 *   ttlSeconds: 31536000, // 1 year
 * }));
 */
export function createLeaveRequestSchema(
  additionalFields: SchemaDefinition = {},
  options: {
    createIndexes?: boolean;
    enableTTL?: boolean;
    ttlSeconds?: number;
    requireOrganizationId?: boolean;
  } = {}
): Schema {
  const fields = { ...leaveRequestFields };

  // Override organizationId requirement for multi-tenant mode
  if (options.requireOrganizationId) {
    fields.organizationId = {
      ...(fields.organizationId as object),
      required: true,
    };
  }

  const schema = new Schema(
    {
      ...fields,
      ...additionalFields,
    },
    { timestamps: true }
  );

  applyLeaveRequestIndexes(schema, options);

  // Virtual: isPending
  schema.virtual('isPending').get(function () {
    return this.status === 'pending';
  });

  // Virtual: isApproved
  schema.virtual('isApproved').get(function () {
    return this.status === 'approved';
  });

  // Virtual: isRejected
  schema.virtual('isRejected').get(function () {
    return this.status === 'rejected';
  });

  // Virtual: isCancelled
  schema.virtual('isCancelled').get(function () {
    return this.status === 'cancelled';
  });

  // Virtual: durationInDays
  schema.virtual('durationInDays').get(function () {
    return this.days;
  });

  return schema;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  leaveBalanceSchema,
  leaveBalanceFields,
  leaveRequestFields,
  leaveRequestIndexes,
  leaveRequestTTLIndex,
  applyLeaveRequestIndexes,
  createLeaveRequestSchema,
};

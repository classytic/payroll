/**
 * @classytic/payroll - Leave Schemas
 *
 * Leave balance sub-schema (for Employee embedding) and re-exports from
 * the authoritative LeaveRequest model definition.
 *
 * Single source of truth for LeaveRequest: models/leave-request.model.ts
 */

import { Schema, type SchemaDefinition, type IndexDefinition } from 'mongoose';
import { LEAVE_TYPE_VALUES, LEAVE_REQUEST_STATUS_VALUES } from '../enums.js';
import {
  leaveRequestSchema,
  getLeaveRequestModel,
  type LeaveRequestModel,
} from '../models/leave-request.model.js';

// Re-export the authoritative LeaveRequest schema and model
export { leaveRequestSchema, getLeaveRequestModel, type LeaveRequestModel };

// ============================================================================
// Leave Balance Sub-Schema (for Employee embedding)
// ============================================================================

/**
 * Leave balance schema (embedded in Employee documents)
 * This is NOT a standalone model - it's for embedding.
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

/**
 * Leave balance fields for embedding in Employee schema
 *
 * @example
 * const employeeSchema = new Schema({
 *   ...createEmploymentFields({ organizationRef: 'Branch' }),
 *   ...leaveBalanceFields,
 * });
 */
export const leaveBalanceFields: SchemaDefinition = {
  leaveBalances: [leaveBalanceSchema],
};

// ============================================================================
// Index Definitions (for custom schema composition)
// ============================================================================

/**
 * Recommended indexes for LeaveRequest collection
 */
export const leaveRequestIndexes = [
  { fields: { organizationId: 1, employeeId: 1, startDate: -1 } },
  { fields: { organizationId: 1, status: 1, createdAt: -1 } },
  { fields: { employeeId: 1, status: 1 } },
  { fields: { organizationId: 1, type: 1, status: 1 } },
];

/**
 * TTL index config for auto-cleanup (opt-in)
 */
export const leaveRequestTTLIndex = {
  fields: { createdAt: 1 },
  options: {
    expireAfterSeconds: 63072000, // 2 years
    partialFilterExpression: {
      status: { $in: ['approved', 'rejected', 'cancelled'] },
    },
  },
};

/**
 * Apply indexes to a LeaveRequest schema
 */
export function applyLeaveRequestIndexes(
  schema: Schema,
  options: { createIndexes?: boolean; enableTTL?: boolean; ttlSeconds?: number } = {}
): void {
  if (!options.createIndexes) return;

  for (const { fields } of leaveRequestIndexes) {
    schema.index(fields as unknown as IndexDefinition);
  }

  if (options.enableTTL) {
    schema.index(leaveRequestTTLIndex.fields as Record<string, 1>, {
      ...leaveRequestTTLIndex.options,
      expireAfterSeconds: options.ttlSeconds ?? leaveRequestTTLIndex.options.expireAfterSeconds,
    });
  }
}

// ============================================================================
// Schema Field Extraction (for custom schema composition)
// ============================================================================

/**
 * Extract field definitions from the authoritative LeaveRequest schema.
 * Use this when composing custom schemas.
 *
 * @example
 * const customSchema = new Schema({
 *   ...getLeaveRequestFields(),
 *   myCustomField: String,
 * });
 */
export function getLeaveRequestFields(): SchemaDefinition {
  const paths = leaveRequestSchema.paths;
  const fields: SchemaDefinition = {};

  for (const [key, pathObj] of Object.entries(paths)) {
    if (key === '_id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') {
      continue;
    }
    fields[key] = (pathObj as { options?: SchemaDefinition[string] }).options || {};
  }

  return fields;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  leaveBalanceSchema,
  leaveBalanceFields,
  leaveRequestSchema,
  leaveRequestIndexes,
  leaveRequestTTLIndex,
  applyLeaveRequestIndexes,
  getLeaveRequestFields,
  getLeaveRequestModel,
};

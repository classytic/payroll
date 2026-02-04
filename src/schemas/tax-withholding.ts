/**
 * @classytic/payroll - Tax Withholding Schema
 *
 * Re-exports from the authoritative model definition.
 * Use this for schema composition when building custom schemas.
 *
 * Single source of truth: models/tax-withholding.model.ts
 */

import {
  taxWithholdingSchema,
  getTaxWithholdingModel,
  type TaxWithholdingModel,
} from '../models/tax-withholding.model.js';
import type { Schema, SchemaDefinition, IndexDefinition } from 'mongoose';

// Re-export the authoritative schema
export { taxWithholdingSchema, getTaxWithholdingModel, type TaxWithholdingModel };

// ============================================================================
// Index Definitions (for custom schema composition)
// ============================================================================

/**
 * Recommended indexes for tax withholding collection
 */
export const taxWithholdingIndexes = [
  { fields: { organizationId: 1, status: 1, 'period.year': 1, 'period.month': 1 } },
  { fields: { employeeId: 1, 'period.year': -1, 'period.month': -1 } },
  { fields: { payrollRecordId: 1 } },
  { fields: { transactionId: 1 } },
  { fields: { organizationId: 1, taxType: 1, status: 1 } },
  { fields: { governmentTransactionId: 1 }, options: { sparse: true } },
];

/**
 * Apply recommended indexes to a custom tax withholding schema
 */
export function applyTaxWithholdingIndexes(schema: Schema): void {
  for (const { fields, options } of taxWithholdingIndexes) {
    schema.index(fields as unknown as IndexDefinition, options);
  }
}

// ============================================================================
// Schema Field Extraction (for custom schema composition)
// ============================================================================

/**
 * Extract field definitions from the authoritative schema.
 * Use this when composing custom schemas that need tax withholding fields.
 *
 * @example
 * const customSchema = new Schema({
 *   ...getTaxWithholdingFields(),
 *   myCustomField: String,
 * });
 */
export function getTaxWithholdingFields(): SchemaDefinition {
  const paths = taxWithholdingSchema.paths;
  const fields: SchemaDefinition = {};

  for (const [key, pathObj] of Object.entries(paths)) {
    if (key === '_id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') {
      continue;
    }
    fields[key] = (pathObj as { options?: SchemaDefinition[string] }).options || {};
  }

  return fields;
}

export default taxWithholdingSchema;

/**
 * @classytic/payroll - Common Schema Definitions
 *
 * Shared sub-schemas used across multiple schema modules
 * Extracted to prevent circular dependencies
 */

import { Schema } from 'mongoose';

// ============================================================================
// Period Schema
// ============================================================================

/**
 * Payroll period schema
 * Shared across PayrollRecord and TaxWithholding schemas
 */
export const periodSchema = new Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2020 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    payDate: { type: Date, required: true },
  },
  { _id: false }
);

/**
 * @classytic/payroll - Shift Compliance Mongoose Schemas
 *
 * OPTIONAL schemas for users who want to store attendance policies in MongoDB.
 *
 * These schemas are NOT required to use the shift compliance calculators.
 * The calculators work with plain objects. Use these schemas only if you
 * want to persist policies in your database.
 *
 * @example
 * ```typescript
 * import { AttendancePolicySchema } from '@classytic/payroll';
 * import { Schema, model } from 'mongoose';
 *
 * // Use as-is
 * const AttendancePolicy = model('AttendancePolicy', AttendancePolicySchema);
 *
 * // Or extend with your own fields
 * const CustomPolicySchema = new Schema({
 *   ...AttendancePolicySchema.obj,
 *   customField: String,
 *   approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
 * });
 * ```
 */

import { Schema, type SchemaDefinition } from 'mongoose';

// ============================================================================
// Sub-Schema Definitions
// ============================================================================

/**
 * Schema definition for penalty tiers (progressive discipline)
 */
export const PenaltyTierSchemaDefinition: SchemaDefinition = {
  from: {
    type: Number,
    required: true,
    min: 1,
    description: 'Starting occurrence number (1-indexed)',
  },
  to: {
    type: Number,
    min: 1,
    description: 'Ending occurrence number (optional for open-ended tier)',
  },
  penalty: {
    type: Number,
    required: true,
    min: 0,
    description: 'Penalty amount (0 for warnings)',
  },
  warning: {
    type: Boolean,
    default: false,
    description: 'Whether this is a warning-only tier',
  },
};

/**
 * Schema for penalty tiers
 */
export const PenaltyTierSchema: Schema = new Schema(PenaltyTierSchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for max penalties per period
 */
export const MaxPenaltiesSchemaDefinition: SchemaDefinition = {
  count: {
    type: Number,
    required: true,
    min: 1,
    description: 'Maximum number of penalties allowed in period',
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    required: true,
    description: 'Period type',
  },
};

/**
 * Schema for max penalties per period
 */
export const MaxPenaltiesSchema: Schema = new Schema(MaxPenaltiesSchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for late arrival policy
 */
export const LateArrivalPolicySchemaDefinition: SchemaDefinition = {
  enabled: {
    type: Boolean,
    required: true,
    default: true,
    description: 'Whether late arrival penalties are enabled',
  },
  gracePeriod: {
    type: Number,
    required: true,
    min: 0,
    max: 60,
    default: 0,
    description: 'Grace period in minutes before penalty applies',
  },
  mode: {
    type: String,
    enum: ['flat', 'per-minute', 'percentage', 'tiered'],
    required: true,
    description: 'Penalty calculation mode',
  },
  flatAmount: {
    type: Number,
    min: 0,
    description: 'Flat penalty amount per occurrence (for flat mode)',
  },
  perMinuteRate: {
    type: Number,
    min: 0,
    description: 'Penalty per minute late (for per-minute mode)',
  },
  percentageRate: {
    type: Number,
    min: 0,
    max: 100,
    description: 'Percentage of daily wage (for percentage mode)',
  },
  tiers: {
    type: [PenaltyTierSchema],
    description: 'Penalty tiers for progressive discipline (for tiered mode)',
  },
  maxPenaltiesPerPeriod: {
    type: MaxPenaltiesSchema,
    description: 'Maximum penalties allowed per period',
  },
  resetOccurrenceCount: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    description: 'When to reset occurrence counter',
  },
};

/**
 * Schema for late arrival policy
 */
export const LateArrivalPolicySchema: Schema = new Schema(LateArrivalPolicySchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for early departure policy
 * (Same structure as late arrival policy)
 */
export const EarlyDeparturePolicySchemaDefinition = LateArrivalPolicySchemaDefinition;

/**
 * Schema for early departure policy
 */
export const EarlyDeparturePolicySchema: Schema = new Schema(EarlyDeparturePolicySchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for weekend premium
 */
export const WeekendPremiumSchemaDefinition: SchemaDefinition = {
  saturday: {
    type: Number,
    required: true,
    min: 1,
    description: 'Saturday premium multiplier (e.g., 1.5 for time-and-a-half)',
  },
  sunday: {
    type: Number,
    required: true,
    min: 1,
    description: 'Sunday premium multiplier (e.g., 2.0 for double time)',
  },
};

/**
 * Schema for weekend premium
 */
export const WeekendPremiumSchema: Schema = new Schema(WeekendPremiumSchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for night shift differential
 */
export const NightShiftDifferentialSchemaDefinition: SchemaDefinition = {
  startHour: {
    type: Number,
    required: true,
    min: 0,
    max: 23,
    description: 'Night shift start hour (24-hour format, e.g., 22 for 10pm)',
  },
  endHour: {
    type: Number,
    required: true,
    min: 0,
    max: 23,
    description: 'Night shift end hour (24-hour format, e.g., 6 for 6am)',
  },
  multiplier: {
    type: Number,
    required: true,
    min: 1,
    description: 'Night shift premium multiplier (e.g., 1.3 for 30% premium)',
  },
};

/**
 * Schema for night shift differential
 */
export const NightShiftDifferentialSchema: Schema = new Schema(NightShiftDifferentialSchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for overtime policy
 */
export const OvertimePolicySchemaDefinition: SchemaDefinition = {
  enabled: {
    type: Boolean,
    required: true,
    default: true,
    description: 'Whether overtime bonuses are enabled',
  },
  mode: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true,
    description: 'Overtime calculation mode',
  },
  dailyThreshold: {
    type: Number,
    min: 0,
    description: 'Daily overtime threshold in hours (for daily mode)',
  },
  dailyMultiplier: {
    type: Number,
    min: 1,
    description: 'Daily overtime pay multiplier (e.g., 1.5 for time-and-a-half)',
  },
  weeklyThreshold: {
    type: Number,
    min: 0,
    description: 'Weekly overtime threshold in hours (for weekly mode)',
  },
  weeklyMultiplier: {
    type: Number,
    min: 1,
    description: 'Weekly overtime pay multiplier',
  },
  monthlyThreshold: {
    type: Number,
    min: 0,
    description: 'Monthly overtime threshold in hours (for monthly mode)',
  },
  monthlyMultiplier: {
    type: Number,
    min: 1,
    description: 'Monthly overtime pay multiplier',
  },
  weekendPremium: {
    type: WeekendPremiumSchema,
    description: 'Weekend premium rates',
  },
  nightShiftDifferential: {
    type: NightShiftDifferentialSchema,
    description: 'Night shift differential rates',
  },
};

/**
 * Schema for overtime policy
 */
export const OvertimePolicySchema: Schema = new Schema(OvertimePolicySchemaDefinition, {
  _id: false,
  timestamps: false,
});

/**
 * Schema definition for clock rounding policy
 */
export const ClockRoundingPolicySchemaDefinition: SchemaDefinition = {
  enabled: {
    type: Boolean,
    required: true,
    default: false,
    description: 'Whether clock rounding is enabled',
  },
  roundTo: {
    type: Number,
    enum: [5, 10, 15],
    description: 'Round to nearest N minutes',
  },
  mode: {
    type: String,
    enum: ['up', 'down', 'nearest'],
    description: 'Rounding mode: up (favor employee), down (favor employer), nearest (neutral)',
  },
};

/**
 * Schema for clock rounding policy
 */
export const ClockRoundingPolicySchema: Schema = new Schema(ClockRoundingPolicySchemaDefinition, {
  _id: false,
  timestamps: false,
});

// ============================================================================
// Main Attendance Policy Schema
// ============================================================================

/**
 * Schema definition for attendance policy
 *
 * Users can extend this with their own fields:
 * ```typescript
 * const CustomPolicySchema = new Schema({
 *   ...AttendancePolicySchemaDefinition,
 *   approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
 *   department: String,
 * });
 * ```
 */
export const AttendancePolicySchemaDefinition: SchemaDefinition = {
  organizationId: {
    type: Schema.Types.ObjectId,
    index: true,
    description: 'Organization this policy belongs to (for multi-tenant)',
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    description: 'Policy name',
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    description: 'Policy description',
  },
  lateArrival: {
    type: LateArrivalPolicySchema,
    required: true,
    description: 'Late arrival penalty policy',
  },
  earlyDeparture: {
    type: EarlyDeparturePolicySchema,
    required: true,
    description: 'Early departure penalty policy',
  },
  overtime: {
    type: OvertimePolicySchema,
    required: true,
    description: 'Overtime bonus policy',
  },
  clockRounding: {
    type: ClockRoundingPolicySchema,
    description: 'Clock rounding policy (optional)',
  },
  effectiveFrom: {
    type: Date,
    required: true,
    default: Date.now,
    description: 'When this policy becomes effective',
  },
  effectiveTo: {
    type: Date,
    default: null,
    description: 'When this policy expires (null for no expiration)',
  },
  active: {
    type: Boolean,
    required: true,
    default: true,
    index: true,
    description: 'Whether this policy is currently active',
  },
};

/**
 * Main Attendance Policy Schema
 *
 * @example
 * ```typescript
 * import { AttendancePolicySchema } from '@classytic/payroll';
 * import { model } from 'mongoose';
 *
 * const AttendancePolicy = model('AttendancePolicy', AttendancePolicySchema);
 *
 * // Create a new policy
 * const policy = new AttendancePolicy({
 *   name: 'Tech Department Policy',
 *   lateArrival: { ... },
 *   earlyDeparture: { ... },
 *   overtime: { ... },
 * });
 * await policy.save();
 * ```
 */
export const AttendancePolicySchema: Schema = new Schema(AttendancePolicySchemaDefinition, {
  timestamps: true,
  collection: 'attendance_policies',
});

// ============================================================================
// Indexes
// ============================================================================

// Compound index for finding active policies by organization
AttendancePolicySchema.index({ organizationId: 1, active: 1, effectiveFrom: -1 });

// Index for finding policies by effective date range
AttendancePolicySchema.index({ effectiveFrom: 1, effectiveTo: 1 });

// ============================================================================
// Helper Methods
// ============================================================================

/**
 * Instance method: Check if policy is currently active
 */
AttendancePolicySchema.methods.isCurrentlyActive = function (this: any): boolean {
  if (!this.active) return false;

  const now = new Date();
  if (this.effectiveFrom > now) return false;
  if (this.effectiveTo && this.effectiveTo < now) return false;

  return true;
};

/**
 * Static method: Find active policy for an organization
 */
AttendancePolicySchema.statics.findActiveForOrganization = function (
  this: any,
  organizationId: any,
  date: Date = new Date()
) {
  return this.findOne({
    organizationId,
    active: true,
    effectiveFrom: { $lte: date },
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gt: date } },
    ],
  }).sort({ effectiveFrom: -1 });
};

// ============================================================================
// Type Augmentation (for TypeScript users)
// ============================================================================

/**
 * Instance methods interface
 */
export interface AttendancePolicyDocument {
  isCurrentlyActive(): boolean;
}

/**
 * Static methods interface
 */
export interface AttendancePolicyModel {
  findActiveForOrganization(organizationId: any, date?: Date): Promise<any>;
}

// ============================================================================
// Export All
// ============================================================================

export default AttendancePolicySchema;

/**
 * @classytic/payroll - Mongoose Schemas
 *
 * Reusable schema definitions for employee and payroll models
 * Can be spread into your own schemas
 */

import { Schema, type SchemaDefinition, type Types } from 'mongoose';
import {
  EMPLOYMENT_TYPE_VALUES,
  EMPLOYEE_STATUS_VALUES,
  DEPARTMENT_VALUES,
  PAYMENT_FREQUENCY_VALUES,
  ALLOWANCE_TYPE_VALUES,
  DEDUCTION_TYPE_VALUES,
  TERMINATION_REASON_VALUES,
  PAYROLL_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
} from '../enums.js';
import { HRM_CONFIG } from '../config.js';
import { periodSchema } from './common.js';

// ============================================================================
// Schema Options (Multi-Tenant / Multi-Branch Flexibility)
// ============================================================================

/**
 * Options for configuring schema references.
 *
 * Use these to customize what collection `organizationId` references.
 * This supports multi-branch, multi-tenant, or any other hierarchy structure.
 *
 * @example
 * ```typescript
 * // Multi-branch setup (one company, multiple branches)
 * const employeeSchema = createEmployeeSchema({}, {
 *   organizationRef: 'Branch',
 * });
 *
 * // Multi-tenant SaaS
 * const employeeSchema = createEmployeeSchema({}, {
 *   organizationRef: 'Tenant',
 * });
 *
 * // Enterprise with workspaces
 * const employeeSchema = createEmployeeSchema({}, {
 *   organizationRef: 'Workspace',
 * });
 * ```
 */
export interface PayrollSchemaOptions {
  /**
   * The collection name that `organizationId` references.
   *
   * This is used for Mongoose's `populate()` feature. The multi-tenant
   * plugin filters by the ObjectId value regardless of what collection
   * it references.
   *
   * @default 'Organization'
   *
   * @example 'Branch' | 'Company' | 'Tenant' | 'Workspace' | 'Team'
   */
  organizationRef?: string;

  /**
   * The collection name that `userId` references.
   *
   * @default 'User'
   */
  userRef?: string;
}

// ============================================================================
// Sub-Schemas
// ============================================================================

/**
 * Allowance schema definition
 */
export const allowanceSchema = new Schema(
  {
    type: {
      type: String,
      enum: ALLOWANCE_TYPE_VALUES,
      required: true,
    },
    name: { type: String },
    amount: { type: Number, required: true, min: 0 },
    isPercentage: { type: Boolean, default: false },
    value: { type: Number },
    taxable: { type: Boolean, default: true },
    recurring: { type: Boolean, default: true },
    effectiveFrom: { type: Date, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { _id: false }
);

/**
 * Deduction schema definition
 */
export const deductionSchema = new Schema(
  {
    type: {
      type: String,
      enum: DEDUCTION_TYPE_VALUES,
      required: true,
    },
    name: { type: String },
    amount: { type: Number, required: true, min: 0 },
    isPercentage: { type: Boolean, default: false },
    value: { type: Number },
    auto: { type: Boolean, default: false },
    recurring: { type: Boolean, default: true },
    effectiveFrom: { type: Date, default: () => new Date() },
    effectiveTo: { type: Date },
    description: { type: String },
  },
  { _id: false }
);

/**
 * Compensation schema definition
 */
export const compensationSchema = new Schema(
  {
    baseAmount: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      enum: PAYMENT_FREQUENCY_VALUES,
      default: 'monthly',
    },
    currency: { type: String }, // No default - use config or USD fallback in application logic
    allowances: [allowanceSchema],
    deductions: [deductionSchema],
    grossSalary: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    effectiveFrom: { type: Date, default: () => new Date() },
    lastModified: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

/**
 * Work schedule schema definition
 */
export const workScheduleSchema = new Schema(
  {
    hoursPerWeek: { type: Number, min: 0, max: 168 },
    hoursPerDay: { type: Number, min: 0, max: 24 },
    workingDays: [{ type: Number, min: 0, max: 6 }],
    shiftStart: { type: String },
    shiftEnd: { type: String },
  },
  { _id: false }
);

/**
 * Bank details schema definition
 */
export const bankDetailsSchema = new Schema(
  {
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    branchName: { type: String },
    routingNumber: { type: String },
  },
  { _id: false }
);

/**
 * Employment history entry schema
 */
export const employmentHistorySchema = new Schema(
  {
    hireDate: { type: Date, required: true },
    terminationDate: { type: Date, required: true },
    reason: { type: String, enum: TERMINATION_REASON_VALUES },
    finalSalary: { type: Number },
    position: { type: String },
    department: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

/**
 * Payroll stats schema (pre-calculated)
 */
export const payrollStatsSchema = new Schema(
  {
    totalPaid: { type: Number, default: 0, min: 0 },
    lastPaymentDate: { type: Date },
    nextPaymentDate: { type: Date },
    paymentsThisYear: { type: Number, default: 0, min: 0 },
    averageMonthly: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

// ============================================================================
// Employment Fields (Spread into Employee Schema)
// ============================================================================

/**
 * Employment fields to spread into your Employee schema.
 * Use `createEmploymentFields()` for configurable references.
 */
/**
 * Create employment fields with configurable references.
 *
 * @param options - Schema options for configuring references
 * @returns SchemaDefinition for employment fields
 */
export function createEmploymentFields(options: PayrollSchemaOptions = {}): SchemaDefinition {
  const { organizationRef = 'Organization', userRef = 'User' } = options;

  return {
    userId: {
      type: Schema.Types.ObjectId,
      ref: userRef,
      required: false,  // Allow guest employees (no user account)
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: false,  // For guest employees without user account
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: organizationRef,  // Configurable: 'Branch', 'Company', 'Tenant', etc.
      required: true,
    },
    employeeId: { type: String, required: true },
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPE_VALUES,
      default: 'full_time',
    },
    status: {
      type: String,
      enum: EMPLOYEE_STATUS_VALUES,
      default: 'active',
    },
    department: { type: String, enum: DEPARTMENT_VALUES },
    position: { type: String, required: true },
    hireDate: { type: Date, required: true },
    terminationDate: { type: Date },
    probationEndDate: { type: Date },
    employmentHistory: [employmentHistorySchema],
    compensation: { type: compensationSchema, required: true },
    workSchedule: workScheduleSchema,
    bankDetails: bankDetailsSchema,
    payrollStats: { type: payrollStatsSchema, default: () => ({}) },
  };
}


// ============================================================================
// Payroll Record Sub-Schemas
// ============================================================================

/**
 * Payroll breakdown schema
 */
export const payrollBreakdownSchema = new Schema(
  {
    baseAmount: { type: Number, required: true, min: 0 },
    allowances: [
      {
        type: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        taxable: { type: Boolean, default: true },
      },
    ],
    deductions: [
      {
        type: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        description: { type: String },
      },
    ],
    grossSalary: { type: Number, required: true, min: 0 },
    netSalary: { type: Number, required: true, min: 0 },
    taxableAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    workingDays: { type: Number, min: 0 },
    actualDays: { type: Number, min: 0 },
    proRatedAmount: { type: Number, default: 0, min: 0 },
    attendanceDeduction: { type: Number, default: 0, min: 0 },
    overtimeAmount: { type: Number, default: 0, min: 0 },
    bonusAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * Payroll period schema (imported from common to avoid circular dependencies)
 * Re-exported for external use
 */
export { periodSchema };

/**
 * Create payroll record fields with configurable references.
 *
 * @param options - Schema options for configuring references
 * @returns SchemaDefinition for payroll record fields
 */
export function createPayrollRecordFields(options: PayrollSchemaOptions = {}): SchemaDefinition {
  const { organizationRef = 'Organization', userRef = 'User' } = options;

  return {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: organizationRef,  // Configurable: 'Branch', 'Company', 'Tenant', etc.
      required: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: userRef,
      required: false,  // Optional for guest employees
    },
    period: { type: periodSchema, required: true },
    breakdown: { type: payrollBreakdownSchema, required: true },
    transactionId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: PAYROLL_STATUS_VALUES,
      default: 'pending',
    },
    paidAt: { type: Date },
    processedAt: { type: Date },
    paymentMethod: { type: String, enum: PAYMENT_METHOD_VALUES },
    metadata: { type: Schema.Types.Mixed },
    processedBy: { type: Schema.Types.ObjectId, ref: userRef },
    notes: { type: String },
    payslipUrl: { type: String },
    exported: { type: Boolean, default: false },
    exportedAt: { type: Date },
    // Void / Reversal fields (v2.4.0+)
    isVoided: { type: Boolean, default: false },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: userRef },
    voidReason: { type: String },
    reversedAt: { type: Date },
    reversedBy: { type: Schema.Types.ObjectId, ref: userRef },
    reversalReason: { type: String },
    reversalTransactionId: { type: Schema.Types.ObjectId },
    originalPayrollId: { type: Schema.Types.ObjectId },
    // TTL expiration (per-document)
    expireAt: { type: Date },

    // Payroll run type (v2.8.0+)
    payrollRunType: {
      type: String,
      enum: ['regular', 'off-cycle', 'supplemental', 'retroactive'],
      default: 'regular',
    },

    // Payment frequency at time of processing (v2.9.0+)
    // Stored for proper idempotency key reconstruction in void/reverse operations
    paymentFrequency: {
      type: String,
      enum: PAYMENT_FREQUENCY_VALUES,
      default: 'monthly',
    },

    // Retroactive adjustment details (v2.8.0+)
    retroactiveAdjustment: {
      type: new Schema(
        {
          originalPeriod: {
            month: { type: Number, required: true, min: 1, max: 12 },
            year: { type: Number, required: true },
          },
          originalPayrollId: { type: Schema.Types.ObjectId },
          reason: { type: String, required: true },
          adjustmentAmount: { type: Number, required: true },
          approved: { type: Boolean },
          approvedBy: { type: Schema.Types.ObjectId },
          approvedAt: { type: Date },
        },
        { _id: false }
      ),
      required: false,
    },

    // Employer contributions (v2.8.0+)
    employerContributions: [
      {
        type: {
          type: String,
          enum: ['social_security', 'pension', 'unemployment', 'health_insurance', 'other'],
          required: true,
        },
        amount: { type: Number, required: true },
        description: { type: String },
        mandatory: { type: Boolean },
        referenceNumber: { type: String },
      },
    ],

    // Corrections history (v2.8.0+)
    corrections: [
      {
        previousAmount: { type: Number },
        newAmount: { type: Number },
        reason: { type: String },
        correctedBy: { type: Schema.Types.ObjectId, ref: userRef },
        correctedAt: { type: Date, default: Date.now },
      },
    ],
  };
}


// ============================================================================
// Index Definitions
// ============================================================================

/**
 * Recommended indexes for Employee schema
 */
export const employeeIndexes = [
  { fields: { organizationId: 1, employeeId: 1 }, options: { unique: true } },
  // Partial unique index: Only includes docs with userId field (excludes guest employees)
  // Uses partialFilterExpression instead of sparse for compound indexes
  {
    fields: { userId: 1, organizationId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { userId: { $exists: true } }
    }
  },
  // Partial unique index: Only includes non-terminated docs with email
  // This allows email reuse when employees are terminated and rehired
  {
    fields: { email: 1, organizationId: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        email: { $exists: true },
        status: { $in: ['active', 'on_leave', 'suspended'] }
      }
    }
  },
  { fields: { organizationId: 1, status: 1 } },
  { fields: { organizationId: 1, department: 1 } },
  { fields: { organizationId: 1, 'compensation.netSalary': -1 } },
];

/**
 * Recommended indexes for PayrollRecord schema
 *
 * Includes UNIQUE compound index on (org, employee, period, runType) with partial filter
 * to prevent race conditions while still allowing re-processing after void/reverse.
 */
export const payrollRecordIndexes = [
  /**
   * UNIQUE Compound Index (v2.9.0+) - PRIMARY duplicate protection
   *
   * Prevents duplicate payrolls at the database level for the same:
   * - Organization, Employee, Period (month + year + startDate), Payroll run type
   *
   * The period.startDate is critical for non-monthly frequencies (weekly, bi_weekly,
   * daily, hourly) where multiple payroll runs can occur within the same calendar month.
   *
   * Partial filter excludes voided records to allow re-processing.
   * Duplicate inserts fail with E11000 → converted to DuplicatePayrollError.
   */
  {
    fields: {
      organizationId: 1,
      employeeId: 1,
      'period.month': 1,
      'period.year': 1,
      'period.startDate': 1,
      payrollRunType: 1,
    },
    options: {
      unique: true,
      name: 'unique_payroll_per_period_startdate_runtype',
      // Only enforce for non-voided records (uses $eq which is supported in partial indexes)
      // When a record is voided, isVoided is set to true, excluding it from unique constraint
      partialFilterExpression: {
        isVoided: { $eq: false },
      },
    },
  },
  // Composite index for common queries
  { fields: { organizationId: 1, employeeId: 1, 'period.month': 1, 'period.year': 1 } },
  { fields: { organizationId: 1, 'period.year': 1, 'period.month': 1 } },
  { fields: { employeeId: 1, 'period.year': -1, 'period.month': -1 } },
  { fields: { status: 1, createdAt: -1 } },
  { fields: { organizationId: 1, status: 1, 'period.payDate': 1 } },
  // Index for payroll run type queries (supplemental, retroactive, etc.)
  { fields: { organizationId: 1, payrollRunType: 1, 'period.year': 1, 'period.month': 1 } },
  // TTL index using expireAt field for per-document retention (jurisdiction-specific)
  {
    fields: { expireAt: 1 },
    options: {
      expireAfterSeconds: 0, // Delete immediately when expireAt is reached
    },
  },
];

/**
 * Apply indexes to schema
 */
export function applyEmployeeIndexes(schema: Schema): void {
  for (const { fields, options } of employeeIndexes) {
    schema.index(fields as unknown as Record<string, 1 | -1>, options);
  }
}

/**
 * Apply payroll record indexes to schema
 */
export function applyPayrollRecordIndexes(schema: Schema): void {
  for (const { fields, options } of payrollRecordIndexes) {
    schema.index(fields as unknown as Record<string, 1 | -1>, options);
  }
}

// ============================================================================
// Complete Schema Creators
// ============================================================================

/**
 * Create a complete Employee schema with all HRM fields.
 *
 * @param additionalFields - Extra fields to add to the schema
 * @param options - Schema options (organizationRef, userRef)
 * @returns Mongoose Schema for Employee
 *
 * @example
 * ```typescript
 * // Default (references 'Organization')
 * const employeeSchema = createEmployeeSchema();
 *
 * // Multi-branch setup
 * const employeeSchema = createEmployeeSchema({}, {
 *   organizationRef: 'Branch',
 * });
 *
 * // With additional fields
 * const employeeSchema = createEmployeeSchema({
 *   customField: { type: String },
 * }, {
 *   organizationRef: 'Company',
 * });
 * ```
 */
export function createEmployeeSchema(
  additionalFields: SchemaDefinition = {},
  options: PayrollSchemaOptions = {}
): Schema {
  const schema = new Schema(
    {
      ...createEmploymentFields(options),
      ...additionalFields,
    },
    { timestamps: true }
  );

  // Note: Pre-save hooks are not needed for partial indexes since:
  // - Guest employees use insertOne() which bypasses Mongoose hooks
  // - User-linked employees use Model.create() which properly sets userId
  // - Partial indexes with partialFilterExpression handle inclusion/exclusion

  applyEmployeeIndexes(schema);
  return schema;
}

/**
 * Create a complete PayrollRecord schema.
 *
 * @param additionalFields - Extra fields to add to the schema
 * @param options - Schema options (organizationRef, userRef)
 * @returns Mongoose Schema for PayrollRecord
 *
 * @example
 * ```typescript
 * // Multi-branch setup
 * const payrollRecordSchema = createPayrollRecordSchema({}, {
 *   organizationRef: 'Branch',
 * });
 * ```
 */
export function createPayrollRecordSchema(
  additionalFields: SchemaDefinition = {},
  options: PayrollSchemaOptions = {}
): Schema {
  const schema = new Schema(
    {
      ...createPayrollRecordFields(options),
      ...additionalFields,
    },
    { timestamps: true }
  );

  applyPayrollRecordIndexes(schema);

  // Virtual: totalAmount
  schema.virtual('totalAmount').get(function () {
    return this.breakdown?.netSalary || 0;
  });

  // Virtual: isPaid
  schema.virtual('isPaid').get(function () {
    return this.status === 'paid';
  });

  // Virtual: periodLabel
  schema.virtual('periodLabel').get(function () {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return `${months[this.period.month - 1]} ${this.period.year}`;
  });

  // Method: markAsPaid
  schema.methods.markAsPaid = function (
    transactionId: Types.ObjectId,
    paidAt = new Date()
  ) {
    this.status = 'paid';
    this.transactionId = transactionId;
    this.paidAt = paidAt;
  };

  // Method: markAsExported
  schema.methods.markAsExported = function () {
    this.exported = true;
    this.exportedAt = new Date();
  };

  // Method: canBeDeleted
  schema.methods.canBeDeleted = function (): boolean {
    return this.exported && this.status === 'paid';
  };

  return schema;
}


// ============================================================================
// Leave Schemas
// ============================================================================

export {
  leaveBalanceSchema,
  leaveBalanceFields,
  leaveRequestSchema,
  leaveRequestIndexes,
  leaveRequestTTLIndex,
  applyLeaveRequestIndexes,
  getLeaveRequestFields,
  getLeaveRequestModel,
} from './leave.js';

// ============================================================================
// Tax Withholding Schemas
// ============================================================================

export {
  taxWithholdingSchema,
  taxWithholdingIndexes,
  applyTaxWithholdingIndexes,
  getTaxWithholdingFields,
  getTaxWithholdingModel,
} from './tax-withholding.js';

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Sub-schemas
  allowanceSchema,
  deductionSchema,
  compensationSchema,
  workScheduleSchema,
  bankDetailsSchema,
  employmentHistorySchema,
  payrollStatsSchema,
  payrollBreakdownSchema,
  periodSchema,
  // Field creators (configurable references)
  createEmploymentFields,
  createPayrollRecordFields,
  // Indexes
  employeeIndexes,
  payrollRecordIndexes,
  applyEmployeeIndexes,
  applyPayrollRecordIndexes,
  // Schema creators
  createEmployeeSchema,
  createPayrollRecordSchema,
};


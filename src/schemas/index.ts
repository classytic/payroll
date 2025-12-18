/**
 * @classytic/payroll - Mongoose Schemas
 *
 * Reusable schema definitions for employee and payroll models
 * Can be spread into your own schemas
 */

import mongoose, { Schema, type SchemaDefinition } from 'mongoose';
import {
  EMPLOYMENT_TYPE_VALUES,
  EMPLOYEE_STATUS_VALUES,
  DEPARTMENT_VALUES,
  PAYMENT_FREQUENCY_VALUES,
  ALLOWANCE_TYPE_VALUES,
  DEDUCTION_TYPE_VALUES,
  TERMINATION_REASON_VALUES,
  PAYROLL_STATUS_VALUES,
} from '../enums.js';
import { HRM_CONFIG } from '../config.js';

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
    currency: { type: String, default: 'BDT' },
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
 * Employment fields to spread into your Employee schema
 * 
 * @example
 * const employeeSchema = new Schema({
 *   ...employmentFields,
 *   // Your custom fields
 *   certifications: [{ name: String, issuedDate: Date }],
 * });
 */
export const employmentFields: SchemaDefinition = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
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
  },
  { _id: false }
);

/**
 * Payroll period schema
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

/**
 * Payroll record fields to spread into PayrollRecord schema
 */
export const payrollRecordFields: SchemaDefinition = {
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  employeeId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  period: { type: periodSchema, required: true },
  breakdown: { type: payrollBreakdownSchema, required: true },
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  status: {
    type: String,
    enum: PAYROLL_STATUS_VALUES,
    default: 'pending',
    index: true,
  },
  paidAt: { type: Date },
  paymentMethod: { type: String },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  payslipUrl: { type: String },
  exported: { type: Boolean, default: false },
  exportedAt: { type: Date },
};

// ============================================================================
// Index Definitions
// ============================================================================

/**
 * Recommended indexes for Employee schema
 */
export const employeeIndexes = [
  { fields: { organizationId: 1, employeeId: 1 }, options: { unique: true } },
  { fields: { userId: 1, organizationId: 1 }, options: { unique: true } },
  { fields: { organizationId: 1, status: 1 } },
  { fields: { organizationId: 1, department: 1 } },
  { fields: { organizationId: 1, 'compensation.netSalary': -1 } },
];

/**
 * Recommended indexes for PayrollRecord schema
 */
export const payrollRecordIndexes = [
  {
    fields: { organizationId: 1, employeeId: 1, 'period.month': 1, 'period.year': 1 },
    options: { unique: true },
  },
  { fields: { organizationId: 1, 'period.year': 1, 'period.month': 1 } },
  { fields: { employeeId: 1, 'period.year': -1, 'period.month': -1 } },
  { fields: { status: 1, createdAt: -1 } },
  { fields: { organizationId: 1, status: 1, 'period.payDate': 1 } },
  {
    fields: { createdAt: 1 },
    options: {
      expireAfterSeconds: HRM_CONFIG.dataRetention.payrollRecordsTTL,
      partialFilterExpression: { exported: true },
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
 * Create a complete Employee schema with all HRM fields
 */
export function createEmployeeSchema(
  additionalFields: SchemaDefinition = {}
): Schema {
  const schema = new Schema(
    {
      ...employmentFields,
      ...additionalFields,
    },
    { timestamps: true }
  );

  applyEmployeeIndexes(schema);
  return schema;
}

/**
 * Create a complete PayrollRecord schema
 */
export function createPayrollRecordSchema(
  additionalFields: SchemaDefinition = {}
): Schema {
  const schema = new Schema(
    {
      ...payrollRecordFields,
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
    transactionId: mongoose.Types.ObjectId,
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
  // Fields
  employmentFields,
  payrollRecordFields,
  // Indexes
  employeeIndexes,
  payrollRecordIndexes,
  applyEmployeeIndexes,
  applyPayrollRecordIndexes,
  // Schema creators
  createEmployeeSchema,
  createPayrollRecordSchema,
};


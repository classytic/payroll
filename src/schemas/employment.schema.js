import mongoose from 'mongoose';
import {
  EMPLOYMENT_TYPE_VALUES,
  EMPLOYEE_STATUS_VALUES,
  DEPARTMENT_VALUES,
  PAYMENT_FREQUENCY_VALUES,
  ALLOWANCE_TYPE_VALUES,
  DEDUCTION_TYPE_VALUES,
  TERMINATION_REASON_VALUES,
} from '../enums.js';

const { Schema } = mongoose;

const allowanceSchema = new Schema({
  type: { type: String, enum: ALLOWANCE_TYPE_VALUES, required: true },
  amount: { type: Number, required: true, min: 0 },
  taxable: { type: Boolean, default: true },
  recurring: { type: Boolean, default: true },
  effectiveFrom: { type: Date, default: () => new Date() },
  effectiveTo: { type: Date },
}, { _id: false });

const deductionSchema = new Schema({
  type: { type: String, enum: DEDUCTION_TYPE_VALUES, required: true },
  amount: { type: Number, required: true, min: 0 },
  auto: { type: Boolean, default: false },
  recurring: { type: Boolean, default: true },
  effectiveFrom: { type: Date, default: () => new Date() },
  effectiveTo: { type: Date },
  description: { type: String },
}, { _id: false });

const compensationSchema = new Schema({
  baseAmount: { type: Number, required: true, min: 0 },
  frequency: { type: String, enum: PAYMENT_FREQUENCY_VALUES, default: 'monthly' },
  currency: { type: String, default: 'BDT' },

  allowances: [allowanceSchema],
  deductions: [deductionSchema],

  grossSalary: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },

  effectiveFrom: { type: Date, default: () => new Date() },
  lastModified: { type: Date, default: () => new Date() },
}, { _id: false });

const workScheduleSchema = new Schema({
  hoursPerWeek: { type: Number, min: 0, max: 168 },
  hoursPerDay: { type: Number, min: 0, max: 24 },  // 🆕 Standard hours per day (e.g., 8 for full-time, 4 for part-time)
  workingDays: [{ type: Number, min: 0, max: 6 }],  // Array of days (0=Sunday, 6=Saturday)
  shiftStart: { type: String },  // e.g., "09:00"
  shiftEnd: { type: String },    // e.g., "17:00"
}, { _id: false });

const bankDetailsSchema = new Schema({
  accountName: { type: String },
  accountNumber: { type: String },
  bankName: { type: String },
  branchName: { type: String },
  routingNumber: { type: String },
}, { _id: false });

const employmentHistorySchema = new Schema({
  hireDate: { type: Date, required: true },
  terminationDate: { type: Date, required: true },
  reason: { type: String, enum: TERMINATION_REASON_VALUES },
  finalSalary: { type: Number },
  position: { type: String },
  department: { type: String },
  notes: { type: String },
}, { timestamps: true });

const payrollStatsSchema = new Schema({
  totalPaid: { type: Number, default: 0, min: 0 },
  lastPaymentDate: { type: Date },
  nextPaymentDate: { type: Date },
  paymentsThisYear: { type: Number, default: 0, min: 0 },
  averageMonthly: { type: Number, default: 0, min: 0 },
  updatedAt: { type: Date, default: () => new Date() },
}, { _id: false });

export const employmentFields = {
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

  employeeId: { type: String, required: true },

  employmentType: {
    type: String,
    enum: EMPLOYMENT_TYPE_VALUES,
    default: 'full_time'
  },

  status: {
    type: String,
    enum: EMPLOYEE_STATUS_VALUES,
    default: 'active'
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

export {
  allowanceSchema,
  deductionSchema,
  compensationSchema,
  workScheduleSchema,
  bankDetailsSchema,
  employmentHistorySchema,
  payrollStatsSchema,
};

export default employmentFields;

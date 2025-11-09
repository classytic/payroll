import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import aggregatePaginate from 'mongoose-aggregate-paginate-v2';
import { PAYROLL_STATUS_VALUES } from '../enums.js';
import { HRM_CONFIG } from '../config.js';

const { Schema } = mongoose;

const payrollBreakdownSchema = new Schema({
  baseAmount: { type: Number, required: true, min: 0 },

  allowances: [{
    type: String,
    amount: { type: Number, min: 0 },
    taxable: { type: Boolean, default: true },
  }],

  deductions: [{
    type: String,
    amount: { type: Number, min: 0 },
    description: String,
  }],

  grossSalary: { type: Number, required: true, min: 0 },
  netSalary: { type: Number, required: true, min: 0 },

  workingDays: { type: Number, min: 0 },
  actualDays: { type: Number, min: 0 },
  proRatedAmount: { type: Number, default: 0, min: 0 },
  attendanceDeduction: { type: Number, default: 0, min: 0 },
  overtimeAmount: { type: Number, default: 0, min: 0 },
  bonusAmount: { type: Number, default: 0, min: 0 },
}, { _id: false });

const periodSchema = new Schema({
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true, min: 2020 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  payDate: { type: Date, required: true },
}, { _id: false });

const payrollRecordSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },

  period: { type: periodSchema, required: true },

  breakdown: { type: payrollBreakdownSchema, required: true },

  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },

  status: {
    type: String,
    enum: PAYROLL_STATUS_VALUES,
    default: 'pending',
    index: true
  },

  paidAt: { type: Date },
  paymentMethod: { type: String },

  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  payslipUrl: { type: String },

  exported: { type: Boolean, default: false },
  exportedAt: { type: Date },
}, {
  timestamps: true,
  roleBasedSelect: {
    user: '-notes -processedBy',
    admin: '',
    superadmin: '',
  }
});

payrollRecordSchema.index({ organizationId: 1, employeeId: 1, 'period.month': 1, 'period.year': 1 }, { unique: true });
payrollRecordSchema.index({ organizationId: 1, 'period.year': 1, 'period.month': 1 });
payrollRecordSchema.index({ employeeId: 1, 'period.year': -1, 'period.month': -1 });
payrollRecordSchema.index({ status: 1, createdAt: -1 });
payrollRecordSchema.index({ organizationId: 1, status: 1, 'period.payDate': 1 });

payrollRecordSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: HRM_CONFIG.dataRetention.payrollRecordsTTL,
    partialFilterExpression: { exported: true }
  }
);

payrollRecordSchema.virtual('totalAmount').get(function() {
  return this.breakdown?.netSalary || 0;
});

payrollRecordSchema.virtual('isPaid').get(function() {
  return this.status === 'paid';
});

payrollRecordSchema.virtual('periodLabel').get(function() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[this.period.month - 1]} ${this.period.year}`;
});

payrollRecordSchema.methods.markAsPaid = function(transactionId, paidAt = new Date()) {
  this.status = 'paid';
  this.transactionId = transactionId;
  this.paidAt = paidAt;
};

payrollRecordSchema.methods.markAsExported = function() {
  this.exported = true;
  this.exportedAt = new Date();
};

payrollRecordSchema.methods.canBeDeleted = function() {
  return this.exported && this.status === 'paid';
};

payrollRecordSchema.plugin(mongoosePaginate);
payrollRecordSchema.plugin(aggregatePaginate);

const PayrollRecord = mongoose.models.PayrollRecord || mongoose.model('PayrollRecord', payrollRecordSchema);

export default PayrollRecord;

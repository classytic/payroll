/**
 * Edge Case Tests: Payroll Lifecycle (void, reversal, regeneration)
 *
 * Comprehensive tests for HRM best practices:
 * - Transaction and tax data integrity on each action
 * - Proper audit trail maintenance
 * - Amount validation and reconciliation
 * - Multi-tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  employeePlugin,
  PAYROLL_STATUS,
} from '../../src/index.js';
import { disableLogging } from '../../src/utils/logger.js';

// ============================================================================
// Test Setup
// ============================================================================

let mongoServer: MongoMemoryServer;
let Employee: Model<any>;
let PayrollRecord: Model<any>;
let Transaction: Model<any>;
let TaxWithholding: Model<any>;

const orgId = new mongoose.Types.ObjectId();

// Transaction schema for testing
const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true },
  net: { type: Number },
  tax: { type: Number },
  currency: { type: String, default: 'USD' },
  type: { type: String, required: true },
  flow: { type: String },
  status: { type: String, default: 'pending' },
  description: { type: String },
  date: { type: Date, default: Date.now },
  tags: [String],
  method: { type: String },
  employeeId: Schema.Types.ObjectId,
  customerId: Schema.Types.ObjectId,
  sourceId: Schema.Types.ObjectId,
  sourceModel: String,
  relatedTransactionId: Schema.Types.ObjectId,
  notes: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Tax withholding schema for testing
const taxWithholdingSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  employeeId: { type: Schema.Types.ObjectId, required: true },
  payrollRecordId: { type: Schema.Types.ObjectId, required: true },
  transactionId: { type: Schema.Types.ObjectId },
  period: {
    month: Number,
    year: Number,
    startDate: Date,
    endDate: Date,
  },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  taxType: { type: String, required: true },
  taxRate: { type: Number },
  taxableAmount: { type: Number },
  status: { type: String, default: 'pending' },
  voidedAt: Date,
  voidedBy: Schema.Types.ObjectId,
  voidReason: String,
  notes: String,
}, { timestamps: true });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  disableLogging();

  // Mock session for non-replica set
  const mockSession = {
    startTransaction: () => { throw new Error('Transaction numbers are only allowed on a replica set member'); },
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: () => {},
    inTransaction: () => false,
  };
  mongoose.startSession = (async () => mockSession) as any;

  // Create models
  const employeeSchema = createEmployeeSchema();
  employeeSchema.plugin(employeePlugin);
  Employee = mongoose.model('Employee', employeeSchema);
  PayrollRecord = mongoose.model('PayrollRecord', createPayrollRecordSchema());
  Transaction = mongoose.model('Transaction', transactionSchema);
  TaxWithholding = mongoose.model('TaxWithholding', taxWithholdingSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Employee.deleteMany({});
  await PayrollRecord.deleteMany({});
  await Transaction.deleteMany({});
  await TaxWithholding.deleteMany({});
});

// ============================================================================
// Helper Functions
// ============================================================================

async function createEmployee(overrides = {}) {
  const payroll = createPayrollInstance()
    .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
    .forSingleTenant({ organizationId: orgId, autoInject: true })
    .build();

  return payroll.hire({
    employment: {
      employeeId: `EMP-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      ...overrides,
    },
    compensation: {
      baseAmount: 10000,
      currency: 'USD',
      frequency: 'monthly',
    },
  });
}

// ============================================================================
// Edge Case Tests: Reversal Validation
// ============================================================================

describe('Reversal Amount Validation', () => {
  it('should reject reversal when breakdown is missing', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 1,
      year: 2024,
    });

    // Manually remove breakdown (simulating data corruption)
    await PayrollRecord.updateOne(
      { _id: result.payrollRecord._id },
      { $unset: { breakdown: '' } }
    );

    // Attempt reversal should fail
    await expect(payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Testing missing breakdown',
    })).rejects.toThrow(/breakdown/i);
  });

  it('should reject reversal when amounts are zero or negative', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 2,
      year: 2024,
    });

    // Manually set amounts to 0 (simulating data corruption)
    await PayrollRecord.updateOne(
      { _id: result.payrollRecord._id },
      { $set: { 'breakdown.grossSalary': 0, 'breakdown.netSalary': 0 } }
    );

    // Attempt reversal should fail
    await expect(payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Testing zero amounts',
    })).rejects.toThrow(/invalid amounts/i);
  });

  it('should create reversal transaction with correct amounts', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    const originalGross = result.payrollRecord.breakdown.grossSalary;
    const originalNet = result.payrollRecord.breakdown.netSalary;
    const originalTax = result.payrollRecord.breakdown.taxAmount || 0;

    // Reverse
    const reversalResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Testing reversal amounts',
    });

    // Verify reversal transaction amounts match original
    expect(reversalResult.reversalTransaction).toBeDefined();
    expect(reversalResult.reversalTransaction!.amount).toBe(originalGross);
    expect(reversalResult.reversalTransaction!.net).toBe(originalNet);
    expect(reversalResult.reversalTransaction!.tax).toBe(originalTax);
    expect(reversalResult.reversalTransaction!.flow).toBe('inflow');
    expect(reversalResult.reversalTransaction!.type).toBe('salary_reversal');
  });

  it('should preserve audit trail in reversal metadata', async () => {
    const employee = await createEmployee();
    const userId = new mongoose.Types.ObjectId();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
    });

    // Reverse with context
    const reversalResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Duplicate payment detected',
      context: { userId },
    });

    // Verify reversal transaction metadata
    const reversalTx = reversalResult.reversalTransaction!;
    expect(reversalTx.metadata.originalPayrollId.toString()).toBe(result.payrollRecord._id.toString());
    expect(reversalTx.metadata.originalTransactionId.toString()).toBe(result.transaction._id.toString());
    expect(reversalTx.metadata.reversalReason).toBe('Duplicate payment detected');
    expect(reversalTx.metadata.reversedBy.toString()).toBe(userId.toString());
    expect(reversalTx.metadata.period.month).toBe(result.payrollRecord.period.month);
    expect(reversalTx.metadata.period.year).toBe(result.payrollRecord.period.year);

    // Verify payroll record audit fields
    const reversedPayroll = await PayrollRecord.findById(result.payrollRecord._id);
    expect(reversedPayroll.status).toBe('reversed');
    expect(reversedPayroll.reversedAt).toBeInstanceOf(Date);
    expect(reversedPayroll.reversedBy.toString()).toBe(userId.toString());
    expect(reversedPayroll.reversalReason).toBe('Duplicate payment detected');
    expect(reversedPayroll.reversalTransactionId.toString()).toBe(reversalTx._id.toString());
    expect(reversedPayroll.notes).toContain('[REVERSED]');
  });

  it('should update original transaction metadata on reversal', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 5,
      year: 2024,
    });

    // Reverse
    const reversalResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Correction needed',
    });

    // Verify original transaction was updated
    const originalTx = await Transaction.findById(result.transaction._id);
    expect(originalTx.metadata.reversed).toBe(true);
    expect(originalTx.metadata.reversedAt).toBeInstanceOf(Date);
    expect(originalTx.metadata.reversalTransactionId.toString()).toBe(reversalResult.reversalTransaction!._id.toString());
    expect(originalTx.metadata.reversalReason).toBe('Correction needed');
  });
});

// ============================================================================
// Edge Case Tests: Re-processing After Reversal
// ============================================================================

describe('Re-processing After Reversal (Regeneration)', () => {
  it('should create new payroll record with different ID after reversal', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process initial salary
    const initialResult = await payroll.processSalary({
      employeeId: employee._id,
      month: 6,
      year: 2024,
    });

    // Reverse
    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: initialResult.payrollRecord._id,
      reason: 'Wrong calculation',
    });

    // Re-process (regenerate)
    const newResult = await payroll.processSalary({
      employeeId: employee._id,
      month: 6,
      year: 2024,
    });

    // Verify new record was created
    expect(newResult.payrollRecord._id.toString()).not.toBe(initialResult.payrollRecord._id.toString());
    expect(newResult.transaction._id.toString()).not.toBe(initialResult.transaction._id.toString());
    expect(newResult.payrollRecord.status).toBe('paid');

    // Verify both records exist
    const allRecords = await PayrollRecord.find({
      employeeId: employee._id,
      'period.month': 6,
      'period.year': 2024,
    });
    expect(allRecords).toHaveLength(2);

    const statuses = allRecords.map(r => r.status).sort();
    expect(statuses).toEqual(['paid', 'reversed']);
  });

  it('should create new transaction with fresh data on regeneration', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process initial salary
    const initialResult = await payroll.processSalary({
      employeeId: employee._id,
      month: 7,
      year: 2024,
    });

    // Reverse
    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: initialResult.payrollRecord._id,
      reason: 'Wrong amount',
    });

    // Update employee salary before re-processing
    await Employee.updateOne(
      { _id: employee._id },
      { $set: { 'compensation.baseAmount': 12000 } }
    );

    // Re-process with new salary
    const newResult = await payroll.processSalary({
      employeeId: employee._id,
      month: 7,
      year: 2024,
    });

    // Verify new transaction has updated amount
    expect(newResult.payrollRecord.breakdown.baseAmount).toBe(12000);
    expect(newResult.payrollRecord.breakdown.grossSalary).toBe(12000);
    expect(newResult.transaction.amount).toBe(12000);
  });

  it('should maintain complete audit trail across reversal and regeneration', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process initial salary
    const initialResult = await payroll.processSalary({
      employeeId: employee._id,
      month: 8,
      year: 2024,
    });

    // Reverse
    const reversalResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: initialResult.payrollRecord._id,
      reason: 'Calculation error',
    });

    // Re-process
    const newResult = await payroll.processSalary({
      employeeId: employee._id,
      month: 8,
      year: 2024,
    });

    // Verify full audit trail
    const allTransactions = await Transaction.find({
      organizationId: orgId,
      employeeId: employee._id,
    }).sort({ createdAt: 1 });

    expect(allTransactions).toHaveLength(3);

    // 1st: Original payment (outflow)
    expect(allTransactions[0].type).toBe('salary');
    expect(allTransactions[0].flow).toBe('outflow');
    expect(allTransactions[0].metadata.reversed).toBe(true);

    // 2nd: Reversal (inflow)
    expect(allTransactions[1].type).toBe('salary_reversal');
    expect(allTransactions[1].flow).toBe('inflow');
    expect(allTransactions[1].metadata.originalPayrollId.toString()).toBe(initialResult.payrollRecord._id.toString());

    // 3rd: New payment (outflow)
    expect(allTransactions[2].type).toBe('salary');
    expect(allTransactions[2].flow).toBe('outflow');
  });
});

// ============================================================================
// Edge Case Tests: Void Operation
// ============================================================================

describe('Void Operation Data Integrity', () => {
  it('should void payroll and mark transaction as cancelled', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 9,
      year: 2024,
    });

    // Set to pending first (void requires voidable status)
    await PayrollRecord.updateOne(
      { _id: result.payrollRecord._id },
      { $set: { status: 'pending' } }
    );

    // Void
    const voidResult = await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Test payroll - not for production',
    });

    // Verify payroll record
    expect(voidResult.payrollRecord.status).toBe('voided');
    expect(voidResult.payrollRecord.isVoided).toBe(true);
    expect(voidResult.payrollRecord.voidReason).toBe('Test payroll - not for production');
    expect(voidResult.payrollRecord.notes).toContain('[VOIDED]');

    // Verify transaction was cancelled
    expect(voidResult.transactionVoided).toBe(true);
    const tx = await Transaction.findById(result.transaction._id);
    expect(tx.status).toBe('cancelled');
    expect(tx.notes).toContain('Voided');
  });

  it('should NOT allow re-processing voided payroll', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 10,
      year: 2024,
    });

    // Set to pending and void
    await PayrollRecord.updateOne(
      { _id: result.payrollRecord._id },
      { $set: { status: 'pending' } }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Intentionally cancelled',
    });

    // Attempt to re-process should fail
    await expect(payroll.processSalary({
      employeeId: employee._id,
      month: 10,
      year: 2024,
    })).rejects.toThrow(/voided payroll.*restorePayroll/i);
  });
});

// ============================================================================
// Edge Case Tests: Concurrent Operations
// ============================================================================

describe('Concurrent Processing Safety', () => {
  it('should use idempotency cache for same payroll instance', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Sequential calls to same instance use idempotency cache
    const result1 = await payroll.processSalary({
      employeeId: employee._id,
      month: 11,
      year: 2024,
    });

    const result2 = await payroll.processSalary({
      employeeId: employee._id,
      month: 11,
      year: 2024,
    });

    // Same payroll record returned (cached)
    expect(result1.payrollRecord._id.toString()).toBe(result2.payrollRecord._id.toString());

    // Only one record exists
    const records = await PayrollRecord.find({
      employeeId: employee._id,
      'period.month': 11,
      'period.year': 2024,
    });
    expect(records.length).toBe(1);
  });
});

// ============================================================================
// Edge Case Tests: Multi-Tenant Isolation
// ============================================================================

describe('Multi-Tenant Isolation on State Changes', () => {
  it('should reject void from different organization', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 12,
      year: 2024,
    });

    // Set to pending for void
    await PayrollRecord.updateOne(
      { _id: result.payrollRecord._id },
      { $set: { status: 'pending' } }
    );

    // Attempt void with different org
    const differentOrgId = new mongoose.Types.ObjectId();
    await expect(payroll.voidPayroll({
      organizationId: differentOrgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Cross-tenant attack',
    })).rejects.toThrow(/not found/i);
  });

  it('should reject reversal from different organization', async () => {
    const employee = await createEmployee();
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Process salary
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 1,
      year: 2025,
    });

    // Attempt reversal with different org
    const differentOrgId = new mongoose.Types.ObjectId();
    await expect(payroll.reversePayroll({
      organizationId: differentOrgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Cross-tenant attack',
    })).rejects.toThrow(/not found/i);
  });
});

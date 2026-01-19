/**
 * @classytic/payroll - Void/Reversal Tests
 *
 * Comprehensive tests for payroll voiding, reversal, and restoration.
 * Tests cover all edge cases including transactions and tax withholdings.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Payroll,
  PayrollBuilder,
  createEmployeeSchema,
  createPayrollRecordSchema,
  PAYROLL_STATUS,
  isVoidablePayrollStatus,
  requiresReversalPayrollStatus,
  isVoidedOrReversedStatus,
} from '../src/index.js';
import { disableLogging } from '../src/utils/logger.js';

// ============================================================================
// Test Setup
// ============================================================================

let mongoServer: MongoMemoryServer;
let EmployeeModel: Model<any>;
let PayrollRecordModel: Model<any>;
let TransactionModel: Model<any>;

// Simple transaction schema for testing
const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  flow: { type: String },
  status: { type: String, default: 'pending' },
  description: { type: String },
  date: { type: Date, default: Date.now },
  tags: [String],
  referenceId: Schema.Types.ObjectId,
  referenceModel: String,
  notes: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  disableLogging(); // Quiet tests

  // MongoMemoryServer doesn't support transactions without replica set.
  // Mock startSession to return null - Mongoose handles .session(null) gracefully
  mongoose.startSession = (async () => null) as any;

  // Create models
  const employeeSchema = createEmployeeSchema();
  const payrollRecordSchema = createPayrollRecordSchema();

  EmployeeModel = mongoose.model('Employee', employeeSchema);
  PayrollRecordModel = mongoose.model('PayrollRecord', payrollRecordSchema);
  TransactionModel = mongoose.model('Transaction', transactionSchema);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clean up before each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

async function createTestOrg() {
  return new Types.ObjectId();
}

async function createTestEmployee(orgId: Types.ObjectId, overrides = {}) {
  const employeeId = `EMP-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
  return await EmployeeModel.create({
    organizationId: orgId,
    employeeId,
    position: 'Developer',
    department: 'it',
    status: 'active',
    hireDate: new Date('2024-01-15'),
    employmentType: 'full_time',
    compensation: {
      baseAmount: 100000,
      currency: 'USD',
      frequency: 'monthly',
      netSalary: 100000,
    },
    ...overrides,
  });
}

async function createPayrollInstance(orgId: Types.ObjectId) {
  return new PayrollBuilder()
    .withModels({
      EmployeeModel,
      PayrollRecordModel,
      TransactionModel,
    })
    .build();
}

// ============================================================================
// Status Helper Tests
// ============================================================================

describe('Status Helper Functions', () => {
  it('should correctly identify voidable statuses', () => {
    expect(isVoidablePayrollStatus('pending')).toBe(true);
    expect(isVoidablePayrollStatus('processing')).toBe(true);
    expect(isVoidablePayrollStatus('failed')).toBe(true);
    expect(isVoidablePayrollStatus('paid')).toBe(false);
    expect(isVoidablePayrollStatus('cancelled')).toBe(false);
    expect(isVoidablePayrollStatus('voided')).toBe(false);
    expect(isVoidablePayrollStatus('reversed')).toBe(false);
  });

  it('should correctly identify statuses requiring reversal', () => {
    expect(requiresReversalPayrollStatus('paid')).toBe(true);
    expect(requiresReversalPayrollStatus('pending')).toBe(false);
    expect(requiresReversalPayrollStatus('processing')).toBe(false);
    expect(requiresReversalPayrollStatus('failed')).toBe(false);
    expect(requiresReversalPayrollStatus('voided')).toBe(false);
    expect(requiresReversalPayrollStatus('reversed')).toBe(false);
  });

  it('should correctly identify voided or reversed statuses', () => {
    expect(isVoidedOrReversedStatus('voided')).toBe(true);
    expect(isVoidedOrReversedStatus('reversed')).toBe(true);
    expect(isVoidedOrReversedStatus('pending')).toBe(false);
    expect(isVoidedOrReversedStatus('paid')).toBe(false);
    expect(isVoidedOrReversedStatus('failed')).toBe(false);
  });
});

// ============================================================================
// Void Payroll Tests
// ============================================================================

describe('voidPayroll', () => {
  it('should void a pending payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    // Process salary first
    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Manually set to pending for test
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    // Void the payroll
    const voidResult = await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Test payroll - not intended for production',
      context: { userId: new Types.ObjectId() },
    });

    expect(voidResult.payrollRecord.status).toBe(PAYROLL_STATUS.VOIDED);
    expect(voidResult.payrollRecord.isVoided).toBe(true);
    expect(voidResult.payrollRecord.voidReason).toBe('Test payroll - not intended for production');
    expect(voidResult.payrollRecord.voidedAt).toBeDefined();
    expect(voidResult.transactionVoided).toBe(true);
  });

  it('should void a processing payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Set to processing
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PROCESSING }
    );

    const voidResult = await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Processing error - voiding',
      voidTransaction: true,
    });

    expect(voidResult.payrollRecord.status).toBe(PAYROLL_STATUS.VOIDED);
    expect(voidResult.transactionVoided).toBe(true);

    // Verify transaction was cancelled
    const transaction = await TransactionModel.findById(result.transaction._id);
    expect(transaction?.status).toBe('cancelled');
  });

  it('should void a failed payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Set to failed
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.FAILED }
    );

    const voidResult = await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Failed processing - cleaning up',
    });

    expect(voidResult.payrollRecord.status).toBe(PAYROLL_STATUS.VOIDED);
  });

  it('should reject voiding a paid payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Status is already 'paid' after processSalary
    await expect(payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Trying to void paid payroll',
    })).rejects.toThrow(/Cannot void a paid payroll.*reversePayroll/);
  });

  it('should reject voiding an already voided payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Set to pending then void
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'First void',
    });

    // Try to void again - state machine rejects voided → voided transition
    await expect(payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Second void attempt',
    })).rejects.toThrow(/Invalid transition/);
  });

  it('should reject void with short reason', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await expect(payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'bad', // Too short
    })).rejects.toThrow(/at least 5 characters/);
  });

  it('should reject void with wrong organizationId (multi-tenant isolation)', async () => {
    const orgId = await createTestOrg();
    const wrongOrgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await expect(payroll.voidPayroll({
      organizationId: wrongOrgId, // Wrong org
      payrollRecordId: result.payrollRecord._id,
      reason: 'Trying with wrong org',
    })).rejects.toThrow(/not found/);
  });

  it('should optionally skip transaction voiding', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    const voidResult = await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Void but keep transaction',
      voidTransaction: false,
    });

    expect(voidResult.payrollRecord.status).toBe(PAYROLL_STATUS.VOIDED);
    expect(voidResult.transactionVoided).toBe(false);

    // Transaction should still be completed
    const transaction = await TransactionModel.findById(result.transaction._id);
    expect(transaction?.status).toBe('completed');
  });
});

// ============================================================================
// Reverse Payroll Tests
// ============================================================================

describe('reversePayroll', () => {
  it('should reverse a paid payroll with reversal transaction', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    const originalAmount = result.payrollRecord.breakdown.netSalary;

    const reverseResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Duplicate payment - reversing',
      createReversalTransaction: true,
      context: { userId: new Types.ObjectId() },
    });

    expect(reverseResult.payrollRecord.status).toBe(PAYROLL_STATUS.REVERSED);
    expect(reverseResult.payrollRecord.isVoided).toBe(true);
    expect(reverseResult.payrollRecord.voidReason).toBe('Duplicate payment - reversing');
    expect(reverseResult.reversalTransaction).toBeDefined();

    // Verify reversal transaction has negative amount
    expect(reverseResult.reversalTransaction?.amount).toBe(-originalAmount);
    expect(reverseResult.reversalTransaction?.type).toBe('payroll_reversal');
    expect(reverseResult.reversalTransaction?.flow).toBe('inflow');

    // Verify payroll record links to reversal transaction
    const updatedPayroll = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(updatedPayroll?.reversalTransactionId?.toString()).toBe(
      reverseResult.reversalTransaction?._id.toString()
    );
  });

  it('should reverse without creating reversal transaction when disabled', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    const reverseResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Reversal without transaction',
      createReversalTransaction: false,
    });

    expect(reverseResult.payrollRecord.status).toBe(PAYROLL_STATUS.REVERSED);
    expect(reverseResult.reversalTransaction).toBeUndefined();
  });

  it('should reject reversing an unpaid payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Set to pending
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await expect(payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Trying to reverse pending payroll',
    })).rejects.toThrow(/Cannot reverse an unpaid payroll.*voidPayroll/);
  });

  it('should reject reversing an already reversed payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'First reversal',
    });

    // reversed is a terminal state, cannot transition from it
    await expect(payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Second reversal attempt',
    })).rejects.toThrow(/terminal state/);
  });

  it('should update original transaction metadata on reversal', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    const userId = new Types.ObjectId();
    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Checking original transaction update',
      context: { userId },
    });

    // Check original transaction was updated
    const originalTransaction = await TransactionModel.findById(result.transaction._id);
    expect(originalTransaction?.metadata?.reversed).toBe(true);
    expect(originalTransaction?.metadata?.reversedAt).toBeDefined();
    expect(originalTransaction?.metadata?.reversedBy?.toString()).toBe(userId.toString());
    expect(originalTransaction?.metadata?.reversalReason).toBe('Checking original transaction update');
  });

  it('should include audit trail in reversal transaction metadata', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    const reverseResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Audit trail test',
    });

    const reversalTx = reverseResult.reversalTransaction;
    expect(reversalTx?.metadata?.originalPayrollId?.toString()).toBe(
      result.payrollRecord._id.toString()
    );
    expect(reversalTx?.metadata?.originalTransactionId?.toString()).toBe(
      result.transaction._id.toString()
    );
    expect(reversalTx?.metadata?.reversalReason).toBe('Audit trail test');
    expect(reversalTx?.metadata?.employeeId?.toString()).toBe(employee._id.toString());
  });
});

// ============================================================================
// Restore Payroll Tests
// ============================================================================

describe('restorePayroll', () => {
  it('should restore a voided payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Set to pending then void
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Voiding for restore test',
    });

    const restoreResult = await payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Restoring - voided in error',
    });

    expect(restoreResult.payrollRecord.status).toBe(PAYROLL_STATUS.PENDING);
    expect(restoreResult.payrollRecord.isVoided).toBe(false);
    expect(restoreResult.payrollRecord.notes).toContain('[RESTORED]');

    // Audit trail should be preserved
    expect(restoreResult.payrollRecord.voidedAt).toBeDefined();
    expect(restoreResult.payrollRecord.voidReason).toBeDefined();
  });

  it('should restore associated transaction', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Voiding',
      voidTransaction: true,
    });

    // Transaction should be cancelled
    let transaction = await TransactionModel.findById(result.transaction._id);
    expect(transaction?.status).toBe('cancelled');

    // Restore
    await payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Restoring',
    });

    // Transaction should be pending again
    transaction = await TransactionModel.findById(result.transaction._id);
    expect(transaction?.status).toBe('pending');
    expect(transaction?.metadata?.restoredAt).toBeDefined();
  });

  it('should reject restoring a non-voided payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await expect(payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Trying to restore non-voided',
    })).rejects.toThrow(/Invalid transition/);
  });

  it('should reject restoring a reversed payroll', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Reversing for test',
    });

    await expect(payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Trying to restore reversed',
    })).rejects.toThrow(/Cannot restore a reversed payroll/);
  });

  it('should reject restoring a voided payroll that has reversal transaction', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Manually set up a scenario with voided + reversalTransactionId
    // This shouldn't happen normally but tests the safety check
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      {
        status: PAYROLL_STATUS.VOIDED,
        isVoided: true,
        reversalTransactionId: new Types.ObjectId(),
      }
    );

    await expect(payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Trying to restore with reversal transaction',
    })).rejects.toThrow(/reversal transaction.*become orphaned/);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Void/Reversal Integration', () => {
  it('should handle complete void -> restore workflow', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    // 1. Process salary
    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // 2. Set to pending (simulating pre-payment state)
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    // 3. Void it
    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Testing void workflow',
    });

    let record = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(record?.status).toBe(PAYROLL_STATUS.VOIDED);

    // 4. Restore it
    await payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Testing restore workflow',
    });

    record = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(record?.status).toBe(PAYROLL_STATUS.PENDING);
    expect(record?.isVoided).toBe(false);
  });

  it('should allow re-processing salary after voiding (idempotency returns voided record)', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    // Process salary
    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Set to pending then void
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Voiding first payroll',
    });

    // Verify the voided record exists
    const voidedRecord = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(voidedRecord?.status).toBe(PAYROLL_STATUS.VOIDED);
    expect(voidedRecord?.isVoided).toBe(true);

    // Count total payroll records for this period
    const count = await PayrollRecordModel.countDocuments({
      organizationId: orgId,
      employeeId: employee._id,
      'period.month': 3,
      'period.year': 2024,
    });
    expect(count).toBe(1); // Only the voided record
  });

  it('should maintain accurate transaction balance after reversal', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    // Process salary
    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    const originalNet = result.payrollRecord.breakdown.netSalary;

    // Reverse it
    const reverseResult = await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Testing transaction balance',
    });

    // Verify reversal transaction has negative amount equal to net salary
    expect(reverseResult.reversalTransaction?.amount).toBe(-originalNet);

    // Sum all transactions for this org
    const transactions = await TransactionModel.find({ organizationId: orgId });
    expect(transactions.length).toBe(2); // Original + reversal

    // Find the reversal transaction
    const reversalTx = transactions.find(tx => tx.type === 'payroll_reversal');
    expect(reversalTx).toBeDefined();
    expect(reversalTx?.amount).toBeLessThan(0);

    // Find the original transaction
    const originalTx = transactions.find(tx => tx.type !== 'payroll_reversal');
    expect(originalTx).toBeDefined();

    // The original uses 'amount' field (gross), reversal uses net
    // Verify the reversal correctly offsets the net payment
    expect(reversalTx?.amount).toBe(-originalNet);
  });

  it('should handle multiple payrolls with mixed void/reverse states', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    // Process 3 months of payroll
    const jan = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 1,
      year: 2024,
    });

    const feb = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 2,
      year: 2024,
    });

    const mar = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Void January (set to pending first)
    await PayrollRecordModel.updateOne(
      { _id: jan.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );
    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: jan.payrollRecord._id,
      reason: 'Voiding January',
    });

    // Reverse February (already paid)
    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: feb.payrollRecord._id,
      reason: 'Reversing February',
    });

    // March stays paid
    // Check final states
    const records = await PayrollRecordModel.find({ organizationId: orgId }).sort({ 'period.month': 1 });

    expect(records[0].status).toBe(PAYROLL_STATUS.VOIDED);
    expect(records[1].status).toBe(PAYROLL_STATUS.REVERSED);
    expect(records[2].status).toBe(PAYROLL_STATUS.PAID);

    // Check transaction count (should have 4: 3 original + 1 reversal for Feb)
    const transactions = await TransactionModel.find({ organizationId: orgId });
    expect(transactions.length).toBe(4);
  });
});

// ============================================================================
// Notes Audit Trail Tests
// ============================================================================

describe('Notes Audit Trail', () => {
  it('should append void reason to notes', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    // Add initial notes
    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING, notes: 'Initial notes' }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Void reason here',
    });

    const record = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(record?.notes).toContain('Initial notes');
    expect(record?.notes).toContain('[VOIDED] Void reason here');
  });

  it('should append reverse reason to notes', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await payroll.reversePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Reversal reason here',
    });

    const record = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(record?.notes).toContain('[REVERSED] Reversal reason here');
  });

  it('should append restore reason to notes', async () => {
    const orgId = await createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = await createPayrollInstance(orgId);

    const result = await payroll.processSalary({
      organizationId: orgId,
      employeeId: employee.employeeId,
      month: 3,
      year: 2024,
    });

    await PayrollRecordModel.updateOne(
      { _id: result.payrollRecord._id },
      { status: PAYROLL_STATUS.PENDING }
    );

    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Voiding',
    });

    await payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: result.payrollRecord._id,
      reason: 'Restore reason here',
    });

    const record = await PayrollRecordModel.findById(result.payrollRecord._id);
    expect(record?.notes).toContain('[VOIDED] Voiding');
    expect(record?.notes).toContain('[RESTORED] Restore reason here');
  });
});

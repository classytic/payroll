/**
 * Idempotency Tests
 * Ensures duplicate operations return cached results
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '../src/index.js';

describe('Idempotency (Stripe-style)', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();
  let employee: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Mock startSession for tests (MongoMemoryServer doesn't support transactions)
    const mockSession = { startTransaction: () => { throw new Error("Transaction numbers are only allowed on a replica set member"); }, commitTransaction: async () => {}, abortTransaction: async () => {}, endSession: () => {}, inTransaction: () => false }; mongoose.startSession = (async () => mockSession) as any;

    // Create User model (referenced by Employee)
    const userSchema = new Schema({ name: String, email: String });
    mongoose.model('User', userSchema);

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('Employee', employeeSchema);
    PayrollRecord = mongoose.model('PayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      net: Number,
      currency: String,
      tax: Number,
      status: String,
      date: Date,
      employeeId: Schema.Types.ObjectId,
      customerId: Schema.Types.ObjectId,
      breakdown: Schema.Types.Mixed,
      sourceId: Schema.Types.ObjectId,
      sourceModel: String,
      description: String,
      metadata: Schema.Types.Mixed,
      idempotencyKey: String, // Stripe-style
      processedAt: Date,
      completedAt: Date,
    });
    Transaction = mongoose.model('Transaction', transactionSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Employee.deleteMany({});
    await PayrollRecord.deleteMany({});
    await Transaction.deleteMany({});

    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .build();

    employee = await payroll.hire({
      userId: user,
      organizationId: org,
      employment: {
        employeeId: 'EMP-001',
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });
  });

  describe('Auto-Generated Idempotency Keys', () => {
    it('should prevent duplicate salary processing with auto-generated key', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Process salary first time
      const result1 = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
      });

      // Process again (duplicate call) - should return cached result
      const result2 = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
      });

      // Should return the SAME result (cached)
      expect(result2.payrollRecord._id.toString()).toBe(result1.payrollRecord._id.toString());
      expect(result2.transaction._id.toString()).toBe(result1.transaction._id.toString());

      // Should NOT create duplicate records in database
      const payrollCount = await PayrollRecord.countDocuments({ employeeId: employee._id });
      const transactionCount = await Transaction.countDocuments({ employeeId: employee._id });

      expect(payrollCount).toBe(1); // Only one payroll record
      expect(transactionCount).toBe(1); // Only one transaction
    });
  });

  describe('Custom Idempotency Keys', () => {
    it('should use custom idempotency key when provided', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      const customKey = 'my-custom-key-12345';

      // Process with custom key
      const result1 = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
        idempotencyKey: customKey,
      });

      // Process again with same custom key
      const result2 = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
        idempotencyKey: customKey,
      });

      // Should return cached result
      expect(result2.payrollRecord._id.toString()).toBe(result1.payrollRecord._id.toString());
    });

    it('should allow different months with different keys', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Process March
      const result1 = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
        idempotencyKey: 'march-salary',
      });

      // Process April (different key)
      const result2 = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 4,
        year: 2024,
        idempotencyKey: 'april-salary',
      });

      // Should be different results
      expect(result2.payrollRecord._id.toString()).not.toBe(result1.payrollRecord._id.toString());

      // Should have 2 payroll records
      const count = await PayrollRecord.countDocuments({ employeeId: employee._id });
      expect(count).toBe(2);
    });
  });

  describe('Idempotency with Retries', () => {
    it('should handle retry after failure (same key returns cached success)', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // First attempt succeeds
      const result = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
        idempotencyKey: 'retry-test',
      });

      // Client retries (network issue, etc.) - should return cached
      const retryResult = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
        idempotencyKey: 'retry-test',
      });

      expect(retryResult.payrollRecord._id.toString()).toBe(result.payrollRecord._id.toString());
    });
  });
});

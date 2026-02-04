/**
 * Tests for multi-run frequency support (weekly, bi-weekly, daily)
 *
 * Validates:
 * 1. Multiple weekly payroll runs in same month don't collide
 * 2. Idempotency keys differentiate by period start date
 * 3. Unique index correctly uses period.startDate
 * 4. CompensationFactory.applyIncrement uses 2-decimal precision
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema } from '../../src/index.js';
import { generatePayrollIdempotencyKey } from '../../src/core/idempotency.js';
import { CompensationFactory } from '../../src/factories/compensation.factory.js';
import { disableLogging } from '../../src/utils/logger.js';

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

describe('Multi-Run Frequency Support', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  let PayrollRecordModel: mongoose.Model<any>;
  let TransactionModel: mongoose.Model<any>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    disableLogging();

    // Mock session for MongoMemoryServer (no replica set)
    const mockSession = {
      startTransaction: () => { throw new Error('No replica set'); },
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    };
    mongoose.startSession = (async () => mockSession) as any;

    const employeeSchema = createEmployeeSchema();
    const payrollRecordSchema = createPayrollRecordSchema();

    EmployeeModel = mongoose.model('EmployeeMultiRun', employeeSchema);
    PayrollRecordModel = mongoose.model('PayrollRecordMultiRun', payrollRecordSchema);
    TransactionModel = mongoose.model('TransactionMultiRun', transactionSchema);
  });

  afterAll(async () => {
    // Disconnect mongoose first to prevent hanging connections
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    // Force stop MongoDB to prevent orphaned processes on crashes
    try {
      if (mongoServer) {
        await mongoServer.stop({ doCleanup: true, force: true });
      }
    } catch (e) {
      // Ignore stop errors - process may already be dead
    }
  });

  beforeEach(async () => {
    await EmployeeModel.deleteMany({});
    await PayrollRecordModel.deleteMany({});
    await TransactionModel.deleteMany({});
  });

  // ============================================================================
  // Idempotency Key Tests
  // ============================================================================
  describe('Idempotency Key Generation', () => {
    it('should generate different keys for different payment dates', () => {
      const orgId = new mongoose.Types.ObjectId();
      const empId = new mongoose.Types.ObjectId();

      const key1 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular', new Date('2024-03-08'));
      const key2 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular', new Date('2024-03-15'));
      const key3 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular', new Date('2024-03-22'));

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);

      // All keys should contain the date
      expect(key1).toContain('2024-03-08');
      expect(key2).toContain('2024-03-15');
      expect(key3).toContain('2024-03-22');
    });

    it('should generate same key for same payment date (idempotent)', () => {
      const orgId = new mongoose.Types.ObjectId();
      const empId = new mongoose.Types.ObjectId();

      const key1 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular', new Date('2024-03-15'));
      const key2 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular', new Date('2024-03-15'));

      expect(key1).toBe(key2);
    });

    it('should handle monthly frequency without period date (backward compat)', () => {
      const orgId = new mongoose.Types.ObjectId();
      const empId = new mongoose.Types.ObjectId();

      // Monthly employees may not pass periodStartDate
      const key = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular');

      expect(key).toBe(`payroll:${orgId}:${empId}:2024-3:regular`);
      expect(key).not.toContain('2024-03-');
    });

    it('should differentiate run types with same date', () => {
      const orgId = new mongoose.Types.ObjectId();
      const empId = new mongoose.Types.ObjectId();
      const date = new Date('2024-03-15');

      const regularKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular', date);
      const supplementalKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'supplemental', date);

      expect(regularKey).not.toBe(supplementalKey);
      expect(regularKey).toContain('regular');
      expect(supplementalKey).toContain('supplemental');
    });
  });

  // ============================================================================
  // Multiple Weekly Runs in Same Month
  // ============================================================================
  describe('Multiple weekly runs in same month', () => {
    it('should allow 4 weekly payroll runs in March without collision', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create weekly employee
      const employee = await payroll.hire({
        employment: {
          email: 'weekly-worker@example.com',
          position: 'Part-time Worker',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 2000, // $2000/week
          currency: 'USD',
          frequency: 'weekly',
        },
      });

      // Process 4 weekly payrolls in March
      // System automatically generates distinct idempotency keys using period.startDate
      const week1 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-08'), // Week 1 end
      });

      const week2 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'), // Week 2 end
      });

      const week3 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-22'), // Week 3 end
      });

      const week4 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-29'), // Week 4 end
      });

      // All should succeed
      expect(week1.payrollRecord).toBeDefined();
      expect(week2.payrollRecord).toBeDefined();
      expect(week3.payrollRecord).toBeDefined();
      expect(week4.payrollRecord).toBeDefined();

      // Verify different period start dates
      expect(week1.payrollRecord.period.startDate.toISOString()).not.toBe(
        week2.payrollRecord.period.startDate.toISOString()
      );

      // Verify 4 distinct records in DB
      const records = await PayrollRecordModel.find({ organizationId: orgId });
      expect(records.length).toBe(4);
    });

    it('should return cached result for same week (idempotent)', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      const employee = await payroll.hire({
        employment: {
          email: 'weekly-dup@example.com',
          position: 'Worker',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 2000,
          currency: 'USD',
          frequency: 'weekly',
        },
      });

      // First run succeeds
      const result1 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Same date should return cached result (idempotent behavior)
      const result2 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Should return same payroll record (cached)
      expect(result2.payrollRecord._id.toString()).toBe(result1.payrollRecord._id.toString());

      // Should only have 1 record in DB (not 2)
      const records = await PayrollRecordModel.find({ organizationId: orgId });
      expect(records.length).toBe(1);
    });
  });

  // ============================================================================
  // Bi-Weekly Runs
  // ============================================================================
  describe('Bi-weekly runs in same month', () => {
    it('should allow 2 bi-weekly payroll runs in March', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      const employee = await payroll.hire({
        employment: {
          email: 'biweekly@example.com',
          position: 'Contractor',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 4000, // $4000/bi-week
          currency: 'USD',
          frequency: 'bi_weekly',
        },
      });

      // System automatically generates distinct idempotency keys using period.startDate
      const period1 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'), // First bi-weekly
      });

      const period2 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-29'), // Second bi-weekly
      });

      expect(period1.payrollRecord).toBeDefined();
      expect(period2.payrollRecord).toBeDefined();

      const records = await PayrollRecordModel.find({ organizationId: orgId });
      expect(records.length).toBe(2);
    });
  });

  // ============================================================================
  // Reverse Idempotency Cache for Non-Monthly
  // ============================================================================
  describe('Reverse idempotency cache for non-monthly frequencies', () => {
    it('should clear idempotency cache when reversing weekly payroll', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      const employee = await payroll.hire({
        employment: {
          email: 'weekly-reverse@example.com',
          position: 'Worker',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 2000,
          currency: 'USD',
          frequency: 'weekly',
        },
      });

      // Process week 1
      const result1 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-08'),
      });

      expect(result1.payrollRecord).toBeDefined();
      expect(result1.payrollRecord.status).toBe('paid');

      // Reverse the paid payroll - this should clear the idempotency cache
      // Note: Use reversePayroll for paid payroll (not voidPayroll)
      await payroll.reversePayroll({
        organizationId: orgId,
        payrollRecordId: result1.payrollRecord._id,
        reason: 'Testing reverse functionality for paid payroll',
      });

      // Verify reversed
      const reversedRecord = await PayrollRecordModel.findById(result1.payrollRecord._id);
      expect(reversedRecord.status).toBe('reversed');
    });

    it('should not return cached result for different weekly periods after reverse', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      const employee = await payroll.hire({
        employment: {
          email: 'weekly-different@example.com',
          position: 'Worker',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 2000,
          currency: 'USD',
          frequency: 'weekly',
        },
      });

      // Process week 1
      const week1 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-08'),
      });

      // Reverse week 1 (since it's paid, use reversePayroll)
      await payroll.reversePayroll({
        organizationId: orgId,
        payrollRecordId: week1.payrollRecord._id,
        reason: 'Reversing week 1 payroll',
      });

      // Process week 2 (different period) - should NOT be affected by week 1's reverse
      const week2 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Week 2 should be a new record, not week 1
      expect(week2.payrollRecord._id.toString()).not.toBe(week1.payrollRecord._id.toString());
      expect(week2.payrollRecord.status).toBe('paid');

      // Verify we have 2 records in DB (one reversed, one paid)
      const records = await PayrollRecordModel.find({ organizationId: orgId });
      expect(records.length).toBe(2);
      expect(records.filter(r => r.status === 'reversed').length).toBe(1);
      expect(records.filter(r => r.status === 'paid').length).toBe(1);
    });

    it('should allow new payroll for same period after reversal (since reversed unblocks unique index)', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      const employee = await payroll.hire({
        employment: {
          email: 'weekly-reprocess@example.com',
          position: 'Worker',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 2000,
          currency: 'USD',
          frequency: 'weekly',
        },
      });

      // Process payroll for week 1
      const result1 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Reverse it (paid payroll requires reversal, not void)
      await payroll.reversePayroll({
        organizationId: orgId,
        payrollRecordId: result1.payrollRecord._id,
        reason: 'Incorrect amount, need to reprocess',
      });

      // Process again for the same period - should work because:
      // 1. Cache was cleared by reversePayroll
      // 2. Unique index allows new record when previous is reversed
      const result2 = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Should be a NEW record (reversed records don't block unique index)
      expect(result2.payrollRecord._id.toString()).not.toBe(result1.payrollRecord._id.toString());
      expect(result2.payrollRecord.status).toBe('paid');

      // Verify we have 2 records (one reversed, one new paid)
      const records = await PayrollRecordModel.find({ organizationId: orgId });
      expect(records.length).toBe(2);
    });
  });

  // ============================================================================
  // CompensationFactory.applyIncrement Rounding
  // ============================================================================
  describe('CompensationFactory.applyIncrement rounding', () => {
    it('should use 2-decimal precision for percentage increment', () => {
      const compensation = CompensationFactory.create({
        baseAmount: 1000.50,
        frequency: 'monthly',
        currency: 'USD',
      });

      // 3% increment: 1000.50 * 1.03 = 1030.515 → 1030.52 (banker's rounding)
      const incremented = CompensationFactory.applyIncrement(compensation, { percentage: 3 });

      expect(incremented.baseAmount).toBe(1030.52);
    });

    it('should use 2-decimal precision for flat amount increment', () => {
      const compensation = CompensationFactory.create({
        baseAmount: 1000.50,
        frequency: 'monthly',
        currency: 'USD',
      });

      // $50.75 increment: 1000.50 + 50.75 = 1051.25
      const incremented = CompensationFactory.applyIncrement(compensation, { amount: 50.75 });

      expect(incremented.baseAmount).toBe(1051.25);
    });

    it('should preserve cents in increment calculations', () => {
      const compensation = CompensationFactory.create({
        baseAmount: 5000,
        frequency: 'monthly',
        currency: 'USD',
      });

      // 2.5% increment: 5000 * 1.025 = 5125.00
      const incremented = CompensationFactory.applyIncrement(compensation, { percentage: 2.5 });

      expect(incremented.baseAmount).toBe(5125);
    });

    it('should handle edge case percentages correctly', () => {
      const compensation = CompensationFactory.create({
        baseAmount: 99999.99,
        frequency: 'monthly',
        currency: 'USD',
      });

      // 0.01% increment: 99999.99 * 1.0001 = 100009.989999... → 100009.99
      const incremented = CompensationFactory.applyIncrement(compensation, { percentage: 0.01 });

      expect(incremented.baseAmount).toBe(100009.99);
    });
  });
});

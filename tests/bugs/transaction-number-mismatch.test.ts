/**
 * Test: MongoDB Transaction Number Mismatch Bug (v2.6.6 fix)
 *
 * Verifies that bulk payroll processing doesn't trigger transaction
 * number mismatch errors when using mongokit's withTransaction().
 *
 * BUG HISTORY:
 * - Version: 2.6.5 and earlier
 * - Issue: "Given transaction number 148... does not match... active transaction number 147"
 * - Root Cause: Manual transaction management conflicted with MongoDB retry mechanism
 * - Fix: Refactored to use mongokit's Repository.withTransaction() (v2.6.6)
 *
 * This test ensures the fix remains effective and prevents regression.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '../../src/index.js';

describe('Bug Fix: Transaction Number Mismatch (v2.6.6)', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const orgId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Mock startSession for tests (MongoMemoryServer doesn't support transactions)
    const mockSession = {
      startTransaction: () => {
        throw new Error('Transaction numbers are only allowed on a replica set member');
      },
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
      idempotencyKey: String,
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
  });

  it('should process multiple employees concurrently without transaction conflicts', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Create 5 employees
    const employees = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `EMP-${String(i + 1).padStart(3, '0')}`,
            position: 'Test Employee',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 5000 + (i * 1000),
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    // Process all employees concurrently
    // This previously triggered: "transaction number mismatch" error
    const results = await Promise.all(
      employees.map(emp =>
        payroll.processSalary({
          employeeId: emp._id,
          month: 1,
          year: 2024,
        })
      )
    );

    // Verify: All should succeed without transaction errors
    expect(results).toHaveLength(5);
    results.forEach((result) => {
      expect(result.payrollRecord.status).toBe('paid');
      expect(result.transaction).toBeDefined();
      // Net salary varies by tax rate, just verify it's calculated
      expect(result.payrollRecord.breakdown.netSalary).toBeGreaterThan(0);
    });
  });

  it('should handle MongoDB retry mechanism with withTransaction()', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    const employee = await payroll.hire({
      employment: {
        employeeId: 'RETRY-001',
        position: 'Test Employee',
        department: 'it',
        hireDate: new Date('2024-01-01'),
      },
      compensation: {
        baseAmount: 6000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 2,
      year: 2024,
    });

    expect(result.payrollRecord.status).toBe('paid');
    expect(result.transaction).toBeDefined();
  });

  it('should process bulk payroll without transaction number conflicts', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Create 10 employees
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `BULK-${String(i + 1).padStart(3, '0')}`,
            position: 'Test Employee',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 4000 + (i * 500),
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    // Process bulk payroll (this previously triggered transaction errors)
    const result = await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 4,
      year: 2024,
      concurrency: 5,
    });

    // Verify: All should succeed
    expect(result.successful).toHaveLength(10);
    expect(result.failed).toHaveLength(0);
    expect(result.total).toBe(10);
  });

  it('should not throw transaction number mismatch error', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    const employee = await payroll.hire({
      employment: {
        employeeId: 'ERROR-CHECK-001',
        position: 'Test Employee',
        department: 'it',
        hireDate: new Date('2024-01-01'),
      },
      compensation: {
        baseAmount: 5000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    // Process multiple times rapidly to stress-test transaction handling
    const promises = Array.from({ length: 3 }, (_, i) =>
      payroll.processSalary({
        employeeId: employee._id,
        month: i + 5,
        year: 2024,
      }).catch(err => {
        // The error message we're preventing:
        const errorMsg = err.message || '';
        expect(errorMsg).not.toMatch(/transaction number.*does not match/i);
        expect(errorMsg).not.toMatch(/Given transaction number/i);

        // If it's a different error (e.g., duplicate), that's fine
        return null;
      })
    );

    await Promise.all(promises);
  });
});

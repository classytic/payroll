/**
 * Employee ID Mode Tests
 * Verifies explicit mode handling for edge cases (24-hex business IDs)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '../src/index.js';

describe('Employee ID Mode Resolution', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    mongoose.startSession = (async () => null) as any;

    const userSchema = new mongoose.Schema({ name: String, email: String });
    mongoose.model('User', userSchema);

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('Employee', employeeSchema);
    PayrollRecord = mongoose.model('PayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new mongoose.Schema({
      organizationId: mongoose.Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      net: Number,
      currency: String,
      tax: Number,
      status: String,
      date: Date,
      employeeId: mongoose.Schema.Types.ObjectId,
      customerId: mongoose.Schema.Types.ObjectId,
      breakdown: mongoose.Schema.Types.Mixed,
      sourceId: mongoose.Schema.Types.ObjectId,
      sourceModel: String,
      description: String,
      metadata: mongoose.Schema.Types.Mixed,
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

  describe('Edge Case: 24-Hex Business ID', () => {
    it('should respect employeeIdMode=businessId even for 24-hex strings', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Create employee with 24-hex business ID (looks like ObjectId!)
      const hexBusinessId = '000000000000000000000001'; // Valid hex, looks like ObjectId

      const employee = await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: hexBusinessId, // ← 24-hex business ID
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Update salary with explicit mode
      const updated = await payroll.updateSalary({
        employeeId: hexBusinessId, // ← Pass business ID
        employeeIdMode: 'businessId', // ← Explicit: treat as business ID, not ObjectId
        organizationId: org,
        compensation: { baseAmount: 120000 },
      });

      // Should find and update the correct employee
      expect(updated._id.toString()).toBe(employee._id.toString());
      expect(updated.compensation.baseAmount).toBe(120000);
      expect(updated.employeeId).toBe(hexBusinessId);
    });

    it('should use ObjectId when employeeIdMode=objectId', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      const employee = await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-NORMAL',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Fetch by ObjectId _id with explicit mode
      const updated = await payroll.updateSalary({
        employeeId: employee._id, // ← MongoDB ObjectId
        employeeIdMode: 'objectId', // ← Explicit: treat as ObjectId
        organizationId: org,
        compensation: { baseAmount: 120000 },
      });

      expect(updated._id.toString()).toBe(employee._id.toString());
      expect(updated.compensation.baseAmount).toBe(120000);
    });

    it('should auto-detect when mode is not specified', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      const employee = await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-AUTO-DETECT',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Without explicit mode, should auto-detect
      // ObjectId → treat as _id
      const byObjectId = await payroll.updateSalary({
        employeeId: employee._id,
        // No employeeIdMode specified
        organizationId: org,
        compensation: { baseAmount: 110000 },
      });

      expect(byObjectId.compensation.baseAmount).toBe(110000);

      // String → treat as business ID
      const byBusinessId = await payroll.updateSalary({
        employeeId: 'EMP-AUTO-DETECT',
        // No employeeIdMode specified
        organizationId: org,
        compensation: { baseAmount: 120000 },
      });

      expect(byBusinessId.compensation.baseAmount).toBe(120000);
    });
  });

  describe('Clear Error Messages', () => {
    it('should provide helpful error for invalid employeeId', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      await expect(
        payroll.updateSalary({
          employeeId: 'NONEXISTENT',
          employeeIdMode: 'businessId',
          organizationId: org,
          compensation: { baseAmount: 120000 },
        })
      ).rejects.toThrow();
    });
  });
});

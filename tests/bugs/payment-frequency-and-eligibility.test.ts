/**
 * Integration tests for:
 * 1. nextPaymentDate calculation based on payment frequency
 * 2. on_leave employees included in bulk payroll
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema } from '../../src/index.js';
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

describe('Payment Frequency and Eligibility Fixes', () => {
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

    EmployeeModel = mongoose.model('EmployeeFreq', employeeSchema);
    PayrollRecordModel = mongoose.model('PayrollRecordFreq', payrollRecordSchema);
    TransactionModel = mongoose.model('TransactionFreq', transactionSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await EmployeeModel.deleteMany({});
    await PayrollRecordModel.deleteMany({});
    await TransactionModel.deleteMany({});
  });

  // ============================================================================
  // Issue: nextPaymentDate should respect payment frequency
  // ============================================================================
  describe('nextPaymentDate based on payment frequency', () => {
    it('monthly frequency: nextPaymentDate is +1 month', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create employee with monthly frequency
      const employee = await payroll.hire({
        employment: {
          email: 'monthly@example.com',
          position: 'Engineer',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 120000,
          currency: 'USD',
          frequency: 'monthly',
        },
      });

      // Process salary
      const result = await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Fetch updated employee
      const updatedEmployee = await payroll.getEmployee({ employeeId: employee._id });

      expect(updatedEmployee?.payrollStats?.nextPaymentDate).toBeDefined();
      const nextDate = new Date(updatedEmployee!.payrollStats!.nextPaymentDate!);
      expect(nextDate.getMonth()).toBe(3); // April (0-indexed)
      expect(nextDate.getDate()).toBe(15);
    });

    it('weekly frequency: nextPaymentDate is +7 days', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create employee with weekly frequency
      const employee = await payroll.hire({
        employment: {
          email: 'weekly@example.com',
          position: 'Part-time',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 30000,
          currency: 'USD',
          frequency: 'weekly',
        },
      });

      // Process salary
      await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Fetch updated employee
      const updatedEmployee = await payroll.getEmployee({ employeeId: employee._id });

      expect(updatedEmployee?.payrollStats?.nextPaymentDate).toBeDefined();
      const nextDate = new Date(updatedEmployee!.payrollStats!.nextPaymentDate!);
      // March 15 + 7 days = March 22
      expect(nextDate.getMonth()).toBe(2); // Still March
      expect(nextDate.getDate()).toBe(22);
    });

    it('bi_weekly frequency: nextPaymentDate is +14 days', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create employee with bi_weekly frequency
      const employee = await payroll.hire({
        employment: {
          email: 'biweekly@example.com',
          position: 'Contractor',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 60000,
          currency: 'USD',
          frequency: 'bi_weekly',
        },
      });

      // Process salary
      await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Fetch updated employee
      const updatedEmployee = await payroll.getEmployee({ employeeId: employee._id });

      expect(updatedEmployee?.payrollStats?.nextPaymentDate).toBeDefined();
      const nextDate = new Date(updatedEmployee!.payrollStats!.nextPaymentDate!);
      // March 15 + 14 days = March 29
      expect(nextDate.getMonth()).toBe(2); // Still March
      expect(nextDate.getDate()).toBe(29);
    });

    it('daily frequency: nextPaymentDate is +1 day', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create employee with daily frequency
      const employee = await payroll.hire({
        employment: {
          email: 'daily@example.com',
          position: 'Day Laborer',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 285, // ~$104,000/year (285 × 365)
          currency: 'USD',
          frequency: 'daily',
        },
      });

      // Process salary
      await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Fetch updated employee
      const updatedEmployee = await payroll.getEmployee({ employeeId: employee._id });

      expect(updatedEmployee?.payrollStats?.nextPaymentDate).toBeDefined();
      const nextDate = new Date(updatedEmployee!.payrollStats!.nextPaymentDate!);
      // March 15 + 1 day = March 16
      expect(nextDate.getMonth()).toBe(2); // Still March
      expect(nextDate.getDate()).toBe(16);
    });

    it('hourly frequency: nextPaymentDate is +1 day', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create employee with hourly frequency
      const employee = await payroll.hire({
        employment: {
          email: 'hourly@example.com',
          position: 'Hourly Worker',
          department: 'operations',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 50, // $50/hour × 2080 = $104,000/year
          currency: 'USD',
          frequency: 'hourly',
        },
      });

      // Process salary
      await payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
        paymentDate: new Date('2024-03-15'),
      });

      // Fetch updated employee
      const updatedEmployee = await payroll.getEmployee({ employeeId: employee._id });

      expect(updatedEmployee?.payrollStats?.nextPaymentDate).toBeDefined();
      const nextDate = new Date(updatedEmployee!.payrollStats!.nextPaymentDate!);
      // March 15 + 1 day = March 16
      expect(nextDate.getMonth()).toBe(2); // Still March
      expect(nextDate.getDate()).toBe(16);
    });
  });

  // ============================================================================
  // Issue: Bulk payroll should include on_leave employees
  // ============================================================================
  describe('Bulk payroll includes on_leave employees', () => {
    it('should process on_leave employees in bulk payroll', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create active employee
      const activeEmployee = await payroll.hire({
        employment: {
          email: 'active@example.com',
          position: 'Engineer',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          frequency: 'monthly',
        },
      });

      // Create on_leave employee
      const onLeaveEmployee = await payroll.hire({
        employment: {
          email: 'onleave@example.com',
          position: 'Designer',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 90000,
          currency: 'USD',
          frequency: 'monthly',
        },
      });

      // Update employee status to on_leave
      await EmployeeModel.updateOne(
        { _id: onLeaveEmployee._id },
        { status: 'on_leave' }
      );

      // Process bulk payroll
      const result = await payroll.processBulkPayroll({
        month: 3,
        year: 2024,
      });

      // Both employees should be processed
      expect(result.total).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(0);

      // Verify both have payroll records
      const records = await PayrollRecordModel.find({ organizationId: orgId });
      expect(records.length).toBe(2);
    });

    it('should NOT process terminated employees in bulk payroll', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create active employee
      const activeEmployee = await payroll.hire({
        employment: {
          email: 'active2@example.com',
          position: 'Engineer',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          frequency: 'monthly',
        },
      });

      // Create terminated employee
      const terminatedEmployee = await payroll.hire({
        employment: {
          email: 'terminated@example.com',
          position: 'Ex-Employee',
          department: 'it',
          hireDate: new Date('2023-01-01'),
        },
        compensation: {
          baseAmount: 80000,
          currency: 'USD',
          frequency: 'monthly',
        },
      });

      // Update employee status to terminated
      await EmployeeModel.updateOne(
        { _id: terminatedEmployee._id },
        { status: 'terminated', terminationDate: new Date('2024-02-28') }
      );

      // Process bulk payroll
      const result = await payroll.processBulkPayroll({
        month: 3,
        year: 2024,
      });

      // Only active employee should be processed
      expect(result.total).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(0);
    });

    it('should match single-employee eligibility for on_leave status', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .forSingleTenant({ organizationId: orgId, autoInject: true })
        .build();

      // Create employee and set to on_leave
      const employee = await payroll.hire({
        employment: {
          email: 'leave-single@example.com',
          position: 'Engineer',
          department: 'it',
          hireDate: new Date('2024-01-01'),
        },
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          frequency: 'monthly',
        },
      });

      await EmployeeModel.updateOne(
        { _id: employee._id },
        { status: 'on_leave' }
      );

      // Single-employee processing should work
      const singleResult = await payroll.processSalary({
        employeeId: employee._id,
        month: 4,
        year: 2024,
      });

      expect(singleResult.payrollRecord).toBeDefined();
      expect(singleResult.payrollRecord.breakdown.netSalary).toBeGreaterThan(0);
    });
  });
});

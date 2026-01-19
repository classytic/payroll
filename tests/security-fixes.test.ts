/**
 * Security and Bug Fixes Test Suite
 *
 * Tests for the clean per-request repository architecture and related fixes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  SecurityError,
  EmployeeNotFoundError,
} from '../src/index.js';
import { disableLogging } from '../src/utils/logger.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  disableLogging();

  // MongoMemoryServer doesn't support transactions without replica set.
  mongoose.startSession = (async () => null) as any;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('Security & Bug Fixes Test Suite', () => {
  // Setup models
  const userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
  });

  const employeeSchema = createEmployeeSchema();
  const payrollRecordSchema = createPayrollRecordSchema();
  const transactionSchema = new Schema({
    organizationId: Schema.Types.ObjectId,
    userId: Schema.Types.ObjectId,
    type: String,
    category: String,
    grossAmount: Number,
    amount: Number,
    method: String,
    status: String,
    date: Date,
    currency: String,
  });

  const UserModel = model('User', userSchema);
  const EmployeeModel = model('Employee', employeeSchema);
  const PayrollRecordModel = model('PayrollRecord', payrollRecordSchema);
  const TransactionModel = model('Transaction', transactionSchema);

  let orgA: mongoose.Types.ObjectId;
  let orgB: mongoose.Types.ObjectId;

  beforeEach(() => {
    // Create test organization IDs
    orgA = new mongoose.Types.ObjectId();
    orgB = new mongoose.Types.ObjectId();
  });

  describe('🔴 HIGH: Multi-Tenant Security', () => {
    describe('Per-Request Repository Scoping', () => {
      it('should enforce organizationId at query level (employee not found for different org)', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .build();

        // Create employee in Org B
        const employee = await EmployeeModel.create({
          organizationId: orgB,
          employeeId: 'EMP-001',
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });

        // Try to access from Org A - should not find the employee
        await expect(
          payroll.processSalary({
            employeeId: employee._id,
            organizationId: orgA, // Different org!
            month: 1,
            year: 2024
          })
        ).rejects.toThrow(EmployeeNotFoundError);
      });

      it('should require organizationId in multi-tenant mode', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .build();

        await expect(
          payroll.processSalary({
            employeeId: new mongoose.Types.ObjectId(),
            // organizationId missing!
            month: 1,
            year: 2024
          })
        ).rejects.toThrow(SecurityError);
      });

      it('should work in single-tenant mode without organizationId param', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .forSingleTenant({ organizationId: orgA })
          .build();

        // Create employee
        const employee = await EmployeeModel.create({
          organizationId: orgA,
          employeeId: 'EMP-002',
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });

        // Should work without passing organizationId
        const result = await payroll.processSalary({
          employeeId: employee._id,
          // organizationId optional in single-tenant
          month: 1,
          year: 2024
        });

        expect(result).toBeDefined();
        expect(result.employee._id.toString()).toBe(employee._id.toString());
      });
    });

    describe('resolveEmployeeId Security', () => {
      it('should pass organizationId when resolving businessId', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .build();

        // Create employee with business ID in Org A
        const employee = await EmployeeModel.create({
          organizationId: orgA,
          employeeId: 'EMP-BUSINESS-001',
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });

        // Should work with businessId mode
        const result = await payroll.processSalary({
          employeeId: 'EMP-BUSINESS-001',
          employeeIdMode: 'businessId',
          organizationId: orgA,
          month: 1,
          year: 2024
        });

        expect(result).toBeDefined();
        expect(result.employee._id.toString()).toBe(employee._id.toString());
      });

      it('should fail when businessId belongs to different org', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .build();

        // Create employee with business ID in Org B
        await EmployeeModel.create({
          organizationId: orgB,
          employeeId: 'EMP-BUSINESS-002',
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });

        // Try to access from Org A using business ID
        await expect(
          payroll.processSalary({
            employeeId: 'EMP-BUSINESS-002',
            employeeIdMode: 'businessId',
            organizationId: orgA, // Different org!
            month: 1,
            year: 2024
          })
        ).rejects.toThrow(EmployeeNotFoundError);
      });
    });

    describe('payrollHistory Security', () => {
      it('should require organizationId in multi-tenant mode', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .build();

        await expect(
          payroll.payrollHistory({
            // organizationId missing!
            month: 1,
            year: 2024
          })
        ).rejects.toThrow(SecurityError);
      });

      it('should enforce organizationId filter in query', async () => {
        const payroll = createPayrollInstance()
          .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
          .build();

        // Create employees in both orgs
        const empA = await EmployeeModel.create({
          organizationId: orgA,
          employeeId: 'EMP-A',
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });

        const empB = await EmployeeModel.create({
          organizationId: orgB,
          employeeId: 'EMP-B',
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });

        // Process payroll for both
        await payroll.processSalary({
          employeeId: empA._id,
          organizationId: orgA,
          month: 1,
          year: 2024
        });

        await payroll.processSalary({
          employeeId: empB._id,
          organizationId: orgB,
          month: 1,
          year: 2024
        });

        // Query for Org A should only return Org A records
        const historyA = await payroll.payrollHistory({
          organizationId: orgA,
          month: 1,
          year: 2024
        });

        expect(historyA).toHaveLength(1);
        expect(historyA[0].organizationId.toString()).toBe(orgA.toString());

        // Query for Org B should only return Org B records
        const historyB = await payroll.payrollHistory({
          organizationId: orgB,
          month: 1,
          year: 2024
        });

        expect(historyB).toHaveLength(1);
        expect(historyB[0].organizationId.toString()).toBe(orgB.toString());
      });
    });
  });

  describe('🟡 MEDIUM: Concurrency Control', () => {
    it('should respect concurrency limit in bulk operations', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Create 10 employees
      const employees = [];
      for (let i = 0; i < 10; i++) {
        const emp = await EmployeeModel.create({
          organizationId: orgA,
          employeeId: `EMP-${i}`,
          userId: new mongoose.Types.ObjectId(),
          position: 'Developer',
          department: 'it',
          hireDate: new Date(),
          status: 'active',
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            type: 'salary',
            payFrequency: 'monthly',
          },
        });
        employees.push(emp._id);
      }

      let concurrentCount = 0;
      let maxConcurrent = 0;

      // Spy on processSalary to track concurrency
      const originalProcessSalary = payroll.processSalary.bind(payroll);
      payroll.processSalary = async function(params: any) {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        try {
          return await originalProcessSalary(params);
        } finally {
          concurrentCount--;
        }
      };

      // Process with concurrency limit of 2
      const result = await payroll.processBulkPayroll({
        organizationId: orgA,
        employeeIds: employees,
        month: 1,
        year: 2024,
        concurrency: 2,
        batchSize: 10 // Process all in one batch
      });

      expect(result.successful).toHaveLength(10);
      expect(result.failed).toHaveLength(0);
      // Max concurrent should not exceed the specified limit significantly
      // (allow some margin for async timing)
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    }, 30000); // Increase timeout for bulk processing
  });

  describe('🟢 LOW: Currency Defaults', () => {
    it('should use config.payroll.defaultCurrency when employee has no currency', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .withConfig({
          payroll: {
            defaultCurrency: 'EUR',
          },
        })
        .build();

      // Create employee without currency
      const employee = await EmployeeModel.create({
        organizationId: orgA,
        employeeId: 'EMP-NOCUR',
        userId: new mongoose.Types.ObjectId(),
        position: 'Developer',
        department: 'it',
        hireDate: new Date(),
        status: 'active',
        compensation: {
          baseAmount: 50000,
          // No currency specified
          type: 'salary',
          payFrequency: 'monthly',
        },
      });

      const result = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: orgA,
        month: 1,
        year: 2024
      });

      // Check transaction currency
      const transaction = await TransactionModel.findById(result.transaction._id);
      expect(transaction?.currency).toBe('EUR');
    });

    it('should prioritize employee currency over config default', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .withConfig({
          payroll: {
            defaultCurrency: 'EUR',
          },
        })
        .build();

      // Create employee with specific currency
      const employee = await EmployeeModel.create({
        organizationId: orgA,
        employeeId: 'EMP-GBP',
        userId: new mongoose.Types.ObjectId(),
        position: 'Developer',
        department: 'it',
        hireDate: new Date(),
        status: 'active',
        compensation: {
          baseAmount: 50000,
          currency: 'GBP', // Employee-specific currency
          type: 'salary',
          payFrequency: 'monthly',
        },
      });

      const result = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: orgA,
        month: 1,
        year: 2024
      });

      // Check transaction currency - should use employee's currency
      const transaction = await TransactionModel.findById(result.transaction._id);
      expect(transaction?.currency).toBe('GBP');
    });

    it('should fallback to USD when no currency anywhere', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        // No config default currency
        .build();

      // Create employee without currency
      const employee = await EmployeeModel.create({
        organizationId: orgA,
        employeeId: 'EMP-DEFAULT',
        userId: new mongoose.Types.ObjectId(),
        position: 'Developer',
        department: 'it',
        hireDate: new Date(),
        status: 'active',
        compensation: {
          baseAmount: 50000,
          // No currency specified
          type: 'salary',
          payFrequency: 'monthly',
        },
      });

      const result = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: orgA,
        month: 1,
        year: 2024
      });

      // Check transaction currency - should fallback to USD
      const transaction = await TransactionModel.findById(result.transaction._id);
      expect(transaction?.currency).toBe('USD');
    });
  });

  describe('Integration: Full Flow', () => {
    it('should process salary with all security checks in place', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .withConfig({
          payroll: {
            defaultCurrency: 'EUR',
          },
        })
        .build();

      // Create employee
      const employee = await EmployeeModel.create({
        organizationId: orgA,
        employeeId: 'EMP-INTEGRATION',
        userId: new mongoose.Types.ObjectId(),
        position: 'Senior Developer',
        department: 'it',
        hireDate: new Date(),
        status: 'active',
        compensation: {
          baseAmount: 75000,
          currency: 'EUR',
          type: 'salary',
          payFrequency: 'monthly',
          allowances: [
            { type: 'housing', amount: 5000, taxable: true, recurring: true },
          ],
          deductions: [
            { type: 'insurance', amount: 500, recurring: true },
          ],
        },
      });

      // Process salary
      const result = await payroll.processSalary({
        employeeId: employee._id,
        organizationId: orgA,
        month: 1,
        year: 2024
      });

      // Verify result
      expect(result.employee._id.toString()).toBe(employee._id.toString());
      expect(result.payrollRecord.status).toBe('paid');
      expect(result.payrollRecord.organizationId.toString()).toBe(orgA.toString());
      expect(result.transaction.currency).toBe('EUR');

      // Verify in database
      const dbPayroll = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(dbPayroll).toBeDefined();
      expect(dbPayroll?.organizationId.toString()).toBe(orgA.toString());

      const dbTransaction = await TransactionModel.findById(result.transaction._id);
      expect(dbTransaction).toBeDefined();
      expect(dbTransaction?.currency).toBe('EUR');

      // Verify history retrieval
      const history = await payroll.payrollHistory({
        employeeId: employee._id,
        organizationId: orgA,
        month: 1,
        year: 2024
      });

      expect(history).toHaveLength(1);
      expect(history[0]._id.toString()).toBe(result.payrollRecord._id.toString());
    });
  });
});

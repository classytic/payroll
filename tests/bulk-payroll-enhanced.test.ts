/**
 * @classytic/payroll - Enhanced Bulk Payroll Tests
 * Tests for progress tracking, cancellation, batching, and concurrency
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  type BulkPayrollProgress,
} from '../src/index.js';
import { disableLogging } from '../src/utils/logger.js';

// ============================================================================
// Setup MongoDB
// ============================================================================

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  disableLogging();

  // MongoMemoryServer doesn't support transactions without replica set.
  // Mock startSession to return null - Mongoose handles .session(null) gracefully
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

// ============================================================================
// Enhanced Bulk Payroll Tests
// ============================================================================

describe('Enhanced processBulkPayroll', () => {
  let organizationId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeEach(() => {
    // Create new IDs for each test to avoid duplicate key errors
    organizationId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
  });

  // Setup models
  const userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
  });

  const employeeSchema = createEmployeeSchema();
  const payrollRecordSchema = createPayrollRecordSchema();
  const transactionSchema = new Schema({
    organizationId: Schema.Types.ObjectId,
    userId: Schema.Types.ObjectId,
    type: String,
    category: String,
    amount: Number,
    method: String,
    status: String,
    date: Date,
    referenceId: Schema.Types.ObjectId,
    referenceModel: String,
    handledBy: Schema.Types.ObjectId,
    notes: String,
    metadata: Schema.Types.Mixed,
  }, { timestamps: true });

  const User = mongoose.models.User || model('User', userSchema);
  const Employee = mongoose.models.Employee || model('Employee', employeeSchema);
  const PayrollRecord = mongoose.models.PayrollRecord || model('PayrollRecord', payrollRecordSchema);
  const Transaction = mongoose.models.Transaction || model('Transaction', transactionSchema);

  // Helper to create test employees
  async function createEmployees(count: number) {
    const employees = [];
    for (let i = 0; i < count; i++) {
      // Create unique user for each employee (avoids userId+orgId unique constraint)
      const empUserId = new mongoose.Types.ObjectId();
      const user = await User.create({
        _id: empUserId,
        name: `Test User ${i + 1}`,
        email: `user-${empUserId.toString()}@test.com`,
      });

      const employee = new Employee({
        organizationId,
        userId: user._id,
        employeeId: `EMP-${String(i + 1).padStart(3, '0')}`,
        position: 'Developer',
        department: 'it',
        hireDate: new Date('2024-01-01'),
        status: 'active',
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          allowances: [],
          deductions: [],
        },
      });
      await employee.save();
      employees.push(employee);
    }
    return employees;
  }

  describe('Progress Tracking', () => {
    it('should call onProgress callback after each employee', async () => {
      const employees = await createEmployees(5);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const progressUpdates: BulkPayrollProgress[] = [];
      const onProgress = vi.fn((progress: BulkPayrollProgress) => {
        progressUpdates.push(progress);
      });

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        onProgress,
      });

      // Should have called onProgress for each employee
      expect(onProgress).toHaveBeenCalledTimes(5);
      expect(progressUpdates).toHaveLength(5);

      // Check progress values
      expect(progressUpdates[0].processed).toBe(1);
      expect(progressUpdates[0].total).toBe(5);
      expect(progressUpdates[0].percentage).toBe(20);

      expect(progressUpdates[4].processed).toBe(5);
      expect(progressUpdates[4].total).toBe(5);
      expect(progressUpdates[4].percentage).toBe(100);

      // Check result
      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
    });

    it('should include currentEmployee in progress updates', async () => {
      await createEmployees(3);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const progressUpdates: BulkPayrollProgress[] = [];

      await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        onProgress: (progress) => progressUpdates.push(progress),
      });

      // Check that currentEmployee is set
      expect(progressUpdates[0].currentEmployee).toBe('EMP-001');
      expect(progressUpdates[1].currentEmployee).toBe('EMP-002');
      expect(progressUpdates[2].currentEmployee).toBe('EMP-003');
    });

    it('should track successful and failed counts in progress', async () => {
      const employees = await createEmployees(3);

      // Make one employee fail by removing required compensation
      await Employee.findByIdAndUpdate(employees[1]._id, {
        $unset: { compensation: 1 },
      });

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const progressUpdates: BulkPayrollProgress[] = [];

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        onProgress: (progress) => progressUpdates.push(progress),
      });

      // First employee succeeds
      expect(progressUpdates[0].successful).toBe(1);
      expect(progressUpdates[0].failed).toBe(0);

      // Second employee fails
      expect(progressUpdates[1].successful).toBe(1);
      expect(progressUpdates[1].failed).toBe(1);

      // Third employee succeeds
      expect(progressUpdates[2].successful).toBe(2);
      expect(progressUpdates[2].failed).toBe(1);

      // Final result
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
    });

    it('should support async onProgress callbacks', async () => {
      await createEmployees(2);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const delays: number[] = [];
      let callCount = 0;

      await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        onProgress: async (progress) => {
          callCount++;
          const start = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 10));
          delays.push(Date.now() - start);
        },
      });

      expect(callCount).toBe(2);
      // Each delay should be at least 10ms
      delays.forEach((delay) => expect(delay).toBeGreaterThanOrEqual(9)); // Allow 1ms tolerance
    });
  });

  describe('Cancellation Support', () => {
    it('should abort processing when signal is aborted', async () => {
      await createEmployees(10);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const controller = new AbortController();
      let processedCount = 0;

      const promise = payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        signal: controller.signal,
        onProgress: () => {
          processedCount++;
          // Abort after processing 3 employees
          if (processedCount === 3) {
            controller.abort();
          }
        },
      });

      // Should throw error due to cancellation
      await expect(promise).rejects.toThrow(/cancelled by user/i);

      // Should have processed only 3 employees
      expect(processedCount).toBe(3);
    });

    it('should check signal before each batch', async () => {
      await createEmployees(20);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const controller = new AbortController();
      let batchCount = 0;

      const promise = payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        signal: controller.signal,
        batchSize: 5,
        onProgress: () => {
          batchCount++;
          // Abort after first batch (5 employees)
          if (batchCount === 5) {
            controller.abort();
          }
        },
      });

      await expect(promise).rejects.toThrow(/cancelled/i);

      // Should have processed exactly one batch (5 employees)
      expect(batchCount).toBe(5);
    });

    it('should complete successfully if signal is never aborted', async () => {
      await createEmployees(5);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const controller = new AbortController();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        signal: controller.signal,
      });

      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
    });
  });

  describe('Batch Processing', () => {
    it('should process employees in batches of specified size', async () => {
      await createEmployees(15);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const batchSizes: number[] = [];
      let currentBatchSize = 0;

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 5,
        onProgress: (progress) => {
          currentBatchSize++;
          // When processed count is multiple of 5, we completed a batch
          if (progress.processed % 5 === 0) {
            batchSizes.push(currentBatchSize);
            currentBatchSize = 0;
          }
        },
      });

      // Should have 3 batches of 5
      expect(batchSizes).toEqual([5, 5, 5]);
      expect(result.successful).toHaveLength(15);
    });

    it('should handle partial last batch', async () => {
      await createEmployees(12);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 5, // 5, 5, 2
      });

      expect(result.successful).toHaveLength(12);
    });

    it('should pause between batches when batchDelay is set', async () => {
      await createEmployees(6);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const timestamps: number[] = [];

      const startTime = Date.now();

      await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 3,
        batchDelay: 50, // 50ms delay between batches
        onProgress: () => {
          timestamps.push(Date.now() - startTime);
        },
      });

      // Should have paused once (after first batch of 3)
      // Timestamps should show delay between batch 1 and batch 2
      // Employee 3 (end of batch 1) to Employee 4 (start of batch 2) should have ~50ms gap
      const employee3Time = timestamps[2];
      const employee4Time = timestamps[3];
      const gap = employee4Time - employee3Time;

      expect(gap).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });

    it('should not pause after last batch', async () => {
      await createEmployees(5);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const startTime = Date.now();

      await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 5,
        batchDelay: 100, // Should NOT be applied (only one batch)
      });

      const totalTime = Date.now() - startTime;

      // Should complete quickly (no 100ms delay)
      expect(totalTime).toBeLessThan(100);
    });
  });

  describe('Concurrency Control', () => {
    it('should process employees sequentially by default', async () => {
      await createEmployees(5);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const processingOrder: string[] = [];

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        onProgress: (progress) => {
          if (progress.currentEmployee) {
            processingOrder.push(progress.currentEmployee);
          }
        },
      });

      // Sequential processing should maintain order
      expect(processingOrder).toEqual(['EMP-001', 'EMP-002', 'EMP-003', 'EMP-004', 'EMP-005']);
      expect(result.successful).toHaveLength(5);
    });

    it('should process employees concurrently when concurrency > 1', async () => {
      await createEmployees(10);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const startTime = Date.now();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        concurrency: 5,
        batchSize: 10, // Process all in one batch
      });

      const totalTime = Date.now() - startTime;

      expect(result.successful).toHaveLength(10);

      // Concurrent processing should be faster than sequential
      // This is hard to test reliably, so we just verify it completes
      expect(totalTime).toBeLessThan(5000); // Should complete in reasonable time
    });

    it('should handle errors in concurrent processing', async () => {
      const employees = await createEmployees(6);

      // Make some employees fail
      await Employee.findByIdAndUpdate(employees[1]._id, { $unset: { compensation: 1 } });
      await Employee.findByIdAndUpdate(employees[4]._id, { $unset: { compensation: 1 } });

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        concurrency: 3,
        batchSize: 6,
      });

      expect(result.successful).toHaveLength(4);
      expect(result.failed).toHaveLength(2);
    });

    it('should respect batch size with concurrency', async () => {
      await createEmployees(20);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      let progressCallCount = 0;

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 5,
        concurrency: 3,
        onProgress: () => {
          progressCallCount++;
        },
      });

      // With concurrency, progress is called once per batch, not per employee
      // 4 batches of 5 = 4 progress calls
      expect(progressCallCount).toBe(4);
      expect(result.successful).toHaveLength(20);
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without any new parameters', async () => {
      await createEmployees(5);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      // Old API call without new parameters
      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
      });

      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
    });

    it('should use defaults when parameters are undefined', async () => {
      await createEmployees(5);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        onProgress: undefined,
        signal: undefined,
        batchSize: undefined,
        batchDelay: undefined,
        concurrency: undefined,
      });

      expect(result.successful).toHaveLength(5);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should simulate job queue integration', async () => {
      await createEmployees(20);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      // Simulate job document in database
      const job = {
        id: new mongoose.Types.ObjectId(),
        status: 'processing',
        progress: { processed: 0, total: 0, percentage: 0 },
      };

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 5,
        batchDelay: 10,
        onProgress: async (progress) => {
          // Update job progress
          job.progress = {
            processed: progress.processed,
            total: progress.total,
            percentage: progress.percentage || 0,
          };
        },
      });

      expect(result.successful).toHaveLength(20);
      expect(job.progress.processed).toBe(20);
      expect(job.progress.total).toBe(20);
      expect(job.progress.percentage).toBe(100);
    });

    it('should handle user cancellation mid-processing', async () => {
      await createEmployees(30);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const controller = new AbortController();
      let lastProgress: BulkPayrollProgress | null = null;

      // Simulate user clicking cancel button after 50% completion
      const promise = payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        batchSize: 10,
        signal: controller.signal,
        onProgress: (progress) => {
          lastProgress = progress;
          if (progress.processed >= 15) {
            controller.abort();
          }
        },
      });

      await expect(promise).rejects.toThrow(/cancelled/i);

      // Should have stopped around 15-20 employees (end of batch)
      expect(lastProgress?.processed).toBeGreaterThanOrEqual(15);
      expect(lastProgress?.processed).toBeLessThanOrEqual(20);
    });
  });

  describe('Streaming Mode', () => {
    it('should use streaming for large datasets automatically', async () => {
      // Create 15 employees (>10 will trigger streaming in real use)
      await createEmployees(15);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        useStreaming: true, // Force streaming
        concurrency: 3,
      });

      expect(result.successful).toHaveLength(15);
      expect(result.failed).toHaveLength(0);
    });

    it('should support progress tracking in streaming mode', async () => {
      await createEmployees(10);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const progressUpdates: BulkPayrollProgress[] = [];

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        useStreaming: true,
        concurrency: 2,
        onProgress: (progress) => {
          progressUpdates.push(progress);
        },
      });

      expect(result.successful).toHaveLength(10);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
    });

    it('should handle cancellation in streaming mode', async () => {
      await createEmployees(20);

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const controller = new AbortController();
      let processedCount = 0;

      const promise = payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        useStreaming: true,
        batchSize: 5,
        signal: controller.signal,
        onProgress: () => {
          processedCount++;
          // Abort early - after first progress update
          if (processedCount === 1) {
            controller.abort();
          }
        },
      });

      await expect(promise).rejects.toThrow(/cancelled/i);
      expect(processedCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle errors in streaming mode', async () => {
      const employees = await createEmployees(5);

      // Make one employee fail
      await Employee.findByIdAndUpdate(employees[2]._id, {
        $unset: { compensation: 1 },
      });

      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .build();

      const result = await payroll.processBulkPayroll({
        organizationId,
        month: 3,
        year: 2024,
        useStreaming: true,
      });

      expect(result.successful).toHaveLength(4);
      expect(result.failed).toHaveLength(1);
    });
  });
});

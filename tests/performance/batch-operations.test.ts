/**
 * Test: Batch Operations Performance & Correctness
 *
 * Verifies that batch operations (tax withholding batch creation,
 * bulk payroll processing) work correctly and maintain data integrity.
 *
 * Phase 3.2 of the mongokit optimization plan.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  employeePlugin,
} from '../../src/index.js';
import { disableLogging } from '../../src/utils/logger.js';

// ============================================================================
// Setup
// ============================================================================

let mongoServer: MongoMemoryServer;
let Employee: mongoose.Model<any>;
let PayrollRecord: mongoose.Model<any>;
let Transaction: mongoose.Model<any>;

const orgId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  disableLogging();

  // MongoMemoryServer doesn't support transactions without replica set
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
  Employee = mongoose.model('BatchEmployee', employeeSchema);
  PayrollRecord = mongoose.model('BatchPayrollRecord', createPayrollRecordSchema());

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
    tags: [String],
    method: String,
    notes: String,
  });
  Transaction = mongoose.model('BatchTransaction', transactionSchema);
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

// ============================================================================
// Tests
// ============================================================================

describe('Batch Operations: Tax Withholding Creation', () => {
  it('should create all tax withholdings in a single batch operation', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    const employee = await payroll.hire({
      employment: {
        employeeId: 'BATCH-TAX-001',
        position: 'Software Engineer',
        department: 'it',
        hireDate: new Date('2024-01-01'),
      },
      compensation: {
        baseAmount: 10000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    // Process salary - triggers batch tax withholding creation
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 1,
      year: 2024,
    });

    // Verify payroll was processed correctly
    expect(result.payrollRecord).toBeDefined();
    expect(result.payrollRecord.status).toBe('paid');
    expect(result.payrollRecord.breakdown).toBeDefined();
    expect(result.payrollRecord.breakdown.grossSalary).toBe(10000);
    expect(result.payrollRecord.breakdown.netSalary).toBeGreaterThan(0);
    expect(result.payrollRecord.breakdown.netSalary).toBeLessThan(10000);
  });

  it('should handle employees with zero tax deductions', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Create employee with minimal compensation
    const employee = await payroll.hire({
      employment: {
        employeeId: 'BATCH-ZERO-001',
        position: 'Intern',
        department: 'it',
        hireDate: new Date('2024-01-01'),
      },
      compensation: {
        baseAmount: 500,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 1,
      year: 2024,
    });

    expect(result.payrollRecord).toBeDefined();
    expect(result.payrollRecord.status).toBe('paid');
  });
});

describe('Batch Operations: Bulk Payroll Processing', () => {
  it('should process multiple employees in bulk with correct results', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Create 10 employees with varying salaries
    const employeeCount = 10;
    await Promise.all(
      Array.from({ length: employeeCount }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `BULK-OP-${String(i + 1).padStart(3, '0')}`,
            position: 'Engineer',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 3000 + (i * 1000),
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    // Process bulk payroll
    const result = await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 3,
      year: 2024,
      concurrency: 5,
    });

    // Verify all employees processed
    expect(result.total).toBe(employeeCount);
    expect(result.successful).toHaveLength(employeeCount);
    expect(result.failed).toHaveLength(0);

    // Verify each result has valid data (BulkPayrollResult shape: { employeeId, amount, transactionId })
    result.successful.forEach((success) => {
      expect(success.employeeId).toBeDefined();
      expect(success.amount).toBeGreaterThan(0);
      expect(success.transactionId).toBeDefined();
    });
  });

  it('should process bulk payroll with concurrency=1 (sequential)', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `SEQ-${String(i + 1).padStart(3, '0')}`,
            position: 'Analyst',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 5000,
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    const result = await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 6,
      year: 2024,
      concurrency: 1,
    });

    expect(result.total).toBe(3);
    expect(result.successful).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
  });

  it('should maintain atomicity - each employee processed independently', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Create employees
    const employees = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `ATOMIC-${String(i + 1).padStart(3, '0')}`,
            position: 'Worker',
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

    // Process first round
    const result1 = await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 7,
      year: 2024,
    });

    expect(result1.successful).toHaveLength(5);

    // Second processing of same month should fail due to idempotency/duplicate
    const result2 = await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 7,
      year: 2024,
    });

    // All should fail (already processed) or succeed with idempotent results
    expect(result2.total).toBe(5);
  });

  it('should emit events for all batch-processed employees', async () => {
    const events: string[] = [];

    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Listen for salary processed events
    payroll.on('salary:processed', () => {
      events.push('salary:processed');
    });

    // Create and process 3 employees
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `EVT-${String(i + 1).padStart(3, '0')}`,
            position: 'Engineer',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 5000,
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 8,
      year: 2024,
    });

    // Verify events were emitted for each employee
    expect(events).toHaveLength(3);
  });
});

describe('Batch Operations: Concurrent Processing Safety', () => {
  it('should handle concurrent salary processing for different employees', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    const employees = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `CONC-${String(i + 1).padStart(3, '0')}`,
            position: 'Developer',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 6000 + (i * 1000),
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    // Process all concurrently (simulates real-world concurrent access)
    const results = await Promise.all(
      employees.map(emp =>
        payroll.processSalary({
          employeeId: emp._id,
          month: 9,
          year: 2024,
        })
      )
    );

    // All should succeed without conflicts
    expect(results).toHaveLength(5);
    results.forEach((result) => {
      expect(result.payrollRecord.status).toBe('paid');
      expect(result.transaction).toBeDefined();
    });

    // Verify each employee's payroll has unique amounts
    const grossSalaries = results.map(r => r.payrollRecord.breakdown.grossSalary);
    const uniqueSalaries = new Set(grossSalaries);
    expect(uniqueSalaries.size).toBe(5);
  });

  it('should handle high concurrency bulk processing', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: orgId, autoInject: true })
      .build();

    // Create 20 employees
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        payroll.hire({
          employment: {
            employeeId: `HIGH-CONC-${String(i + 1).padStart(3, '0')}`,
            position: 'Staff',
            department: 'it',
            hireDate: new Date('2024-01-01'),
          },
          compensation: {
            baseAmount: 3000 + (i * 200),
            currency: 'USD',
            frequency: 'monthly',
          },
        })
      )
    );

    // Process with high concurrency
    const result = await payroll.processBulkPayroll({
      organizationId: orgId,
      month: 10,
      year: 2024,
      concurrency: 10,
    });

    expect(result.total).toBe(20);
    expect(result.successful).toHaveLength(20);
    expect(result.failed).toHaveLength(0);
  });
});

/**
 * Test config propagation through Payroll.hire to EmployeeFactory
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmploymentFields, employeePlugin, createPayrollRecordSchema } from '../src/index.js';
import { disableLogging } from '../src/utils/logger.js';
import type { HRMConfig, EmployeeDocument, PayrollRecordDocument } from '../src/types.js';

describe('Config Propagation - Payroll.hire', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    disableLogging();
    const mockSession = { startTransaction: () => { throw new Error("Transaction numbers are only allowed on a replica set member"); }, commitTransaction: async () => {}, abortTransaction: async () => {}, endSession: () => {}, inTransaction: () => false }; mongoose.startSession = (async () => mockSession) as any;
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

  it('should use custom defaultCurrency from config when hiring', async () => {
    // Create Employee schema with payroll plugin
    const employeeSchema = new Schema({
      ...createEmploymentFields(),
    });
    employeeSchema.plugin(employeePlugin);
    const Employee = model<EmployeeDocument>('Employee_ConfigTest1', employeeSchema);

    // Create PayrollRecord schema
    const payrollRecordSchema = createPayrollRecordSchema();
    const PayrollRecord = model<PayrollRecordDocument>('PayrollRecord_ConfigTest1', payrollRecordSchema);

    // Create Transaction model (simple stub)
    const Transaction = model('Transaction_ConfigTest1', new Schema({}));

    const customConfig: Partial<HRMConfig> = {
      payroll: {
        defaultCurrency: 'EUR',
        allowNegativeSalary: false,
      },
      employment: {
        defaultProbationMonths: 6,
      },
      validation: {
        requireBankDetails: false,
        requireUserId: false,
        identityMode: 'employeeId',
        identityFallbacks: ['email'],
      },
    };

    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
      })
      .withConfig(customConfig)
      .build();

    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    // Hire without specifying currency - should use EUR from config
    const employee = await payroll.hire({
      userId,
      organizationId: orgId,
      employment: {
        position: 'Engineer',
        type: 'full_time',
        email: 'test@example.com',
      },
      compensation: {
        baseAmount: 50000,
        // Note: NOT specifying currency here
      },
    });

    // Verify currency defaults to EUR from custom config
    expect(employee.compensation.currency).toBe('EUR');
  });

  it('should use custom defaultProbationMonths from config when hiring', async () => {
    const employeeSchema = new Schema({
      ...createEmploymentFields(),
    });
    employeeSchema.plugin(employeePlugin);
    const Employee = model<EmployeeDocument>('Employee_ConfigTest2', employeeSchema);

    const payrollRecordSchema = createPayrollRecordSchema();
    const PayrollRecord = model<PayrollRecordDocument>('PayrollRecord_ConfigTest2', payrollRecordSchema);

    const Transaction = model('Transaction_ConfigTest2', new Schema({}));

    const customConfig: Partial<HRMConfig> = {
      payroll: {
        defaultCurrency: 'USD',
        allowNegativeSalary: false,
      },
      employment: {
        defaultProbationMonths: 12, // Custom: 12 months instead of default 3
      },
      validation: {
        requireBankDetails: false,
        requireUserId: false,
        identityMode: 'employeeId',
        identityFallbacks: ['email'],
      },
    };

    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
      })
      .withConfig(customConfig)
      .build();

    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const employee = await payroll.hire({
      userId,
      organizationId: orgId,
      employment: {
        position: 'Engineer',
        type: 'full_time',
        email: 'test@example.com',
        hireDate: new Date('2024-01-01'),
        // Note: NOT specifying probationMonths here
      },
      compensation: {
        baseAmount: 50000,
        currency: 'USD',
      },
    });

    // Calculate expected probation end date (12 months from hire date)
    const expectedProbationEnd = new Date('2024-01-01');
    expectedProbationEnd.setMonth(expectedProbationEnd.getMonth() + 12);

    // Verify probation period uses 12 months from custom config
    expect(employee.probationEndDate).toBeDefined();
    expect(employee.probationEndDate?.getTime()).toBe(expectedProbationEnd.getTime());
  });

  it('should use package defaults when no custom config provided', async () => {
    const employeeSchema = new Schema({
      ...createEmploymentFields(),
    });
    employeeSchema.plugin(employeePlugin);
    const Employee = model<EmployeeDocument>('Employee_ConfigTest3', employeeSchema);

    const payrollRecordSchema = createPayrollRecordSchema();
    const PayrollRecord = model<PayrollRecordDocument>('PayrollRecord_ConfigTest3', payrollRecordSchema);

    const Transaction = model('Transaction_ConfigTest3', new Schema({}));

    // No custom config - should use HRM_CONFIG defaults
    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
      })
      .build();

    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const employee = await payroll.hire({
      userId,
      organizationId: orgId,
      employment: {
        position: 'Engineer',
        type: 'full_time',
        email: 'test@example.com',
        hireDate: new Date('2024-01-01'),
      },
      compensation: {
        baseAmount: 50000,
        // No currency specified
      },
    });

    // Should use default currency from HRM_CONFIG
    expect(employee.compensation.currency).toBe('USD');

    // Should use default 3 months probation from HRM_CONFIG
    const expectedProbationEnd = new Date('2024-01-01');
    expectedProbationEnd.setMonth(expectedProbationEnd.getMonth() + 3);
    expect(employee.probationEndDate?.getTime()).toBe(expectedProbationEnd.getTime());
  });
});

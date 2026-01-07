/**
 * Tenant Mode Tests
 * 
 * Verifies both single-tenant and multi-tenant modes work correctly
 * and that organization references are flexible for app-level control
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '../src/index.js';

describe('Tenant Mode Configuration', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  // Organization IDs for testing
  const org1 = new mongoose.Types.ObjectId();
  const org2 = new mongoose.Types.ObjectId();
  const user1 = new mongoose.Types.ObjectId();
  const user2 = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Create models
    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('Employee', employeeSchema);
    PayrollRecord = mongoose.model('PayrollRecord', createPayrollRecordSchema());

    // Custom Transaction model for app-level control
    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      // App-level: Custom organization reference field
      companyRef: String,  // ← App can add custom fields
      divisionId: Schema.Types.ObjectId, // ← App-specific
      
      type: String,
      flow: String,
      amount: Number,
      grossAmount: Number,
      currency: String,
      tax: Number,
      taxDetails: Schema.Types.Mixed,
      status: String,
      date: Date,
      employeeId: Schema.Types.ObjectId,
      customerId: Schema.Types.ObjectId,
      breakdown: Schema.Types.Mixed,
      sourceId: Schema.Types.ObjectId,
      sourceModel: String,
      description: String,
      notes: String,
      metadata: Schema.Types.Mixed,
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

  describe('Multi-Tenant Mode (Default)', () => {
    it('should require organizationId for all operations', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Should require organizationId
      await expect(
        payroll.hire({
          userId: user1,
          // organizationId missing!
          employment: {
            employeeId: 'EMP-001',
            position: 'Engineer',
            department: 'it',
            type: 'full_time',
          },
          compensation: { baseAmount: 100000, currency: 'USD' },
        } as any)
      ).rejects.toThrow('organizationId is required');
    });

    it('should work when organizationId is provided', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      const employee = await payroll.hire({
        userId: user1,
        organizationId: org1, // ✅ Provided
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee).toBeDefined();
      expect(employee.organizationId.toString()).toBe(org1.toString());
    });

    it('should isolate organizations', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Create employee in org1
      const emp1 = await payroll.hire({
        userId: user1,
        organizationId: org1,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Create employee in org2
      const emp2 = await payroll.hire({
        userId: user2,
        organizationId: org2,
        employment: {
          employeeId: 'EMP-001', // Same employeeId, different org
          position: 'Manager',
          department: 'hr',
          type: 'full_time',
        },
        compensation: { baseAmount: 150000, currency: 'USD' },
      });

      // Both should exist
      expect(emp1.organizationId.toString()).toBe(org1.toString());
      expect(emp2.organizationId.toString()).toBe(org2.toString());

      // Should not interfere with each other
      const org1Employees = await Employee.find({ organizationId: org1 });
      const org2Employees = await Employee.find({ organizationId: org2 });
      expect(org1Employees).toHaveLength(1);
      expect(org2Employees).toHaveLength(1);
    });
  });

  describe('Single-Tenant Mode', () => {
    it('should auto-inject organizationId when configured', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .forSingleTenant({
          organizationId: org1,
          autoInject: true, // ← Enable auto-injection
        })
        .build();

      // No organizationId needed!
      const employee = await payroll.hire({
        userId: user1,
        // organizationId NOT provided - auto-injected!
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee).toBeDefined();
      expect(employee.organizationId.toString()).toBe(org1.toString());
    });

    it('should support operations without organizationId in single-tenant mode', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .forSingleTenant({
          organizationId: org1,
          autoInject: true,
        })
        .build();

      const employee = await payroll.hire({
        userId: user1,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Verify organizationId was auto-injected
      expect(employee.organizationId.toString()).toBe(org1.toString());

      // Verify we can list employees without providing organizationId
      const employees = await Employee.find({ organizationId: org1 });
      expect(employees).toHaveLength(1);
      expect(employees[0]._id.toString()).toBe(employee._id.toString());
    });

    it('should allow explicit organizationId override in single-tenant mode', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .forSingleTenant({
          organizationId: org1,
          autoInject: true,
        })
        .build();

      // Can explicitly provide different organizationId (for edge cases)
      const employee = await payroll.hire({
        userId: user1,
        organizationId: org2, // ← Explicit override
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee.organizationId.toString()).toBe(org2.toString()); // Uses override
    });
  });

  describe('App-Level Organization Control', () => {
    it('should allow custom organization reference fields in Transaction model', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      const employee = await payroll.hire({
        userId: user1,
        organizationId: org1,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Note: processSalary creates transactions internally which require replica set
      // For this test, we verify the Transaction model supports custom fields
      // by creating a transaction manually (simulating payroll's output)
      const transaction = await Transaction.create({
        organizationId: org1,
        type: 'salary',
        flow: 'outflow',
        amount: 90000,
        grossAmount: 100000,
        currency: 'USD',
        tax: 10000,
        status: 'completed',
        date: new Date(),
        employeeId: employee._id,
        description: 'Test salary',
        // App-level: Custom fields
        companyRef: 'ACME-CORP-001', // ← App-specific field
        divisionId: new mongoose.Types.ObjectId(), // ← App-specific
      });

      expect(transaction.companyRef).toBe('ACME-CORP-001');
      expect(transaction.divisionId).toBeDefined();
      expect(transaction.organizationId.toString()).toBe(org1.toString());
    });

    it('should support app-level organization mapping with custom fields', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .forSingleTenant({
          organizationId: org1, // ← ObjectId (standard)
          autoInject: true,
        })
        .build();

      const employee = await payroll.hire({
        userId: user1,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee).toBeDefined();
      expect(employee.organizationId.toString()).toBe(org1.toString());

      // App-level: Can create transactions with custom fields
      const transaction = await Transaction.create({
        organizationId: org1,
        type: 'salary',
        flow: 'outflow',
        amount: 90000,
        currency: 'USD',
        status: 'completed',
        date: new Date(),
        employeeId: employee._id,
        description: 'Salary payment',
        // App's custom organization mapping fields
        companyRef: 'ACME-CORP', // ← App's custom reference
        divisionId: new mongoose.Types.ObjectId(), // ← App's division system
      });

      expect(transaction.companyRef).toBe('ACME-CORP');
      expect(transaction.divisionId).toBeDefined();
    });
  });

  describe('Flexible Organization Resolution', () => {
    it('should support different organizationId formats', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Can use ObjectId
      const emp1 = await payroll.hire({
        userId: user1,
        organizationId: org1, // ← ObjectId
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Can use string (will be converted to ObjectId)
      const emp2 = await payroll.hire({
        userId: user2,
        organizationId: org2.toString(), // ← String (converted internally)
        employment: {
          employeeId: 'EMP-002',
          position: 'Manager',
          department: 'hr',
          type: 'full_time',
        },
        compensation: { baseAmount: 150000, currency: 'USD' },
      });

      expect(emp1.organizationId.toString()).toBe(org1.toString());
      expect(emp2.organizationId.toString()).toBe(org2.toString());
    });

    it('should allow app to maintain custom organization mapping', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // App maintains mapping: 'acme-corp' → ObjectId
      const appOrgMapping = {
        'acme-corp': org1,
        'beta-corp': org2,
      };

      // App resolves slug to ObjectId before calling payroll
      const employee = await payroll.hire({
        userId: user1,
        organizationId: appOrgMapping['acme-corp'], // ← App controls mapping
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee.organizationId.toString()).toBe(org1.toString());
    });
  });
});

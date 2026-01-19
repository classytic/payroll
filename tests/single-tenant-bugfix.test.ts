/**
 * Single-Tenant Bug Fix Tests
 *
 * These tests validate the fixes for the following bugs:
 *
 * HIGH: Single-tenant mode was detected only if organizationId was set in config.
 *       If singleTenant was configured without organizationId, it behaved like multi-tenant.
 *
 * MEDIUM: Auto-inject only worked when singleTenant.autoInject was true AND orgId existed.
 *         Now it throws a clear error if autoInject is enabled but no orgId is configured.
 *
 * FIX: Single-tenant mode is now detected by checking if singleTenantConfig exists,
 *      not by checking if organizationId is set. Clear error messages guide users
 *      to proper configuration.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '../src/index.js';
import { Container } from '../src/core/container.js';
import { resolveOrganizationId } from '../src/utils/org-resolution.js';

describe('Single-Tenant Bug Fixes', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const validOrgId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('STBugFixEmployee', employeeSchema);
    PayrollRecord = mongoose.model('STBugFixPayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      grossAmount: Number,
      currency: String,
      tax: Number,
      status: String,
      date: Date,
      employeeId: Schema.Types.ObjectId,
      description: String,
    });
    Transaction = mongoose.model('STBugFixTransaction', transactionSchema);
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

  describe('Bug Fix: Single-tenant mode detection based on config, not orgId', () => {
    it('should detect single-tenant mode when config exists, even without organizationId', () => {
      // BUG: Previously, isSingleTenant was set to !!containerOrgId
      // FIX: Now it checks if singleTenantConfig exists
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { autoInject: true }, // No organizationId!
      });

      // Should detect as single-tenant even without organizationId
      expect(container.isSingleTenant()).toBe(true);
      expect(container.getSingleTenantConfig()).toBeDefined();
      expect(container.getSingleTenantConfig()?.autoInject).toBe(true);
      expect(container.getOrganizationId()).toBeNull(); // No orgId configured
    });

    it('should properly detect multi-tenant mode when singleTenant config is not provided', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        // No singleTenant config
      });

      expect(container.isSingleTenant()).toBe(false);
      expect(container.getSingleTenantConfig()).toBeNull();
    });
  });

  describe('Bug Fix: Clear error when autoInject enabled without organizationId', () => {
    it('should throw clear error when single-tenant with autoInject but no organizationId', async () => {
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          autoInject: true, // autoInject enabled
          // organizationId NOT provided - this is the bug scenario!
        })
        .build();

      // Should throw a clear, actionable error
      await expect(
        payroll.hire({
          userId,
          employment: {
            employeeId: 'EMP-001',
            position: 'Engineer',
            department: 'it',
            type: 'full_time',
          },
          compensation: { baseAmount: 100000, currency: 'USD' },
        })
      ).rejects.toThrow(/Single-tenant mode with autoInject enabled requires organizationId/);
    });

    it('should work correctly when single-tenant has both autoInject and organizationId', async () => {
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          organizationId: validOrgId,
          autoInject: true,
        })
        .build();

      const employee = await payroll.hire({
        userId,
        // No organizationId needed - should be auto-injected
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee).toBeDefined();
      expect(employee.organizationId.toString()).toBe(validOrgId.toString());
    });
  });

  describe('Bug Fix: Single-tenant with autoInject: false requires explicit orgId', () => {
    it('should require explicit orgId when autoInject is false', async () => {
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          organizationId: validOrgId,
          autoInject: false, // Disabled auto-inject
        })
        .build();

      // Should throw because autoInject is disabled and no explicit orgId provided
      await expect(
        payroll.hire({
          userId,
          // No organizationId - should fail even though single-tenant
          employment: {
            employeeId: 'EMP-001',
            position: 'Engineer',
            department: 'it',
            type: 'full_time',
          },
          compensation: { baseAmount: 100000, currency: 'USD' },
        } as any)
      ).rejects.toThrow(/organizationId is required when autoInject is disabled/);
    });

    it('should work when autoInject: false and explicit orgId is provided', async () => {
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          organizationId: validOrgId,
          autoInject: false,
        })
        .build();

      const employee = await payroll.hire({
        userId,
        organizationId: validOrgId, // Explicit orgId provided
        employment: {
          employeeId: 'EMP-002',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee).toBeDefined();
      expect(employee.organizationId.toString()).toBe(validOrgId.toString());
    });
  });

  describe('Bug Fix: org-resolution utility provides clear error messages', () => {
    it('should throw clear error for single-tenant with autoInject but no orgId', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { autoInject: true }, // No organizationId
      });

      expect(() =>
        resolveOrganizationId({
          container,
          operation: 'processSalary',
        })
      ).toThrow(/Single-tenant mode with autoInject enabled requires organizationId in configuration/);
    });

    it('should throw different error for single-tenant with autoInject: false', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { organizationId: validOrgId, autoInject: false },
      });

      expect(() =>
        resolveOrganizationId({
          container,
          operation: 'processSalary',
        })
      ).toThrow(/autoInject is disabled/);
    });

    it('should throw multi-tenant error when no single-tenant config', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        // No singleTenant config
      });

      expect(() =>
        resolveOrganizationId({
          container,
          operation: 'processSalary',
        })
      ).toThrow(/requires organizationId in multi-tenant mode/);
    });

    it('should resolve successfully when single-tenant with autoInject and orgId', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { organizationId: validOrgId, autoInject: true },
      });

      const resolved = resolveOrganizationId({
        container,
        operation: 'processSalary',
      });

      expect(resolved.toString()).toBe(validOrgId.toString());
    });
  });

  describe('Bug Fix: Container.createOperationContext handles missing orgId', () => {
    it('should throw when autoInject is enabled but no organizationId configured', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { autoInject: true }, // No organizationId
      });

      expect(() => container.createOperationContext()).toThrow(
        /Single-tenant mode with autoInject enabled requires organizationId/
      );
    });

    it('should auto-inject organizationId when properly configured', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { organizationId: validOrgId, autoInject: true },
      });

      const context = container.createOperationContext();
      expect(context.organizationId).toBe(validOrgId.toString());
    });

    it('should not auto-inject when autoInject is false', () => {
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { organizationId: validOrgId, autoInject: false },
      });

      // Should not throw - just doesn't inject
      const context = container.createOperationContext();
      expect(context.organizationId).toBeUndefined();
    });

    it('should use override when provided even with autoInject', () => {
      const overrideOrgId = new mongoose.Types.ObjectId();
      const container = new Container();
      container.initialize({
        models: {
          EmployeeModel: Employee as any,
          PayrollRecordModel: PayrollRecord as any,
          TransactionModel: Transaction as any,
        },
        singleTenant: { organizationId: validOrgId, autoInject: true },
      });

      const context = container.createOperationContext({
        organizationId: overrideOrgId.toString(),
      });

      expect(context.organizationId).toBe(overrideOrgId.toString());
    });
  });

  describe('Bug Fix: getEmployeeByIdentity uses consistent org resolution', () => {
    it('should throw clear error when single-tenant with autoInject but no orgId', async () => {
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          autoInject: true, // No organizationId
        })
        .build();

      await expect(
        payroll.getEmployeeByIdentity({
          identity: 'test@example.com',
          mode: 'email',
        })
      ).rejects.toThrow(/Single-tenant mode with autoInject enabled requires organizationId/);
    });

    it('should work when single-tenant is properly configured', async () => {
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          organizationId: validOrgId,
          autoInject: true,
        })
        .build();

      // First create an employee
      const employee = await payroll.hire({
        userId,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Should find by employeeId without requiring explicit organizationId
      const found = await payroll.getEmployeeByIdentity({
        identity: 'EMP-001',
        mode: 'employeeId',
        populateUser: false, // Skip User model population
      });

      expect(found._id.toString()).toBe(employee._id.toString());
    });
  });

  describe('Recommended single-tenant setup', () => {
    it('should demonstrate correct single-tenant configuration', async () => {
      // RECOMMENDED: Always provide organizationId with autoInject: true
      const payroll = createPayrollInstance()
        .withModels({
          EmployeeModel: Employee,
          PayrollRecordModel: PayrollRecord,
          TransactionModel: Transaction,
        })
        .forSingleTenant({
          organizationId: validOrgId, // <-- Required for auto-inject to work
          autoInject: true, // <-- Default is true, but explicit is clearer
        })
        .build();

      // Now all operations work without explicit organizationId
      const employee = await payroll.hire({
        userId,
        employment: {
          employeeId: 'EMP-DEMO',
          position: 'Demo Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      expect(employee.organizationId.toString()).toBe(validOrgId.toString());

      // getEmployee also works without explicit organizationId
      const found = await payroll.getEmployee({
        employeeId: employee._id,
        populateUser: false,
      });

      expect(found._id.toString()).toBe(employee._id.toString());
    });
  });
});

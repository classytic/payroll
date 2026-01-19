/**
 * Multi-Tenant Service Isolation Tests
 * 
 * Verifies that all services enforce organizationId validation
 * and prevent cross-tenant data access.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Repository } from '@classytic/mongokit';
import { createEmployeeSchema, createPayrollRecordSchema } from '../src/schemas/index.js';
import { employeePlugin } from '../src/plugins/index.js';
import { EmployeeService, createEmployeeService } from '../src/services/employee.service.js';
import { PayrollService, createPayrollService } from '../src/services/payroll.service.js';
import { CompensationService, createCompensationService } from '../src/services/compensation.service.js';
import { multiTenantPlugin } from '../src/core/repository-plugins.js';

describe('Multi-Tenant Service Isolation', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  let PayrollRecordModel: mongoose.Model<any>;

  // Services with org1 context
  let org1EmployeeService: EmployeeService;
  let org1PayrollService: PayrollService;
  let org1CompensationService: CompensationService;

  // Test organizations
  const org1Id = new mongoose.Types.ObjectId();
  const org2Id = new mongoose.Types.ObjectId();

  // Test users
  const user1Id = new mongoose.Types.ObjectId();
  const user2Id = new mongoose.Types.ObjectId();

  // Test employees
  let org1Employee: any;
  let org2Employee: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create models
    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    EmployeeModel = mongoose.model('Employee', employeeSchema);
    PayrollRecordModel = mongoose.model('PayrollRecord', createPayrollRecordSchema());

    // Create repositories with org1 context (multi-tenant plugin)
    const org1EmployeeRepo = new Repository(EmployeeModel, [
      multiTenantPlugin(org1Id),
    ]);
    const org1PayrollRepo = new Repository(PayrollRecordModel, [
      multiTenantPlugin(org1Id),
    ]);

    // Create services with org1 repositories
    org1EmployeeService = createEmployeeService(org1EmployeeRepo);
    org1PayrollService = createPayrollService(org1PayrollRepo, org1EmployeeService);
    org1CompensationService = createCompensationService(org1EmployeeRepo);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database
    await EmployeeModel.deleteMany({});
    await PayrollRecordModel.deleteMany({});

    // Create test employees in different organizations
    org1Employee = await EmployeeModel.create({
      userId: user1Id,
      organizationId: org1Id,
      employeeId: 'ORG1-EMP-001',
      position: 'Engineer',
      department: 'it',
      employmentType: 'full_time',
      status: 'active',
      hireDate: new Date('2024-01-01'),
      compensation: {
        baseAmount: 100000,
        currency: 'USD',
        frequency: 'monthly',
        allowances: [],
        deductions: [],
      },
    });

    org2Employee = await EmployeeModel.create({
      userId: user2Id,
      organizationId: org2Id,
      employeeId: 'ORG2-EMP-001',
      position: 'Manager',
      department: 'hr',
      employmentType: 'full_time',
      status: 'active',
      hireDate: new Date('2024-01-01'),
      compensation: {
        baseAmount: 150000,
        currency: 'USD',
        frequency: 'monthly',
        allowances: [],
        deductions: [],
      },
    });
  });

  describe('EmployeeService Isolation', () => {
    describe('findById()', () => {
      it('should find employee in same organization', async () => {
        // org1EmployeeService has org1Id auto-injected
        const employee = await org1EmployeeService.findById(org1Employee._id);
        expect(employee).toBeTruthy();
        expect(employee!.employeeId).toBe('ORG1-EMP-001');
      });

      it('should NOT find employee from different organization', async () => {
        // Try to access Org 2's employee using Org 1's service (has org1Id auto-injected)
        const employee = await org1EmployeeService.findById(org2Employee._id);
        expect(employee).toBeNull(); // Can't find because organizationId mismatch
      });

      it('should enforce organization isolation on direct access attempt', async () => {
        // Try to access org2's employee with org1's service
        const employee = await org1EmployeeService.findById(org2Employee._id);
        expect(employee).toBeNull(); // Multi-tenant plugin blocks cross-org access
      });
    });

    describe('updateStatus()', () => {
      it('should update status in same organization', async () => {
        const updated = await org1EmployeeService.updateStatus(
          org1Employee._id,
          'on_leave'
        );
        expect(updated.status).toBe('on_leave');
      });

      it('should NOT update status in different organization', async () => {
        await expect(
          org1EmployeeService.updateStatus(org2Employee._id, 'terminated')
        ).rejects.toThrow(); // Should throw because employee not found in org1

        // Verify employee status unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.status).toBe('active'); // Still active
      });
    });

    describe('updateCompensation()', () => {
      it('should update compensation in same organization', async () => {
        const updated = await org1EmployeeService.updateCompensation(
          org1Employee._id,
          { baseAmount: 120000, allowances: [], deductions: [], frequency: 'monthly', currency: 'USD' }
        );
        expect(updated.compensation.baseAmount).toBe(120000);
      });

      it('should NOT update compensation in different organization', async () => {
        await expect(
          org1EmployeeService.updateCompensation(
            org2Employee._id,
            { baseAmount: 999999, allowances: [], deductions: [], frequency: 'monthly', currency: 'USD' } // Attempt to manipulate
          )
        ).rejects.toThrow(); // Should throw because employee not found in org1

        // Verify compensation unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.baseAmount).toBe(150000); // Still original
      });
    });
  });

  describe('CompensationService Isolation', () => {
    describe('updateBaseAmount()', () => {
      it('should update base amount in same organization', async () => {
        const result = await org1CompensationService.updateBaseAmount(
          org1Employee._id,
          110000
        );
        expect(result.baseAmount).toBe(110000);
      });

      it('should NOT update base amount in different organization', async () => {
        await expect(
          org1CompensationService.updateBaseAmount(
            org2Employee._id,
            999999 // Attempt to manipulate
          )
        ).rejects.toThrow(); // Should throw because employee not found in org1

        // Verify unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.baseAmount).toBe(150000);
      });
    });

    describe('addAllowance()', () => {
      it('should add allowance in same organization', async () => {
        const result = await org1CompensationService.addAllowance(
          org1Employee._id,
          { type: 'housing', value: 20000, taxable: true }
        );
        expect(result.allowances).toHaveLength(1);
      });

      it('should NOT add allowance in different organization', async () => {
        await expect(
          org1CompensationService.addAllowance(
            org2Employee._id,
            { type: 'housing', value: 50000, taxable: true }
          )
        ).rejects.toThrow(); // Should throw because employee not found in org1

        // Verify unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.allowances).toHaveLength(0);
      });
    });

    describe('addDeduction()', () => {
      it('should add deduction in same organization', async () => {
        const result = await org1CompensationService.addDeduction(
          org1Employee._id,
          { type: 'insurance', value: 5000, auto: true }
        );
        expect(result.deductions).toHaveLength(1);
      });

      it('should NOT add deduction in different organization', async () => {
        await expect(
          org1CompensationService.addDeduction(
            org2Employee._id,
            { type: 'penalty', value: 99999, auto: true }
          )
        ).rejects.toThrow();

        // Verify unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.deductions).toHaveLength(0);
      });
    });
  });

  describe('PayrollService Isolation', () => {
    let org1Payroll: any;
    let org2Payroll: any;

    beforeEach(async () => {
      // Create payroll records for both organizations
      org1Payroll = await PayrollRecordModel.create({
        employeeId: org1Employee._id,
        organizationId: org1Id,
        userId: user1Id,
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
          payDate: new Date('2024-03-31'),
        },
        breakdown: {
          baseAmount: 100000,
          allowances: [],
          deductions: [],
          grossSalary: 100000,
          netSalary: 90000,
        },
        status: 'processing',
        processedAt: new Date(),
      });

      org2Payroll = await PayrollRecordModel.create({
        employeeId: org2Employee._id,
        organizationId: org2Id,
        userId: user2Id,
        period: {
          month: 3,
          year: 2024,
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-03-31'),
          payDate: new Date('2024-03-31'),
        },
        breakdown: {
          baseAmount: 150000,
          allowances: [],
          deductions: [],
          grossSalary: 150000,
          netSalary: 135000,
        },
        status: 'processing',
        processedAt: new Date(),
      });
    });

    describe('markAsPaid()', () => {
      it('should mark payroll as paid in same organization', async () => {
        const updated = await org1PayrollService.markAsPaid(
          org1Payroll._id,
          { paidAt: new Date() }
        );
        expect(updated.status).toBe('paid');
      });

      it('should NOT mark payroll as paid in different organization', async () => {
        await expect(
          org1PayrollService.markAsPaid(
            org2Payroll._id, // Different org's payroll
            { paidAt: new Date() }
          )
        ).rejects.toThrow(); // Should throw because payroll not found in org1

        // Verify unchanged
        const unchanged = await PayrollRecordModel.findById(org2Payroll._id);
        expect(unchanged!.status).toBe('processing');
      });
    });

    describe('updateStatus()', () => {
      it('should update status in same organization', async () => {
        const updated = await org1PayrollService.updateStatus(
          org1Payroll._id,
          'processing'
        );
        expect(updated.status).toBe('processing');
      });

      it('should NOT update status in different organization', async () => {
        await expect(
          org1PayrollService.updateStatus(
            org2Payroll._id, // Different org's payroll
            'paid'
          )
        ).rejects.toThrow(); // Should throw because payroll not found in org1
      });
    });

    describe('generateForEmployee()', () => {
      it('should generate payroll for employee in same organization', async () => {
        const payroll = await org1PayrollService.generateForEmployee(
          org1Employee._id,
          4,
          2024
        );
        expect(payroll).toBeTruthy();
        expect(payroll.organizationId.toString()).toBe(org1Id.toString());
      });

      it('should NOT generate payroll for employee in different organization', async () => {
        await expect(
          org1PayrollService.generateForEmployee(
            org2Employee._id, // Different org's employee
            4,
            2024
          )
        ).rejects.toThrow(); // Should throw because employee not found in org1
      });
    });
  });

  describe('Cross-Tenant Attack Scenarios', () => {
    it('should prevent salary manipulation across organizations', async () => {
      // Attacker from Org 1 tries to inflate Org 2 employee's salary
      await expect(
        org1CompensationService.updateBaseAmount(
          org2Employee._id,
          999999 // Malicious amount
        )
      ).rejects.toThrow(); // Multi-tenant plugin blocks access

      // Verify target employee unchanged
      const target = await EmployeeModel.findById(org2Employee._id);
      expect(target!.compensation.baseAmount).toBe(150000);
    });

    it('should prevent status manipulation across organizations', async () => {
      // Attacker from Org 1 tries to terminate Org 2 employee
      await expect(
        org1EmployeeService.updateStatus(
          org2Employee._id,
          'terminated'
        )
      ).rejects.toThrow(); // Multi-tenant plugin blocks access

      // Verify target employee still active
      const target = await EmployeeModel.findById(org2Employee._id);
      expect(target!.status).toBe('active');
    });

    it('should prevent payroll payment manipulation across organizations', async () => {
      // Create payroll for Org 2
      const org2Payroll = await PayrollRecordModel.create({
        employeeId: org2Employee._id,
        organizationId: org2Id,
        userId: user2Id,
        period: {
          month: 5,
          year: 2024,
          startDate: new Date('2024-05-01'),
          endDate: new Date('2024-05-31'),
          payDate: new Date('2024-05-31'),
        },
        breakdown: {
          baseAmount: 150000,
          allowances: [],
          deductions: [],
          grossSalary: 150000,
          netSalary: 135000,
        },
        status: 'processing',
        processedAt: new Date(),
      });

      // Attacker from Org 1 tries to mark Org 2's payroll as paid
      await expect(
        org1PayrollService.markAsPaid(
          org2Payroll._id,
          { paidAt: new Date() }
        )
      ).rejects.toThrow(); // Multi-tenant plugin blocks access

      // Verify unchanged
      const target = await PayrollRecordModel.findById(org2Payroll._id);
      expect(target!.status).toBe('processing');
    });
  });

  describe('Same-Org Operations (Positive Tests)', () => {
    it('should allow full compensation workflow within same org', async () => {
      // Update base amount
      await org1CompensationService.updateBaseAmount(org1Employee._id, 110000);

      // Add allowance
      await org1CompensationService.addAllowance(
        org1Employee._id,
        { type: 'housing', value: 20000, taxable: true }
      );

      // Add deduction
      await org1CompensationService.addDeduction(
        org1Employee._id,
        { type: 'insurance', value: 5000, auto: true }
      );

      // Verify all changes applied
      const updated = await EmployeeModel.findById(org1Employee._id);
      expect(updated!.compensation.baseAmount).toBe(110000);
      expect(updated!.compensation.allowances).toHaveLength(1);
      expect(updated!.compensation.deductions).toHaveLength(1);
    });

    it('should allow full payroll workflow within same org', async () => {
      // Generate payroll
      const payroll = await org1PayrollService.generateForEmployee(
        org1Employee._id,
        6,
        2024
      );

      // Update status to processing
      await org1PayrollService.updateStatus(payroll._id, 'processing');

      // Mark as paid
      const paid = await org1PayrollService.markAsPaid(
        payroll._id,
        { paidAt: new Date() }
      );

      expect(paid.status).toBe('paid');
    });
  });
});

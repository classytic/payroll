/**
 * Multi-Tenant Service Isolation Tests
 * 
 * Verifies that all services enforce organizationId validation
 * and prevent cross-tenant data access.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createEmployeeSchema, createPayrollRecordSchema } from '../src/schemas/index.js';
import { employeePlugin } from '../src/plugins/index.js';
import { EmployeeService, createEmployeeService } from '../src/services/employee.service.js';
import { PayrollService, createPayrollService } from '../src/services/payroll.service.js';
import { CompensationService, createCompensationService } from '../src/services/compensation.service.js';

describe('Multi-Tenant Service Isolation', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  let PayrollRecordModel: mongoose.Model<any>;
  let employeeService: EmployeeService;
  let payrollService: PayrollService;
  let compensationService: CompensationService;

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

    // Create services
    employeeService = createEmployeeService(EmployeeModel);
    payrollService = createPayrollService(PayrollRecordModel, employeeService);
    compensationService = createCompensationService(EmployeeModel);
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
        const employee = await employeeService.findById(org1Employee._id, org1Id);
        expect(employee).toBeTruthy();
        expect(employee!.employeeId).toBe('ORG1-EMP-001');
      });

      it('should NOT find employee from different organization', async () => {
        // Try to access Org 2's employee using Org 1's ID
        const employee = await employeeService.findById(org2Employee._id, org1Id);
        expect(employee).toBeNull();
      });

      it('should enforce organization isolation on direct access attempt', async () => {
        // Try to access org2's employee with org1's credentials
        const employee = await employeeService.findById(org2Employee._id, org1Id);
        expect(employee).toBeNull();
      });
    });

    describe('updateStatus()', () => {
      it('should update status in same organization', async () => {
        const updated = await employeeService.updateStatus(
          org1Employee._id,
          org1Id,
          'on_leave'
        );
        expect(updated.status).toBe('on_leave');
      });

      it('should NOT update status in different organization', async () => {
        await expect(
          employeeService.updateStatus(org2Employee._id, org1Id, 'terminated')
        ).rejects.toThrow();

        // Verify employee status unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.status).toBe('active'); // Still active
      });
    });

    describe('updateCompensation()', () => {
      it('should update compensation in same organization', async () => {
        const updated = await employeeService.updateCompensation(
          org1Employee._id,
          org1Id,
          { baseAmount: 120000 }
        );
        expect(updated.compensation.baseAmount).toBe(120000);
      });

      it('should NOT update compensation in different organization', async () => {
        await expect(
          employeeService.updateCompensation(
            org2Employee._id,
            org1Id,
            { baseAmount: 999999 } // Attempt to manipulate
          )
        ).rejects.toThrow();

        // Verify compensation unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.baseAmount).toBe(150000); // Still original
      });
    });
  });

  describe('CompensationService Isolation', () => {
    describe('updateBaseAmount()', () => {
      it('should update base amount in same organization', async () => {
        const result = await compensationService.updateBaseAmount(
          org1Employee._id,
          org1Id,
          110000
        );
        expect(result.baseAmount).toBe(110000);
      });

      it('should NOT update base amount in different organization', async () => {
        await expect(
          compensationService.updateBaseAmount(
            org2Employee._id,
            org1Id,
            999999 // Attempt to manipulate
          )
        ).rejects.toThrow();

        // Verify unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.baseAmount).toBe(150000);
      });
    });

    describe('addAllowance()', () => {
      it('should add allowance in same organization', async () => {
        const result = await compensationService.addAllowance(
          org1Employee._id,
          org1Id,
          { type: 'housing', value: 20000, taxable: true }
        );
        expect(result.allowances).toHaveLength(1);
      });

      it('should NOT add allowance in different organization', async () => {
        await expect(
          compensationService.addAllowance(
            org2Employee._id,
            org1Id,
            { type: 'housing', value: 50000, taxable: true }
          )
        ).rejects.toThrow();

        // Verify unchanged
        const unchanged = await EmployeeModel.findById(org2Employee._id);
        expect(unchanged!.compensation.allowances).toHaveLength(0);
      });
    });

    describe('addDeduction()', () => {
      it('should add deduction in same organization', async () => {
        const result = await compensationService.addDeduction(
          org1Employee._id,
          org1Id,
          { type: 'insurance', value: 5000, auto: true }
        );
        expect(result.deductions).toHaveLength(1);
      });

      it('should NOT add deduction in different organization', async () => {
        await expect(
          compensationService.addDeduction(
            org2Employee._id,
            org1Id,
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
        const updated = await payrollService.markAsPaid(
          org1Payroll._id,
          org1Id,
          { paidAt: new Date() }
        );
        expect(updated.status).toBe('paid');
      });

      it('should NOT mark payroll as paid in different organization', async () => {
        await expect(
          payrollService.markAsPaid(
            org2Payroll._id,
            org1Id, // Wrong org!
            { paidAt: new Date() }
          )
        ).rejects.toThrow();

        // Verify unchanged
        const unchanged = await PayrollRecordModel.findById(org2Payroll._id);
        expect(unchanged!.status).toBe('processing');
      });
    });

    describe('markAsProcessed()', () => {
      it('should mark payroll as processed in same organization', async () => {
        const updated = await payrollService.markAsProcessed(
          org1Payroll._id,
          org1Id
        );
        expect(updated.status).toBe('processing');
      });

      it('should NOT mark payroll as processed in different organization', async () => {
        await expect(
          payrollService.markAsProcessed(
            org2Payroll._id,
            org1Id // Wrong org!
          )
        ).rejects.toThrow();
      });
    });

    describe('generateForEmployee()', () => {
      it('should generate payroll for employee in same organization', async () => {
        const payroll = await payrollService.generateForEmployee(
          org1Employee._id,
          org1Id,
          4,
          2024
        );
        expect(payroll).toBeTruthy();
        expect(payroll.organizationId.toString()).toBe(org1Id.toString());
      });

      it('should NOT generate payroll for employee in different organization', async () => {
        await expect(
          payrollService.generateForEmployee(
            org2Employee._id,
            org1Id, // Wrong org!
            4,
            2024
          )
        ).rejects.toThrow();
      });
    });
  });

  describe('Cross-Tenant Attack Scenarios', () => {
    it('should prevent salary manipulation across organizations', async () => {
      // Attacker from Org 1 tries to inflate Org 2 employee's salary
      await expect(
        compensationService.updateBaseAmount(
          org2Employee._id,
          org1Id, // Attacker's org
          999999 // Malicious amount
        )
      ).rejects.toThrow();

      // Verify target employee unchanged
      const target = await EmployeeModel.findById(org2Employee._id);
      expect(target!.compensation.baseAmount).toBe(150000);
    });

    it('should prevent status manipulation across organizations', async () => {
      // Attacker from Org 1 tries to terminate Org 2 employee
      await expect(
        employeeService.updateStatus(
          org2Employee._id,
          org1Id,
          'terminated'
        )
      ).rejects.toThrow();

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
        payrollService.markAsPaid(
          org2Payroll._id,
          org1Id, // Attacker's org
          { paidAt: new Date() }
        )
      ).rejects.toThrow();

      // Verify unchanged
      const target = await PayrollRecordModel.findById(org2Payroll._id);
      expect(target!.status).toBe('processing');
    });
  });

  describe('Same-Org Operations (Positive Tests)', () => {
    it('should allow full compensation workflow within same org', async () => {
      // Update base amount
      await compensationService.updateBaseAmount(org1Employee._id, org1Id, 110000);

      // Add allowance
      await compensationService.addAllowance(
        org1Employee._id,
        org1Id,
        { type: 'housing', value: 20000, taxable: true }
      );

      // Add deduction
      await compensationService.addDeduction(
        org1Employee._id,
        org1Id,
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
      const payroll = await payrollService.generateForEmployee(
        org1Employee._id,
        org1Id,
        6,
        2024
      );

      // Mark as processed
      await payrollService.markAsProcessed(payroll._id, org1Id);

      // Mark as paid
      const paid = await payrollService.markAsPaid(
        payroll._id,
        org1Id,
        { paidAt: new Date() }
      );

      expect(paid.status).toBe('paid');
    });
  });
});

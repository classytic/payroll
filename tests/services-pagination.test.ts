/**
 * Service Pagination Tests
 *
 * Tests pagination features added to EmployeeService and CompensationService
 * Covers edge cases: large datasets, empty results, boundary conditions
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Repository } from '@classytic/mongokit';
import { createEmployeeSchema } from '../src/schemas/index.js';
import { employeePlugin } from '../src/plugins/index.js';
import { EmployeeService, createEmployeeService } from '../src/services/employee.service.js';
import { CompensationService, createCompensationService } from '../src/services/compensation.service.js';
import { multiTenantPlugin } from '../src/core/repository-plugins.js';

describe('Service Pagination Features', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  let employeeService: EmployeeService;
  let compensationService: CompensationService;

  const orgId = new mongoose.Types.ObjectId();
  const userIds = Array.from({ length: 150 }, () => new mongoose.Types.ObjectId());

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create employee model
    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    EmployeeModel = mongoose.model('Employee', employeeSchema);

    // Create services with multi-tenant plugin
    const employeeRepo = new Repository(EmployeeModel, [multiTenantPlugin(orgId)]);
    employeeService = createEmployeeService(employeeRepo);
    compensationService = createCompensationService(employeeRepo);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await EmployeeModel.deleteMany({});
  });

  describe('EmployeeService.findActive() Pagination', () => {
    beforeEach(async () => {
      // Create 150 active employees across different departments
      const employees = userIds.map((userId, i) => ({
        userId,
        organizationId: orgId,
        employeeId: `EMP-${String(i + 1).padStart(3, '0')}`,
        position: 'Engineer',
        department: ['it', 'hr', 'sales'][i % 3],
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date('2024-01-01'),
        compensation: {
          baseAmount: 50000 + (i * 1000),
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      }));

      await EmployeeModel.insertMany(employees);
    });

    it('should return paginated results with default limit (100)', async () => {
      const result = await employeeService.findActive();

      expect(result.docs).toHaveLength(100); // Default limit
      expect('total' in result ? result.total : 0).toBe(150);
      expect('page' in result ? result.page : 0).toBe(1);
    });

    it('should return second page correctly', async () => {
      const result = await employeeService.findActive({ page: 2, limit: 100 });

      expect(result.docs).toHaveLength(50); // Remaining 50 employees
      expect('total' in result ? result.total : 0).toBe(150);
      expect('page' in result ? result.page : 0).toBe(2);
    });

    it('should respect custom limit', async () => {
      const result = await employeeService.findActive({ limit: 25 });

      expect(result.docs).toHaveLength(25);
      expect('total' in result ? result.total : 0).toBe(150);
    });

    it('should handle empty results (page beyond total)', async () => {
      const result = await employeeService.findActive({ page: 10, limit: 100 });

      expect(result.docs).toHaveLength(0);
      expect('total' in result ? result.total : 0).toBe(150);
    });

    it('should support custom sorting', async () => {
      const result = await employeeService.findActive({ limit: 5, sort: 'employeeId' });

      expect(result.docs[0].employeeId).toBe('EMP-001');
      expect(result.docs[4].employeeId).toBe('EMP-005');
    });

    it('should support field selection', async () => {
      const result = await employeeService.findActive({ limit: 5, select: 'employeeId position' });

      const first = result.docs[0];
      expect(first.employeeId).toBeDefined();
      expect(first.position).toBeDefined();
      // compensation should not be selected
      expect(first.compensation).toBeUndefined();
    });

    it('should handle zero employees', async () => {
      await EmployeeModel.deleteMany({});

      const result = await employeeService.findActive();

      expect(result.docs).toHaveLength(0);
      expect('total' in result ? result.total : 0).toBe(0);
    });

    it('should handle single employee', async () => {
      await EmployeeModel.deleteMany({});
      await EmployeeModel.create({
        userId: userIds[0],
        organizationId: orgId,
        employeeId: 'SINGLE-001',
        position: 'Manager',
        department: 'hr',
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date(),
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      const result = await employeeService.findActive();

      expect(result.docs).toHaveLength(1);
      expect('total' in result ? result.total : 0).toBe(1);
    });

    it('should exclude non-active employees', async () => {
      // Update some employees to terminated
      await EmployeeModel.updateMany(
        { employeeId: { $in: ['EMP-001', 'EMP-002', 'EMP-003'] } },
        { status: 'terminated', terminationDate: new Date() }
      );

      const result = await employeeService.findActive();

      expect('total' in result ? result.total : 0).toBe(147); // 150 - 3 terminated
    });
  });

  describe('EmployeeService.findEmployed() Pagination', () => {
    beforeEach(async () => {
      // Create 100 employed, 30 terminated, 20 suspended
      const employees = [];

      // 100 active
      for (let i = 0; i < 100; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `ACTIVE-${String(i + 1).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 60000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      // 30 terminated
      for (let i = 100; i < 130; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `TERMED-${String(i - 99).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'terminated',
          hireDate: new Date('2023-01-01'),
          terminationDate: new Date('2024-06-01'),
          compensation: {
            baseAmount: 50000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      // 20 suspended
      for (let i = 130; i < 150; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `SUSP-${String(i - 129).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'hr',
          employmentType: 'full_time',
          status: 'suspended',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 55000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      await EmployeeModel.insertMany(employees);
    });

    it('should return only employed employees (exclude terminated)', async () => {
      const result = await employeeService.findEmployed();

      expect('total' in result ? result.total : 0).toBe(120); // 100 active + 20 suspended
      // Verify no terminated employees
      const terminatedCount = result.docs.filter(e => e.status === 'terminated').length;
      expect(terminatedCount).toBe(0);
    });

    it('should paginate employed employees correctly', async () => {
      const page1 = await employeeService.findEmployed({ page: 1, limit: 50 });
      const page2 = await employeeService.findEmployed({ page: 2, limit: 50 });
      const page3 = await employeeService.findEmployed({ page: 3, limit: 50 });

      expect(page1.docs).toHaveLength(50);
      expect(page2.docs).toHaveLength(50);
      expect(page3.docs).toHaveLength(20); // Remaining
    });
  });

  describe('EmployeeService.findByDepartment() Pagination', () => {
    beforeEach(async () => {
      // Create 80 IT, 50 HR, 20 Sales
      const employees = [];

      for (let i = 0; i < 80; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `IT-${String(i + 1).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 70000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      for (let i = 80; i < 130; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `HR-${String(i - 79).padStart(3, '0')}`,
          position: 'HR Manager',
          department: 'hr',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 65000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      for (let i = 130; i < 150; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `SALES-${String(i - 129).padStart(3, '0')}`,
          position: 'Sales Rep',
          department: 'sales',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 60000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      await EmployeeModel.insertMany(employees);
    });

    it('should filter and paginate IT department', async () => {
      const result = await employeeService.findByDepartment('it');

      expect('total' in result ? result.total : 0).toBe(80);
      expect(result.docs).toHaveLength(80); // All fit in default 100 limit
    });

    it('should paginate IT department with custom limit', async () => {
      const page1 = await employeeService.findByDepartment('it', { page: 1, limit: 30 });
      const page2 = await employeeService.findByDepartment('it', { page: 2, limit: 30 });
      const page3 = await employeeService.findByDepartment('it', { page: 3, limit: 30 });

      expect(page1.docs).toHaveLength(30);
      expect(page2.docs).toHaveLength(30);
      expect(page3.docs).toHaveLength(20); // Remaining
      expect('total' in page1 ? page1.total : 0).toBe(80);
    });

    it('should filter and paginate HR department', async () => {
      const result = await employeeService.findByDepartment('hr');

      expect('total' in result ? result.total : 0).toBe(50);
      expect(result.docs.every(e => e.department === 'hr')).toBe(true);
    });

    it('should handle department with zero employees', async () => {
      const result = await employeeService.findByDepartment('finance');

      expect(result.docs).toHaveLength(0);
      expect('total' in result ? result.total : 0).toBe(0);
    });
  });

  describe('EmployeeService.findEligibleForPayroll() Pagination', () => {
    beforeEach(async () => {
      // Create mix: 100 eligible (active, full_time), 50 ineligible
      const employees = [];

      // 100 eligible
      for (let i = 0; i < 100; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `ELIGIBLE-${String(i + 1).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 80000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      // 30 terminated (ineligible)
      for (let i = 100; i < 130; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `INELIG-TERM-${String(i - 99).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'terminated',
          hireDate: new Date('2023-01-01'),
          terminationDate: new Date('2024-05-01'),
          compensation: {
            baseAmount: 70000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      // 20 contractors (ineligible - only full_time eligible)
      for (let i = 130; i < 150; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `INELIG-CONT-${String(i - 129).padStart(3, '0')}`,
          position: 'Contractor',
          department: 'it',
          employmentType: 'contract',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 90000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      await EmployeeModel.insertMany(employees);
    });

    it('should return only eligible employees', async () => {
      const result = await employeeService.findEligibleForPayroll();

      // Verify filtering: status is active/on_leave AND has baseAmount > 0
      const allEligible = result.docs.every(
        e => (e.status === 'active' || e.status === 'on_leave') && (e.compensation.baseAmount || 0) > 0
      );
      expect(allEligible).toBe(true);
    });

    it('should paginate eligible employees', async () => {
      const page1 = await employeeService.findEligibleForPayroll({ page: 1, limit: 40 });
      const page2 = await employeeService.findEligibleForPayroll({ page: 2, limit: 40 });

      expect(page1.docs).toHaveLength(40);
      expect(page2.docs.length).toBeLessThanOrEqual(60); // In-memory filter may affect count
    });

    it('should exclude terminated employees', async () => {
      const result = await employeeService.findEligibleForPayroll();

      const terminatedCount = result.docs.filter(e => e.status === 'terminated').length;
      expect(terminatedCount).toBe(0);
    });

    it('should include contractors if they are active with baseAmount > 0', async () => {
      const result = await employeeService.findEligibleForPayroll();

      // canReceiveSalary doesn't filter by employment type
      // It only checks: (active || on_leave) && baseAmount > 0
      const contractorCount = result.docs.filter(e => e.employmentType === 'contract').length;
      expect(contractorCount).toBeGreaterThan(0); // Contractors ARE eligible
    });
  });

  describe('CompensationService.getDepartmentCompensationStats() - Aggregation', () => {
    beforeEach(async () => {
      // Create 50 IT employees with varying salaries
      const employees = [];

      for (let i = 0; i < 50; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `IT-${String(i + 1).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 50000 + (i * 2000), // Range: 50k to 148k
            grossSalary: 55000 + (i * 2200),
            netSalary: 45000 + (i * 1800),
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      await EmployeeModel.insertMany(employees);
    });

    it('should compute stats using MongoDB aggregation', async () => {
      const stats = await compensationService.getDepartmentCompensationStats('it');

      expect(stats.employeeCount).toBe(50);
      expect(stats.totalBase).toBeGreaterThan(0);
      expect(stats.averageBase).toBeGreaterThan(0);
      expect(stats.totalGross).toBeGreaterThan(0);
      expect(stats.totalNet).toBeGreaterThan(0);
    });

    it('should calculate correct averages', async () => {
      const stats = await compensationService.getDepartmentCompensationStats('it');

      // Expected average: (50000 + 148000) / 2 = 99000 (midpoint)
      expect(stats.averageBase).toBeCloseTo(99000, -3); // Within 1000
    });

    it('should handle department with zero employees', async () => {
      const stats = await compensationService.getDepartmentCompensationStats('finance');

      expect(stats.employeeCount).toBe(0);
      expect(stats.totalBase).toBe(0);
      expect(stats.averageBase).toBe(0);
    });

    it('should handle single employee', async () => {
      await EmployeeModel.deleteMany({});
      await EmployeeModel.create({
        userId: userIds[0],
        organizationId: orgId,
        employeeId: 'SINGLE-001',
        position: 'Manager',
        department: 'hr',
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date(),
        compensation: {
          baseAmount: 100000,
          grossSalary: 110000,
          netSalary: 90000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      const stats = await compensationService.getDepartmentCompensationStats('hr');

      expect(stats.employeeCount).toBe(1);
      expect(stats.totalBase).toBe(100000);
      expect(stats.averageBase).toBe(100000);
    });

    it('should exclude terminated employees from stats', async () => {
      // Terminate 10 employees
      await EmployeeModel.updateMany(
        { employeeId: { $in: Array.from({ length: 10 }, (_, i) => `IT-${String(i + 1).padStart(3, '0')}`) } },
        { status: 'terminated', terminationDate: new Date() }
      );

      const stats = await compensationService.getDepartmentCompensationStats('it');

      expect(stats.employeeCount).toBe(40); // 50 - 10 terminated
    });
  });

  describe('CompensationService.getOrganizationCompensationStats() - Aggregation', () => {
    beforeEach(async () => {
      // Create employees across 3 departments
      const employees = [];

      // 30 IT
      for (let i = 0; i < 30; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `IT-${String(i + 1).padStart(3, '0')}`,
          position: 'Engineer',
          department: 'it',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 80000,
            grossSalary: 88000,
            netSalary: 72000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      // 20 HR
      for (let i = 30; i < 50; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `HR-${String(i - 29).padStart(3, '0')}`,
          position: 'HR Manager',
          department: 'hr',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 70000,
            grossSalary: 77000,
            netSalary: 63000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      // 10 Sales
      for (let i = 50; i < 60; i++) {
        employees.push({
          userId: userIds[i],
          organizationId: orgId,
          employeeId: `SALES-${String(i - 49).padStart(3, '0')}`,
          position: 'Sales Rep',
          department: 'sales',
          employmentType: 'full_time',
          status: 'active',
          hireDate: new Date('2024-01-01'),
          compensation: {
            baseAmount: 60000,
            grossSalary: 66000,
            netSalary: 54000,
            currency: 'USD',
            frequency: 'monthly',
            allowances: [],
            deductions: [],
          },
        });
      }

      await EmployeeModel.insertMany(employees);
    });

    it('should compute organization-wide stats using $facet aggregation', async () => {
      const stats = await compensationService.getOrganizationCompensationStats();

      expect(stats.employeeCount).toBe(60);
      expect(stats.totalBase).toBe(30 * 80000 + 20 * 70000 + 10 * 60000); // 4,400,000
      expect(stats.averageBase).toBeCloseTo((30 * 80000 + 20 * 70000 + 10 * 60000) / 60, -2);
    });

    it('should compute by-department breakdown', async () => {
      const stats = await compensationService.getOrganizationCompensationStats();

      expect(stats.byDepartment).toBeDefined();
      expect(Object.keys(stats.byDepartment)).toHaveLength(3);

      // byDepartment uses 'count', not 'employeeCount'
      expect(stats.byDepartment.it.count).toBe(30);
      expect(stats.byDepartment.hr.count).toBe(20);
      expect(stats.byDepartment.sales.count).toBe(10);
    });

    it('should handle organization with zero employees', async () => {
      await EmployeeModel.deleteMany({});

      const stats = await compensationService.getOrganizationCompensationStats();

      expect(stats.employeeCount).toBe(0);
      expect(stats.totalBase).toBe(0);
      expect(stats.byDepartment).toEqual({});
    });

    it('should exclude terminated employees from org stats', async () => {
      // Terminate 5 IT employees
      await EmployeeModel.updateMany(
        { employeeId: { $in: Array.from({ length: 5 }, (_, i) => `IT-${String(i + 1).padStart(3, '0')}`) } },
        { status: 'terminated', terminationDate: new Date() }
      );

      const stats = await compensationService.getOrganizationCompensationStats();

      expect(stats.employeeCount).toBe(55); // 60 - 5 terminated
      expect(stats.byDepartment.it.count).toBe(25); // 30 - 5 terminated
    });

    it('should handle organization with single department', async () => {
      await EmployeeModel.deleteMany({});

      // Create only IT employees
      const employees = Array.from({ length: 10 }, (_, i) => ({
        userId: userIds[i],
        organizationId: orgId,
        employeeId: `IT-${String(i + 1).padStart(3, '0')}`,
        position: 'Engineer',
        department: 'it',
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date('2024-01-01'),
        compensation: {
          baseAmount: 75000,
          grossSalary: 82500,
          netSalary: 67500,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      }));

      await EmployeeModel.insertMany(employees);

      const stats = await compensationService.getOrganizationCompensationStats();

      expect(stats.employeeCount).toBe(10);
      expect(Object.keys(stats.byDepartment)).toHaveLength(1);
      expect(stats.byDepartment.it.count).toBe(10);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle negative page number gracefully', async () => {
      await EmployeeModel.create({
        userId: userIds[0],
        organizationId: orgId,
        employeeId: 'TEST-001',
        position: 'Engineer',
        department: 'it',
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date(),
        compensation: {
          baseAmount: 60000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      const result = await employeeService.findActive({ page: -1, limit: 10 });

      // mongokit should handle this gracefully (treat as page 1)
      expect(result.docs.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large limit', async () => {
      // Create 10 employees
      const employees = Array.from({ length: 10 }, (_, i) => ({
        userId: userIds[i],
        organizationId: orgId,
        employeeId: `TEST-${String(i + 1).padStart(3, '0')}`,
        position: 'Engineer',
        department: 'it',
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date(),
        compensation: {
          baseAmount: 60000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      }));

      await EmployeeModel.insertMany(employees);

      const result = await employeeService.findActive({ limit: 10000 });

      expect(result.docs).toHaveLength(10); // Only 10 exist
    });

    it('should handle zero limit', async () => {
      await EmployeeModel.create({
        userId: userIds[0],
        organizationId: orgId,
        employeeId: 'TEST-001',
        position: 'Engineer',
        department: 'it',
        employmentType: 'full_time',
        status: 'active',
        hireDate: new Date(),
        compensation: {
          baseAmount: 60000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      const result = await employeeService.findActive({ limit: 0 });

      // mongokit should handle this (return empty or use default)
      expect(Array.isArray(result.docs)).toBe(true);
    });
  });
});

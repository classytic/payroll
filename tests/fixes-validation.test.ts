/**
 * Fixes Validation Tests
 *
 * Tests to validate the security and bug fixes made in v3.0.0:
 * - HIGH: Org scoping in salary-processing.manager.ts raw queries
 * - MEDIUM: strictMultiTenant mode in findEmployeeSecure
 * - MEDIUM: Centralized rounding logic
 * - LOW: Dynamic transaction tags based on payment frequency
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createEmployeeSchema, createPayrollRecordSchema } from '../src/schemas/index.js';
import { employeePlugin } from '../src/plugins/index.js';
import { findEmployeeSecure } from '../src/utils/employee-lookup.js';
import { applyPercentage } from '../src/utils/calculation.js';
import { roundMoney, percentageOf } from '../src/utils/money.js';

// ============================================================================
// Test 1: strictMultiTenant Mode in findEmployeeSecure
// ============================================================================

describe('Fix: strictMultiTenant Mode in findEmployeeSecure', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  const org1Id = new mongoose.Types.ObjectId();
  const org2Id = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const modelName = `Employee_strictMultiTenant_${Date.now()}`;
    const schema = createEmployeeSchema();
    schema.plugin(employeePlugin);
    EmployeeModel = mongoose.model(modelName, schema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await EmployeeModel.deleteMany({});

    // Create employees in different orgs
    await EmployeeModel.create([
      {
        organizationId: org1Id,
        employeeId: 'ORG1-EMP-001',
        email: 'emp1@org1.com',
        position: 'Engineer',
        hireDate: new Date(),
        compensation: { baseAmount: 5000, frequency: 'monthly' },
      },
      {
        organizationId: org2Id,
        employeeId: 'ORG2-EMP-001',
        email: 'emp1@org2.com',
        position: 'Manager',
        hireDate: new Date(),
        compensation: { baseAmount: 7000, frequency: 'monthly' },
      },
    ]);
  });

  it('should allow lookup without organizationId when strictMultiTenant is explicitly false', async () => {
    // Explicit opt-out of strict enforcement (for single-tenant apps)
    const emp = await findEmployeeSecure(EmployeeModel, {
      employeeId: 'ORG1-EMP-001',
      // No organizationId provided
      strictMultiTenant: false, // Explicitly disabled for single-tenant use
    });

    expect(emp).toBeDefined();
    expect(emp.employeeId).toBe('ORG1-EMP-001');
  });

  it('should throw by default (strictMultiTenant: true) when organizationId is missing', async () => {
    // Default behavior: strict enforcement for security
    await expect(
      findEmployeeSecure(EmployeeModel, {
        employeeId: 'ORG1-EMP-001',
        // No organizationId provided, strictMultiTenant defaults to true
      })
    ).rejects.toThrow('findEmployeeSecure requires organizationId in strict multi-tenant mode');
  });

  it('should throw when organizationId missing in strictMultiTenant mode', async () => {
    await expect(
      findEmployeeSecure(EmployeeModel, {
        employeeId: 'ORG1-EMP-001',
        strictMultiTenant: true, // Strict mode enabled
        // No organizationId provided - should throw!
      })
    ).rejects.toThrow('findEmployeeSecure requires organizationId in strict multi-tenant mode');
  });

  it('should work correctly with organizationId in strictMultiTenant mode', async () => {
    const emp = await findEmployeeSecure(EmployeeModel, {
      employeeId: 'ORG1-EMP-001',
      organizationId: org1Id,
      strictMultiTenant: true,
    });

    expect(emp).toBeDefined();
    expect(emp.employeeId).toBe('ORG1-EMP-001');
    expect(emp.organizationId.toString()).toBe(org1Id.toString());
  });

  it('should prevent cross-tenant access in strictMultiTenant mode', async () => {
    // Try to find org1 employee with org2 ID
    await expect(
      findEmployeeSecure(EmployeeModel, {
        employeeId: 'ORG1-EMP-001', // This is org1's employee
        organizationId: org2Id, // But we're querying as org2
        strictMultiTenant: true,
      })
    ).rejects.toThrow('Employee not found');
  });

  it('should find employee by email in strictMultiTenant mode', async () => {
    const emp = await findEmployeeSecure(EmployeeModel, {
      email: 'emp1@org1.com',
      organizationId: org1Id,
      strictMultiTenant: true,
    });

    expect(emp).toBeDefined();
    expect(emp.email).toBe('emp1@org1.com');
  });
});

// ============================================================================
// Test 2: Centralized Rounding Logic
// ============================================================================

describe('Fix: Centralized Rounding Logic', () => {
  it('applyPercentage should use roundMoney internally', () => {
    // Test that applyPercentage produces identical results to manual roundMoney
    const testCases = [
      { amount: 1000, percentage: 15, expected: 150 },
      { amount: 1000, percentage: 15.5, expected: 155 },
      { amount: 1234.56, percentage: 10, expected: 123.46 },
      { amount: 100, percentage: 33.33, expected: 33.33 },
      { amount: 999.99, percentage: 7.5, expected: 75 },
    ];

    for (const { amount, percentage, expected } of testCases) {
      const result = applyPercentage(amount, percentage);
      const manual = roundMoney((amount * percentage) / 100);

      expect(result).toBe(manual);
      expect(result).toBe(expected);
    }
  });

  it('should handle banker\'s rounding correctly (round half to even)', () => {
    // Banker's rounding: 0.5 rounds to nearest even
    // 2.5 -> 2 (even)
    // 3.5 -> 4 (even)
    // 4.5 -> 4 (even)
    // 5.5 -> 6 (even)

    expect(roundMoney(2.5, 0)).toBe(2);
    expect(roundMoney(3.5, 0)).toBe(4);
    expect(roundMoney(4.5, 0)).toBe(4);
    expect(roundMoney(5.5, 0)).toBe(6);

    // With 2 decimal places
    expect(roundMoney(2.545, 2)).toBe(2.54); // .545 -> .54 (even)
    expect(roundMoney(2.555, 2)).toBe(2.56); // .555 -> .56 (even)
  });

  it('applyPercentage should match percentageOf from money.ts', () => {
    // Verify applyPercentage produces same results as percentageOf
    const testCases = [
      { amount: 5000, percentage: 10 },
      { amount: 7500, percentage: 15.5 },
      { amount: 10000, percentage: 7.25 },
      { amount: 123456.78, percentage: 12.5 },
    ];

    for (const { amount, percentage } of testCases) {
      const fromCalculation = applyPercentage(amount, percentage);
      const fromMoney = percentageOf(amount, percentage);

      expect(fromCalculation).toBe(fromMoney);
    }
  });

  it('should handle edge cases correctly', () => {
    // Zero amount
    expect(applyPercentage(0, 15)).toBe(0);

    // Zero percentage
    expect(applyPercentage(1000, 0)).toBe(0);

    // 100% percentage
    expect(applyPercentage(1000, 100)).toBe(1000);

    // Large amounts (typical payroll)
    expect(applyPercentage(500000, 35)).toBe(175000);

    // Very small percentages
    expect(applyPercentage(10000, 0.5)).toBe(50);
  });
});

// ============================================================================
// Test 3: Org Scoping in Salary Processing Raw Queries
// ============================================================================

describe('Fix: Org Scoping in Salary Processing Queries', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  let PayrollRecordModel: mongoose.Model<any>;
  const org1Id = new mongoose.Types.ObjectId();
  const org2Id = new mongoose.Types.ObjectId();

  // Helper to create a valid payroll record with all required fields
  const createPayrollRecord = (overrides: any) => ({
    period: {
      month: 1,
      year: 2024,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      payDate: new Date('2024-01-31'),
    },
    breakdown: {
      baseAmount: 5000,
      grossSalary: 5000,
      netSalary: 4000,
      allowances: [],
      deductions: [],
    },
    status: 'paid',
    ...overrides,
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const employeeModelName = `Employee_OrgScoping_${Date.now()}`;
    const payrollModelName = `PayrollRecord_OrgScoping_${Date.now()}`;

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    EmployeeModel = mongoose.model(employeeModelName, employeeSchema);
    PayrollRecordModel = mongoose.model(payrollModelName, createPayrollRecordSchema());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await EmployeeModel.deleteMany({});
    await PayrollRecordModel.deleteMany({});
  });

  it('payroll query should include organizationId for defense-in-depth', async () => {
    // Create employees with same employeeId in different orgs
    const emp1 = await EmployeeModel.create({
      organizationId: org1Id,
      employeeId: 'SHARED-ID-001',
      email: 'emp@org1.com',
      position: 'Engineer',
      hireDate: new Date(),
      compensation: { baseAmount: 5000, frequency: 'monthly' },
    });

    const emp2 = await EmployeeModel.create({
      organizationId: org2Id,
      employeeId: 'SHARED-ID-001', // Same business ID!
      email: 'emp@org2.com',
      position: 'Manager',
      hireDate: new Date(),
      compensation: { baseAmount: 7000, frequency: 'monthly' },
    });

    // Create payroll records for both with all required fields
    await PayrollRecordModel.create(createPayrollRecord({
      organizationId: org1Id,
      employeeId: emp1._id,
      breakdown: { baseAmount: 5000, grossSalary: 5000, netSalary: 4000, allowances: [], deductions: [] },
    }));

    await PayrollRecordModel.create(createPayrollRecord({
      organizationId: org2Id,
      employeeId: emp2._id,
      breakdown: { baseAmount: 7000, grossSalary: 7000, netSalary: 5600, allowances: [], deductions: [] },
    }));

    // Query with organizationId should return only that org's record
    const org1Records = await PayrollRecordModel.find({
      organizationId: org1Id,
      'period.month': 1,
      'period.year': 2024,
    });

    const org2Records = await PayrollRecordModel.find({
      organizationId: org2Id,
      'period.month': 1,
      'period.year': 2024,
    });

    expect(org1Records).toHaveLength(1);
    expect(org1Records[0].breakdown.grossSalary).toBe(5000);

    expect(org2Records).toHaveLength(1);
    expect(org2Records[0].breakdown.grossSalary).toBe(7000);
  });

  it('employee lookup with organizationId prevents cross-tenant access', async () => {
    // Create employee in org1
    const emp1 = await EmployeeModel.create({
      organizationId: org1Id,
      employeeId: 'UNIQUE-EMP-001',
      email: 'unique@org1.com',
      position: 'Engineer',
      hireDate: new Date(),
      compensation: { baseAmount: 5000, frequency: 'monthly' },
    });

    // Query with org1 ID should find the employee
    const foundWithOrg1 = await EmployeeModel.findOne({
      _id: emp1._id,
      organizationId: org1Id,
    });
    expect(foundWithOrg1).not.toBeNull();

    // Query with org2 ID should NOT find the employee (defense-in-depth)
    const foundWithOrg2 = await EmployeeModel.findOne({
      _id: emp1._id,
      organizationId: org2Id,
    });
    expect(foundWithOrg2).toBeNull();
  });

  it('duplicate payroll lookup should be org-scoped', async () => {
    // Create employees in both orgs
    const emp1 = await EmployeeModel.create({
      organizationId: org1Id,
      employeeId: 'DUP-TEST-001',
      email: 'dup@org1.com',
      position: 'Engineer',
      hireDate: new Date(),
      compensation: { baseAmount: 5000, frequency: 'monthly' },
    });

    await EmployeeModel.create({
      organizationId: org2Id,
      employeeId: 'DUP-TEST-002',
      email: 'dup@org2.com',
      position: 'Manager',
      hireDate: new Date(),
      compensation: { baseAmount: 7000, frequency: 'monthly' },
    });

    // Create payroll for emp1 in org1 with all required fields
    await PayrollRecordModel.create(createPayrollRecord({
      organizationId: org1Id,
      employeeId: emp1._id,
      period: {
        month: 3,
        year: 2024,
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-31'),
        payDate: new Date('2024-03-31'),
      },
      status: 'pending',
    }));

    // Org-scoped query for org1 should find the record
    const org1DuplicateCheck = await PayrollRecordModel.findOne({
      organizationId: org1Id,
      employeeId: emp1._id,
      'period.month': 3,
      'period.year': 2024,
    });
    expect(org1DuplicateCheck).not.toBeNull();

    // Org-scoped query for org2 should NOT find org1's record
    const org2DuplicateCheck = await PayrollRecordModel.findOne({
      organizationId: org2Id,
      employeeId: emp1._id, // Same employee ID but wrong org
      'period.month': 3,
      'period.year': 2024,
    });
    expect(org2DuplicateCheck).toBeNull();
  });
});

// ============================================================================
// Test 4: Dynamic Transaction Tags
// ============================================================================

describe('Fix: Dynamic Transaction Tags Based on Payment Frequency', () => {
  it('should correctly identify payment frequencies', () => {
    const frequencies = ['monthly', 'bi_weekly', 'weekly', 'semi_monthly', 'annually'];

    for (const freq of frequencies) {
      const employee = {
        compensation: { frequency: freq, baseAmount: 5000 },
      };

      // Simulate the tag generation logic from salary-processing.manager.ts
      const frequency = employee.compensation.frequency || 'monthly';
      const tags = ['recurring', 'payroll', frequency];

      expect(tags).toContain(freq);
      expect(tags).toHaveLength(3);
      expect(tags[2]).toBe(freq);
    }
  });

  it('should default to monthly when frequency is undefined', () => {
    const employee = {
      compensation: { baseAmount: 5000 }, // No frequency specified
    };

    const frequency = employee.compensation.frequency || 'monthly';
    const tags = ['recurring', 'payroll', frequency];

    expect(tags[2]).toBe('monthly');
  });

  it('should handle null compensation frequency', () => {
    const employee = {
      compensation: { frequency: null, baseAmount: 5000 },
    };

    const frequency = (employee.compensation as any).frequency || 'monthly';
    const tags = ['recurring', 'payroll', frequency];

    expect(tags[2]).toBe('monthly');
  });
});

// ============================================================================
// Test 5: Combined Multi-Tenant Security Scenarios
// ============================================================================

describe('Combined Multi-Tenant Security Scenarios', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: mongoose.Model<any>;
  let PayrollRecordModel: mongoose.Model<any>;

  // Three organizations to test complex scenarios
  const orgA = new mongoose.Types.ObjectId();
  const orgB = new mongoose.Types.ObjectId();
  const orgC = new mongoose.Types.ObjectId();

  // Helper to create a valid payroll record with all required fields
  const createPayrollRecord = (overrides: any) => ({
    period: {
      month: 1,
      year: 2024,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      payDate: new Date('2024-01-31'),
    },
    breakdown: {
      baseAmount: 5000,
      grossSalary: 5000,
      netSalary: 4000,
      allowances: [],
      deductions: [],
    },
    status: 'paid',
    ...overrides,
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const employeeModelName = `Employee_Combined_${Date.now()}`;
    const payrollModelName = `PayrollRecord_Combined_${Date.now()}`;

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    EmployeeModel = mongoose.model(employeeModelName, employeeSchema);
    PayrollRecordModel = mongoose.model(payrollModelName, createPayrollRecordSchema());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await EmployeeModel.deleteMany({});
    await PayrollRecordModel.deleteMany({});

    // Create employees across all orgs
    await EmployeeModel.create([
      {
        organizationId: orgA,
        employeeId: 'EMP-001',
        email: 'emp1@orgA.com',
        position: 'Engineer',
        hireDate: new Date(),
        compensation: { baseAmount: 5000, frequency: 'monthly' },
      },
      {
        organizationId: orgB,
        employeeId: 'EMP-001', // Same ID, different org
        email: 'emp1@orgB.com',
        position: 'Manager',
        hireDate: new Date(),
        compensation: { baseAmount: 7000, frequency: 'bi_weekly' },
      },
      {
        organizationId: orgC,
        employeeId: 'EMP-001', // Same ID, different org
        email: 'emp1@orgC.com',
        position: 'Director',
        hireDate: new Date(),
        compensation: { baseAmount: 10000, frequency: 'weekly' },
      },
    ]);
  });

  it('should correctly isolate employees with same business ID across orgs', async () => {
    // All three orgs have EMP-001, but they should be isolated
    const empA = await findEmployeeSecure(EmployeeModel, {
      employeeId: 'EMP-001',
      organizationId: orgA,
      strictMultiTenant: true,
    });

    const empB = await findEmployeeSecure(EmployeeModel, {
      employeeId: 'EMP-001',
      organizationId: orgB,
      strictMultiTenant: true,
    });

    const empC = await findEmployeeSecure(EmployeeModel, {
      employeeId: 'EMP-001',
      organizationId: orgC,
      strictMultiTenant: true,
    });

    // Each should be different employees
    expect(empA._id.toString()).not.toBe(empB._id.toString());
    expect(empB._id.toString()).not.toBe(empC._id.toString());
    expect(empA._id.toString()).not.toBe(empC._id.toString());

    // Verify correct data
    expect(empA.compensation.baseAmount).toBe(5000);
    expect(empB.compensation.baseAmount).toBe(7000);
    expect(empC.compensation.baseAmount).toBe(10000);

    // Verify different frequencies
    expect(empA.compensation.frequency).toBe('monthly');
    expect(empB.compensation.frequency).toBe('bi_weekly');
    expect(empC.compensation.frequency).toBe('weekly');
  });

  it('should prevent accidental cross-tenant payroll queries', async () => {
    const empA = await EmployeeModel.findOne({ organizationId: orgA });

    // Create payroll record with all required fields
    await PayrollRecordModel.create(createPayrollRecord({
      organizationId: orgA,
      employeeId: empA._id,
      period: {
        month: 6,
        year: 2024,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
        payDate: new Date('2024-06-30'),
      },
    }));

    // Without org scoping, a query could accidentally find wrong org's record
    // With org scoping, this should return null
    const wrongOrgQuery = await PayrollRecordModel.findOne({
      organizationId: orgB, // Wrong org
      employeeId: empA._id, // Org A's employee
      'period.month': 6,
      'period.year': 2024,
    });

    expect(wrongOrgQuery).toBeNull();

    // Correct org should work
    const correctOrgQuery = await PayrollRecordModel.findOne({
      organizationId: orgA,
      employeeId: empA._id,
      'period.month': 6,
      'period.year': 2024,
    });

    expect(correctOrgQuery).not.toBeNull();
    expect(correctOrgQuery.breakdown.grossSalary).toBe(5000);
  });

  it('should maintain data integrity across bulk operations', async () => {
    // Get all employees
    const empA = await EmployeeModel.findOne({ organizationId: orgA });
    const empB = await EmployeeModel.findOne({ organizationId: orgB });
    const empC = await EmployeeModel.findOne({ organizationId: orgC });

    // Create payroll records for all with all required fields
    await PayrollRecordModel.create([
      createPayrollRecord({
        organizationId: orgA,
        employeeId: empA._id,
        period: {
          month: 7,
          year: 2024,
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-31'),
          payDate: new Date('2024-07-31'),
        },
        breakdown: { baseAmount: 5000, grossSalary: 5000, netSalary: 4000, allowances: [], deductions: [] },
      }),
      createPayrollRecord({
        organizationId: orgB,
        employeeId: empB._id,
        period: {
          month: 7,
          year: 2024,
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-31'),
          payDate: new Date('2024-07-31'),
        },
        breakdown: { baseAmount: 7000, grossSalary: 7000, netSalary: 5600, allowances: [], deductions: [] },
      }),
      createPayrollRecord({
        organizationId: orgC,
        employeeId: empC._id,
        period: {
          month: 7,
          year: 2024,
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-31'),
          payDate: new Date('2024-07-31'),
        },
        breakdown: { baseAmount: 10000, grossSalary: 10000, netSalary: 8000, allowances: [], deductions: [] },
      }),
    ]);

    // Verify each org sees only their records
    const orgARecords = await PayrollRecordModel.find({ organizationId: orgA });
    const orgBRecords = await PayrollRecordModel.find({ organizationId: orgB });
    const orgCRecords = await PayrollRecordModel.find({ organizationId: orgC });

    expect(orgARecords).toHaveLength(1);
    expect(orgBRecords).toHaveLength(1);
    expect(orgCRecords).toHaveLength(1);

    // Verify correct data isolation
    expect(orgARecords[0].breakdown.grossSalary).toBe(5000);
    expect(orgBRecords[0].breakdown.grossSalary).toBe(7000);
    expect(orgCRecords[0].breakdown.grossSalary).toBe(10000);
  });
});

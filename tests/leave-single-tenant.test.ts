/**
 * @classytic/payroll - Leave Service Single-Tenant Mode Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  employmentFields,
  leaveBalanceFields,
  employeePlugin,
  getLeaveRequestModel,
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
// Single-Tenant Mode Tests
// ============================================================================

describe('LeaveService (Single-Tenant Mode)', () => {
  let LeaveService: typeof import('../src/services/leave.service.js').LeaveService;
  let createLeaveService: typeof import('../src/services/leave.service.js').createLeaveService;

  beforeAll(async () => {
    const module = await import('../src/services/leave.service.js');
    LeaveService = module.LeaveService;
    createLeaveService = module.createLeaveService;
  });

  const employeeSchema = new Schema({
    ...employmentFields,
    ...leaveBalanceFields,
    // Override organizationId to be optional for single-tenant tests
    organizationId: { type: Schema.Types.ObjectId, required: false },
    userId: { type: Schema.Types.ObjectId, required: true },
    employeeId: { type: String, required: true },
    position: { type: String, required: true },
    department: { type: String, required: true },
    hireDate: { type: Date, required: true },
    status: { type: String, default: 'active' },
    compensation: { type: Schema.Types.Mixed, default: {} },
  });

  employeeSchema.plugin(employeePlugin, { enableLeave: true, autoCalculateSalary: false });

  const TestEmployee = mongoose.models.TestSingleTenantEmployee ||
    model('TestSingleTenantEmployee', employeeSchema);
  const LeaveRequest = getLeaveRequestModel();

  it('should create leave request without organizationId in single-tenant mode', async () => {
    const userId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      userId,
      employeeId: 'EMP-ST-001',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {},
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: {
        singleTenant: true,
        enforceBalance: false,
        checkOverlap: false,
      },
    });

    // Request leave without providing organizationId
    const result = await service.requestLeave({
      employeeId: employee._id,
      userId,
      request: {
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-07'),
      },
    });

    expect(result.request.organizationId).toBeUndefined();
    expect(result.days).toBe(5);
  });

  it('should use defaultOrganizationId when provided', async () => {
    const userId = new mongoose.Types.ObjectId();
    const defaultOrgId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      userId,
      employeeId: 'EMP-ST-002',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {},
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: {
        singleTenant: true,
        defaultOrganizationId: defaultOrgId,
        enforceBalance: false,
        checkOverlap: false,
      },
    });

    const result = await service.requestLeave({
      employeeId: employee._id,
      userId,
      request: {
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-07'),
      },
    });

    expect(result.request.organizationId?.toString()).toBe(defaultOrgId.toString());
  });

  it('should get leave for payroll without organizationId filter in single-tenant', async () => {
    const userId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();

    await LeaveRequest.create({
      employeeId,
      userId,
      type: 'unpaid',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-05'),
      days: 3,
      status: 'approved',
    });

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: { singleTenant: true },
    });

    const leaves = await service.getLeaveForPayroll({
      employeeId,
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-30'),
      type: 'unpaid',
    });

    expect(leaves).toHaveLength(1);
  });

  it('should throw error when organizationId missing in multi-tenant mode', async () => {
    const userId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      userId,
      employeeId: 'EMP-MT-001',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {},
      leaveBalances: [],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: {
        singleTenant: false, // Multi-tenant
      },
    });

    await expect(
      service.requestLeave({
        // Missing organizationId
        employeeId: employee._id,
        userId,
        request: {
          type: 'annual',
          startDate: new Date('2024-06-03'),
          endDate: new Date('2024-06-07'),
        },
      })
    ).rejects.toThrow(/organizationId is required in multi-tenant mode/);
  });

  it('should validate organization match in multi-tenant mode', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orgId1 = new mongoose.Types.ObjectId();
    const orgId2 = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId1, // Employee belongs to orgId1
      userId,
      employeeId: 'EMP-MT-002',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {},
      leaveBalances: [],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: {
        singleTenant: false,
        enforceBalance: false,
        checkOverlap: false,
      },
    });

    await expect(
      service.requestLeave({
        organizationId: orgId2, // Trying to use wrong org
        employeeId: employee._id,
        userId,
        request: {
          type: 'annual',
          startDate: new Date('2024-06-03'),
          endDate: new Date('2024-06-07'),
        },
      })
    ).rejects.toThrow(/Organization mismatch/);
  });

  it('should validate organization match in single-tenant mode when both values exist', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orgId1 = new mongoose.Types.ObjectId();
    const orgId2 = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId1, // Employee belongs to orgId1
      userId,
      employeeId: 'EMP-ST-003',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {},
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: {
        singleTenant: true, // Single-tenant mode
        enforceBalance: false,
        checkOverlap: false,
      },
    });

    // Should still throw error if caller passes wrong orgId in single-tenant
    await expect(
      service.requestLeave({
        organizationId: orgId2, // Wrong org ID provided
        employeeId: employee._id,
        userId,
        request: {
          type: 'annual',
          startDate: new Date('2024-06-03'),
          endDate: new Date('2024-06-07'),
        },
      })
    ).rejects.toThrow(/Organization mismatch/);
  });

  it('should allow request in single-tenant when employee has no organizationId', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      // No organizationId set
      userId,
      employeeId: 'EMP-ST-004',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {},
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: {
        singleTenant: true,
        enforceBalance: false,
        checkOverlap: false,
      },
    });

    // Should allow since employee has no org and we're in single-tenant mode
    const result = await service.requestLeave({
      organizationId: orgId, // Caller provides org
      employeeId: employee._id,
      userId,
      request: {
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-07'),
      },
    });

    expect(result.request.organizationId?.toString()).toBe(orgId.toString());
  });

  it('should use static methods without organizationId in single-tenant', async () => {
    const userId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();

    // Create some test requests without organizationId
    await LeaveRequest.create([
      {
        employeeId,
        userId,
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-05'),
        days: 3,
        status: 'pending',
      },
      {
        employeeId,
        userId,
        type: 'sick',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-02'),
        days: 2,
        status: 'approved',
      },
    ]);

    // Test findPendingByOrganization without org
    const pending = await LeaveRequest.findPendingByOrganization();
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('annual');

    // Test findByPeriod without org
    const periodRequests = await LeaveRequest.findByPeriod(
      undefined,
      new Date('2024-06-01'),
      new Date('2024-06-30')
    );
    expect(periodRequests).toHaveLength(1);
    expect(periodRequests[0].type).toBe('annual');

    // Test getOrganizationSummary without org
    const summary = await LeaveRequest.getOrganizationSummary(undefined, 2024);
    expect(summary.length).toBeGreaterThan(0);
  });

  it('should filter by organizationId when provided to static methods', async () => {
    const userId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const org1 = new mongoose.Types.ObjectId();
    const org2 = new mongoose.Types.ObjectId();

    // Create requests for different orgs
    await LeaveRequest.create([
      {
        organizationId: org1,
        employeeId,
        userId,
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-05'),
        days: 3,
        status: 'pending',
      },
      {
        organizationId: org2,
        employeeId,
        userId,
        type: 'sick',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-05'),
        days: 3,
        status: 'pending',
      },
    ]);

    // Should only get org1 requests
    const org1Pending = await LeaveRequest.findPendingByOrganization(org1);
    expect(org1Pending).toHaveLength(1);
    expect(org1Pending[0].type).toBe('annual');

    // Should only get org2 requests
    const org2Pending = await LeaveRequest.findPendingByOrganization(org2);
    expect(org2Pending).toHaveLength(1);
    expect(org2Pending[0].type).toBe('sick');
  });
});

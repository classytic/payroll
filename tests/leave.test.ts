/**
 * @classytic/payroll - Leave Management Tests
 *
 * Tests for leave utilities, schemas, and integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  // Utilities
  calculateLeaveDays,
  hasLeaveBalance,
  getLeaveBalance,
  getLeaveBalances,
  getAvailableDays,
  getLeaveSummary,
  initializeLeaveBalances,
  proRateAllocation,
  calculateUnpaidLeaveDeduction,
  getUnpaidLeaveDays,
  calculateCarryOver,
  accrueLeaveToBalance,
  DEFAULT_LEAVE_ALLOCATIONS,
  DEFAULT_CARRY_OVER,
  // Schemas
  employmentFields,
  leaveBalanceFields,
  createLeaveRequestSchema,
  applyLeaveRequestIndexes,
  // Plugin
  employeePlugin,
  // Model
  getLeaveRequestModel,
  // Enums
  LEAVE_TYPE,
  LEAVE_REQUEST_STATUS,
  isValidLeaveType,
  isPaidLeaveType,
} from '../src/index.js';
import { disableLogging } from '../src/utils/logger.js';
import type { LeaveBalance, LeaveType } from '../src/types.js';

// ============================================================================
// Setup MongoDB
// ============================================================================

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  disableLogging();

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
// Unit Tests - Leave Utilities
// ============================================================================

describe('calculateLeaveDays', () => {
  it('should calculate working days for a week excluding weekends', () => {
    // March 4, 2024 (Monday) to March 8, 2024 (Friday)
    const days = calculateLeaveDays(
      new Date('2024-03-04'),
      new Date('2024-03-08')
    );
    expect(days).toBe(5);
  });

  it('should exclude weekends', () => {
    // March 1, 2024 (Friday) to March 10, 2024 (Sunday)
    const days = calculateLeaveDays(
      new Date('2024-03-01'),
      new Date('2024-03-10')
    );
    // Fri(1), Mon(4), Tue(5), Wed(6), Thu(7), Fri(8) = 6 working days
    expect(days).toBe(6);
  });

  it('should exclude holidays', () => {
    // March 4, 2024 (Monday) to March 8, 2024 (Friday) with one holiday
    const days = calculateLeaveDays(
      new Date('2024-03-04'),
      new Date('2024-03-08'),
      { holidays: [new Date('2024-03-05')] }
    );
    expect(days).toBe(4);
  });

  it('should support custom work days', () => {
    // Sunday-Thursday schedule
    const days = calculateLeaveDays(
      new Date('2024-03-03'), // Sunday
      new Date('2024-03-09'), // Saturday
      { workDays: [0, 1, 2, 3, 4] } // Sun-Thu
    );
    // Sun(3), Mon(4), Tue(5), Wed(6), Thu(7) = 5 working days
    expect(days).toBe(5);
  });

  it('should return 1 for single working day', () => {
    const days = calculateLeaveDays(
      new Date('2024-03-04'), // Monday
      new Date('2024-03-04')
    );
    expect(days).toBe(1);
  });

  it('should return 0 for weekend-only period', () => {
    const days = calculateLeaveDays(
      new Date('2024-03-09'), // Saturday
      new Date('2024-03-10')  // Sunday
    );
    expect(days).toBe(0);
  });

  it('should respect includeEndDate option', () => {
    const days = calculateLeaveDays(
      new Date('2024-03-04'),
      new Date('2024-03-05'),
      { includeEndDate: false }
    );
    expect(days).toBe(1); // Only Monday counted
  });
});

describe('hasLeaveBalance', () => {
  const employee = {
    leaveBalances: [
      { type: 'annual' as LeaveType, allocated: 20, used: 5, pending: 3, carriedOver: 2, year: 2024 },
      { type: 'sick' as LeaveType, allocated: 10, used: 2, pending: 0, carriedOver: 0, year: 2024 },
    ],
  };

  it('should return true when balance is sufficient', () => {
    // Available: 20 + 2 - 5 - 3 = 14 days
    expect(hasLeaveBalance(employee, 'annual', 10, 2024)).toBe(true);
  });

  it('should return false when balance is insufficient', () => {
    expect(hasLeaveBalance(employee, 'annual', 20, 2024)).toBe(false);
  });

  it('should always return true for unpaid leave', () => {
    expect(hasLeaveBalance(employee, 'unpaid', 100, 2024)).toBe(true);
  });

  it('should return false when balance not found', () => {
    expect(hasLeaveBalance(employee, 'maternity', 10, 2024)).toBe(false);
  });

  it('should handle employee without balances', () => {
    expect(hasLeaveBalance({}, 'annual', 5, 2024)).toBe(false);
  });
});

describe('getLeaveBalance / getLeaveBalances', () => {
  const employee = {
    leaveBalances: [
      { type: 'annual' as LeaveType, allocated: 20, used: 5, pending: 0, carriedOver: 0, year: 2024 },
      { type: 'annual' as LeaveType, allocated: 15, used: 15, pending: 0, carriedOver: 5, year: 2023 },
      { type: 'sick' as LeaveType, allocated: 10, used: 2, pending: 0, carriedOver: 0, year: 2024 },
    ],
  };

  it('should get specific balance by type and year', () => {
    const balance = getLeaveBalance(employee, 'annual', 2024);
    expect(balance?.allocated).toBe(20);
    expect(balance?.used).toBe(5);
  });

  it('should return undefined for non-existent balance', () => {
    const balance = getLeaveBalance(employee, 'maternity', 2024);
    expect(balance).toBeUndefined();
  });

  it('should get all balances for a year', () => {
    const balances = getLeaveBalances(employee, 2024);
    expect(balances).toHaveLength(2);
  });
});

describe('getAvailableDays', () => {
  const employee = {
    leaveBalances: [
      { type: 'annual' as LeaveType, allocated: 20, used: 5, pending: 3, carriedOver: 2, year: 2024 },
    ],
  };

  it('should calculate available days correctly', () => {
    // 20 + 2 - 5 - 3 = 14
    expect(getAvailableDays(employee, 'annual', 2024)).toBe(14);
  });

  it('should return Infinity for unpaid leave', () => {
    expect(getAvailableDays(employee, 'unpaid', 2024)).toBe(Infinity);
  });

  it('should return 0 for non-existent balance', () => {
    expect(getAvailableDays(employee, 'maternity', 2024)).toBe(0);
  });
});

describe('getLeaveSummary', () => {
  const employee = {
    leaveBalances: [
      { type: 'annual' as LeaveType, allocated: 20, used: 5, pending: 3, carriedOver: 2, year: 2024 },
      { type: 'sick' as LeaveType, allocated: 10, used: 2, pending: 1, carriedOver: 0, year: 2024 },
    ],
  };

  it('should return comprehensive summary', () => {
    const summary = getLeaveSummary(employee, 2024);

    expect(summary.year).toBe(2024);
    expect(summary.totalAllocated).toBe(32); // 20+2+10+0
    expect(summary.totalUsed).toBe(7); // 5+2
    expect(summary.totalPending).toBe(4); // 3+1
    expect(summary.totalAvailable).toBe(21); // 32-7-4
    expect(summary.byType.annual?.available).toBe(14);
    expect(summary.byType.sick?.available).toBe(7);
  });
});

describe('initializeLeaveBalances', () => {
  it('should initialize full allocation for year start hire', () => {
    const balances = initializeLeaveBalances(
      new Date('2024-01-01'),
      {},
      2024
    );

    const annual = balances.find(b => b.type === 'annual');
    expect(annual?.allocated).toBe(20);
    expect(annual?.used).toBe(0);
    expect(annual?.year).toBe(2024);
  });

  it('should pro-rate for mid-year hire', () => {
    const balances = initializeLeaveBalances(
      new Date('2024-07-01'), // Mid-year
      { proRateNewHires: true },
      2024
    );

    const annual = balances.find(b => b.type === 'annual');
    // ~50% of year remaining, so ~10 days
    expect(annual?.allocated).toBeLessThan(20);
    expect(annual?.allocated).toBeGreaterThan(5);
  });

  it('should not pro-rate when disabled', () => {
    const balances = initializeLeaveBalances(
      new Date('2024-07-01'),
      { proRateNewHires: false },
      2024
    );

    const annual = balances.find(b => b.type === 'annual');
    expect(annual?.allocated).toBe(20);
  });

  it('should use custom allocations', () => {
    const balances = initializeLeaveBalances(
      new Date('2024-01-01'),
      { defaultAllocations: { annual: 30, sick: 15, unpaid: 0, maternity: 120, paternity: 15, bereavement: 7, compensatory: 0, other: 0 } },
      2024
    );

    const annual = balances.find(b => b.type === 'annual');
    expect(annual?.allocated).toBe(30);
  });
});

describe('proRateAllocation', () => {
  it('should return full allocation for year-start hire', () => {
    const result = proRateAllocation(20, new Date('2024-01-01'), 1, 2024);
    expect(result).toBe(20);
  });

  it('should pro-rate for mid-year hire', () => {
    const result = proRateAllocation(20, new Date('2024-07-01'), 1, 2024);
    expect(result).toBeLessThan(20);
    expect(result).toBeGreaterThan(5);
  });
});

describe('calculateUnpaidLeaveDeduction', () => {
  it('should calculate correct deduction', () => {
    // 100000 / 22 days * 5 days = 22727
    const deduction = calculateUnpaidLeaveDeduction(100000, 5, 22);
    expect(deduction).toBe(22727);
  });

  it('should return 0 for zero unpaid days', () => {
    expect(calculateUnpaidLeaveDeduction(100000, 0, 22)).toBe(0);
  });

  it('should return 0 for zero working days', () => {
    expect(calculateUnpaidLeaveDeduction(100000, 5, 0)).toBe(0);
  });
});

describe('getUnpaidLeaveDays', () => {
  const requests = [
    { type: 'annual' as LeaveType, days: 5, status: 'approved' },
    { type: 'unpaid' as LeaveType, days: 3, status: 'approved' },
    { type: 'unpaid' as LeaveType, days: 2, status: 'approved' },
    { type: 'unpaid' as LeaveType, days: 5, status: 'pending' },
  ];

  it('should sum approved unpaid leave days', () => {
    expect(getUnpaidLeaveDays(requests, 'approved')).toBe(5);
  });

  it('should filter by status', () => {
    expect(getUnpaidLeaveDays(requests, 'pending')).toBe(5);
  });
});

describe('calculateCarryOver', () => {
  const balances: LeaveBalance[] = [
    { type: 'annual', allocated: 20, used: 10, pending: 0, carriedOver: 0, year: 2024 },
    { type: 'compensatory', allocated: 10, used: 2, pending: 0, carriedOver: 0, year: 2024 },
    { type: 'sick', allocated: 10, used: 5, pending: 0, carriedOver: 0, year: 2024 },
  ];

  it('should carry over within limits', () => {
    const newBalances = calculateCarryOver(balances, { annual: 5, compensatory: 5 });

    const annual = newBalances.find(b => b.type === 'annual');
    expect(annual?.carriedOver).toBe(5); // Max 5, had 10 available
    expect(annual?.year).toBe(2025);

    const comp = newBalances.find(b => b.type === 'compensatory');
    expect(comp?.carriedOver).toBe(5); // Max 5, had 8 available
  });

  it('should preserve all leave types but with 0 carry-over for ineligible types', () => {
    const newBalances = calculateCarryOver(balances);

    // All types should be preserved
    expect(newBalances).toHaveLength(3);

    // Sick leave has no carry-over by default, but balance is created
    const sick = newBalances.find(b => b.type === 'sick');
    expect(sick).toBeDefined();
    expect(sick?.carriedOver).toBe(0); // No carry-over for sick
    expect(sick?.allocated).toBe(10); // Fresh allocation
    expect(sick?.year).toBe(2025);
  });

  it('should handle empty balances', () => {
    const newBalances = calculateCarryOver([]);
    expect(newBalances).toHaveLength(0);
  });
});

describe('accrueLeaveToBalance', () => {
  it('should add to existing balance', () => {
    const balances: LeaveBalance[] = [
      { type: 'compensatory', allocated: 5, used: 0, pending: 0, carriedOver: 0, year: 2024 },
    ];

    accrueLeaveToBalance(balances, 'compensatory', 2, 2024);

    expect(balances[0].allocated).toBe(7);
  });

  it('should create new balance if not exists', () => {
    const balances: LeaveBalance[] = [];

    accrueLeaveToBalance(balances, 'compensatory', 3, 2024);

    expect(balances).toHaveLength(1);
    expect(balances[0].type).toBe('compensatory');
    expect(balances[0].allocated).toBe(3);
  });
});

// ============================================================================
// Unit Tests - Leave Enums
// ============================================================================

describe('Leave Enums', () => {
  it('should have all leave types', () => {
    expect(LEAVE_TYPE.ANNUAL).toBe('annual');
    expect(LEAVE_TYPE.SICK).toBe('sick');
    expect(LEAVE_TYPE.UNPAID).toBe('unpaid');
    expect(LEAVE_TYPE.MATERNITY).toBe('maternity');
    expect(LEAVE_TYPE.PATERNITY).toBe('paternity');
    expect(LEAVE_TYPE.BEREAVEMENT).toBe('bereavement');
    expect(LEAVE_TYPE.COMPENSATORY).toBe('compensatory');
    expect(LEAVE_TYPE.OTHER).toBe('other');
  });

  it('should have all leave request statuses', () => {
    expect(LEAVE_REQUEST_STATUS.PENDING).toBe('pending');
    expect(LEAVE_REQUEST_STATUS.APPROVED).toBe('approved');
    expect(LEAVE_REQUEST_STATUS.REJECTED).toBe('rejected');
    expect(LEAVE_REQUEST_STATUS.CANCELLED).toBe('cancelled');
  });

  it('should validate leave types', () => {
    expect(isValidLeaveType('annual')).toBe(true);
    expect(isValidLeaveType('invalid')).toBe(false);
  });

  it('should identify paid vs unpaid leave', () => {
    expect(isPaidLeaveType('annual')).toBe(true);
    expect(isPaidLeaveType('sick')).toBe(true);
    expect(isPaidLeaveType('unpaid')).toBe(false);
  });
});

// ============================================================================
// Integration Tests - Leave with Employee
// ============================================================================

describe('Employee with Leave', () => {
  // Create employee schema with leave support
  const employeeSchema = new Schema({
    ...employmentFields,
    ...leaveBalanceFields,
    notes: String,
  }, { timestamps: true });

  employeeSchema.plugin(employeePlugin, { enableLeave: true });

  const Employee = model('EmployeeWithLeave', employeeSchema);

  it('should create employee with leave balances', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-001',
      position: 'Engineer',
      department: 'it',
      employmentType: 'full_time',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {
        baseAmount: 100000,
        currency: 'USD',
        frequency: 'monthly',
      },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 5, pending: 3, carriedOver: 2, year: 2024 },
        { type: 'sick', allocated: 10, used: 2, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });

    await employee.save();

    expect(employee.leaveBalances).toHaveLength(2);

    // Test plugin methods
    expect(typeof (employee as any).getLeaveBalance).toBe('function');

    const balance = (employee as any).getLeaveBalance('annual', 2024);
    expect(balance?.allocated).toBe(20);
    expect(balance?.used).toBe(5);
  });

  it('should check leave availability via plugin', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-002',
      position: 'Designer',
      department: 'marketing',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {
        baseAmount: 80000,
        currency: 'USD',
        frequency: 'monthly',
      },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 15, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });

    await employee.save();

    // 5 days available
    expect((employee as any).hasLeaveBalance('annual', 5, 2024)).toBe(true);
    expect((employee as any).hasLeaveBalance('annual', 10, 2024)).toBe(false);
  });

  it('should get leave summary via plugin', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-003',
      position: 'Manager',
      department: 'hr',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {
        baseAmount: 120000,
        currency: 'USD',
        frequency: 'monthly',
      },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 5, pending: 2, carriedOver: 3, year: 2024 },
        { type: 'sick', allocated: 10, used: 1, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });

    await employee.save();

    const summary = (employee as any).getLeaveSummary(2024);
    expect(summary.totalAllocated).toBe(33); // 20+3+10
    expect(summary.totalUsed).toBe(6);
    expect(summary.totalPending).toBe(2);
  });

  it('should initialize leave balances for new employee', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-004',
      position: 'Analyst',
      department: 'finance',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: {
        baseAmount: 70000,
        currency: 'USD',
        frequency: 'monthly',
      },
      leaveBalances: [],
    });

    await employee.save();

    // Initialize balances
    (employee as any).initializeLeaveBalances(2024);
    await employee.save();

    expect(employee.leaveBalances.length).toBeGreaterThan(0);

    const annual = employee.leaveBalances.find(b => b.type === 'annual');
    expect(annual).toBeDefined();
    expect(annual?.allocated).toBe(20);
  });
});

// ============================================================================
// Integration Tests - LeaveRequest Model
// ============================================================================

describe('LeaveRequest Model', () => {
  const LeaveRequest = getLeaveRequestModel();

  it('should create a leave request', async () => {
    const request = new LeaveRequest({
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-05'),
      days: 5,
      reason: 'Vacation',
    });

    await request.save();

    expect(request.status).toBe('pending');
    expect(request.days).toBe(5);
    expect((request as any).isPending).toBe(true);
  });

  it('should approve a leave request', async () => {
    const reviewerId = new mongoose.Types.ObjectId();
    const request = new LeaveRequest({
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-05'),
      days: 5,
    });

    await request.save();

    (request as any).approve(reviewerId, 'Approved for vacation');
    await request.save();

    expect(request.status).toBe('approved');
    expect(request.reviewedBy?.toString()).toBe(reviewerId.toString());
    expect(request.reviewNotes).toBe('Approved for vacation');
    expect((request as any).isApproved).toBe(true);
  });

  it('should reject a leave request', async () => {
    const reviewerId = new mongoose.Types.ObjectId();
    const request = new LeaveRequest({
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-12-24'),
      endDate: new Date('2024-12-31'),
      days: 6,
    });

    await request.save();

    (request as any).reject(reviewerId, 'Peak season - cannot approve');
    await request.save();

    expect(request.status).toBe('rejected');
    expect((request as any).isRejected).toBe(true);
  });

  it('should cancel a leave request', async () => {
    const request = new LeaveRequest({
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      type: 'sick',
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-07-02'),
      days: 2,
    });

    await request.save();

    (request as any).cancel();
    await request.save();

    expect(request.status).toBe('cancelled');
    expect((request as any).isCancelled).toBe(true);
  });

  it('should throw error when approving non-pending request', async () => {
    const request = new LeaveRequest({
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-05'),
      days: 5,
      status: 'approved',
    });

    await request.save();

    expect(() => {
      (request as any).approve(new mongoose.Types.ObjectId());
    }).toThrow('Can only approve pending requests');
  });

  it('should find requests by employee', async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create([
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-05'),
        days: 5,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'sick',
        startDate: new Date('2024-04-15'),
        endDate: new Date('2024-04-16'),
        days: 2,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId: new mongoose.Types.ObjectId(), // Different employee
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-05-01'),
        endDate: new Date('2024-05-10'),
        days: 8,
        status: 'pending',
      },
    ]);

    const requests = await LeaveRequest.findByEmployee(employeeId);
    expect(requests).toHaveLength(2);
  });

  it('should find pending requests by organization', async () => {
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create([
      {
        organizationId: orgId,
        employeeId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        days: 5,
        status: 'pending',
      },
      {
        organizationId: orgId,
        employeeId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        type: 'sick',
        startDate: new Date('2024-06-10'),
        endDate: new Date('2024-06-11'),
        days: 2,
        status: 'pending',
      },
      {
        organizationId: orgId,
        employeeId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-05-01'),
        endDate: new Date('2024-05-03'),
        days: 3,
        status: 'approved',
      },
    ]);

    const pending = await LeaveRequest.findPendingByOrganization(orgId);
    expect(pending).toHaveLength(2);
  });

  it('should get leave stats for employee', async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create([
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-03-05'),
        days: 5,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
        days: 3,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'sick',
        startDate: new Date('2024-04-15'),
        endDate: new Date('2024-04-16'),
        days: 2,
        status: 'approved',
      },
    ]);

    const stats = await LeaveRequest.getLeaveStats(employeeId, 2024);

    const annualStats = stats.find(s => s._id === 'annual');
    expect(annualStats?.totalDays).toBe(8);
    expect(annualStats?.count).toBe(2);

    const sickStats = stats.find(s => s._id === 'sick');
    expect(sickStats?.totalDays).toBe(2);
    expect(sickStats?.count).toBe(1);
  });
});

// ============================================================================
// Integration Tests - Payroll Integration
// ============================================================================

describe('Leave + Payroll Integration', () => {
  it('should calculate salary deduction for unpaid leave', () => {
    const baseSalary = 100000;
    const workingDaysInMonth = 22;

    const leaveRequests = [
      { type: 'annual' as LeaveType, days: 5, status: 'approved' },
      { type: 'unpaid' as LeaveType, days: 3, status: 'approved' },
      { type: 'sick' as LeaveType, days: 2, status: 'approved' },
    ];

    const unpaidDays = getUnpaidLeaveDays(leaveRequests);
    const deduction = calculateUnpaidLeaveDeduction(baseSalary, unpaidDays, workingDaysInMonth);

    // Daily rate: 100000 / 22 = 4545
    // Deduction: 4545 * 3 = 13636
    expect(unpaidDays).toBe(3);
    expect(deduction).toBe(13636);
  });

  it('should handle pro-rated leave for mid-year hire in payroll', () => {
    // Employee hired July 1st
    const hireDate = new Date('2024-07-01');
    const balances = initializeLeaveBalances(hireDate, { proRateNewHires: true }, 2024);

    const annual = balances.find(b => b.type === 'annual');

    // Should get roughly 50% of 20 days (depending on exact calculation)
    expect(annual?.allocated).toBeLessThan(20);
    expect(annual?.allocated).toBeGreaterThan(5);

    // Can request leave up to available balance
    const employee = { leaveBalances: balances };
    expect(hasLeaveBalance(employee, 'annual', annual?.allocated || 0, 2024)).toBe(true);
  });
});

// ============================================================================
// Integration Tests - LeaveService
// ============================================================================

describe('LeaveService', () => {
  // Import LeaveService dynamically to avoid issues with module resolution
  let LeaveService: typeof import('../src/services/leave.service.js').LeaveService;
  let createLeaveService: typeof import('../src/services/leave.service.js').createLeaveService;

  beforeAll(async () => {
    const module = await import('../src/services/leave.service.js');
    LeaveService = module.LeaveService;
    createLeaveService = module.createLeaveService;
  });

  // Create test models
  const employeeSchema = new Schema({
    ...employmentFields,
    ...leaveBalanceFields,
    organizationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    employeeId: { type: String, required: true },
    position: { type: String, required: true },
    department: { type: String, required: true },
    hireDate: { type: Date, required: true },
    status: { type: String, default: 'active' },
    compensation: { type: Schema.Types.Mixed, default: {} },
  });

  employeeSchema.plugin(employeePlugin, { enableLeave: true, autoCalculateSalary: false });

  // Use unique model names to avoid conflicts
  const TestEmployee = mongoose.models.TestServiceEmployee ||
    model('TestServiceEmployee', employeeSchema);
  const LeaveRequest = getLeaveRequestModel();

  it('should create leave service with factory function', () => {
    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
    });

    expect(service).toBeInstanceOf(LeaveService);
  });

  it('should calculate days correctly', () => {
    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
    });

    // Monday to Friday = 5 days
    const days = service.calculateDays(
      new Date('2024-06-03'),
      new Date('2024-06-07')
    );
    expect(days).toBe(5);

    // With half day
    const halfDays = service.calculateDays(
      new Date('2024-06-03'),
      new Date('2024-06-07'),
      { halfDay: true }
    );
    expect(halfDays).toBe(4.5);
  });

  it('should request leave and update pending balance', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId,
      userId,
      employeeId: 'EMP-SVC-001',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: { baseAmount: 100000, currency: 'USD', frequency: 'monthly' },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: { checkOverlap: false }, // Disable for simpler testing
    });

    const result = await service.requestLeave({
      organizationId: orgId,
      employeeId: employee._id,
      userId,
      request: {
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-07'),
        reason: 'Vacation',
      },
    });

    expect(result.days).toBe(5);
    expect(result.request.status).toBe('pending');

    // Check balance was updated
    const updated = await TestEmployee.findById(employee._id);
    const balance = updated?.leaveBalances?.find((b: LeaveBalance) => b.type === 'annual' && b.year === 2024);
    expect(balance?.pending).toBe(5);
  });

  it('should reject request when insufficient balance', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId,
      userId,
      employeeId: 'EMP-SVC-002',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: { baseAmount: 100000, currency: 'USD', frequency: 'monthly' },
      leaveBalances: [
        { type: 'annual', allocated: 5, used: 3, pending: 0, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: { enforceBalance: true, checkOverlap: false },
    });

    await expect(
      service.requestLeave({
        organizationId: orgId,
        employeeId: employee._id,
        userId,
        request: {
          type: 'annual',
          startDate: new Date('2024-06-03'),
          endDate: new Date('2024-06-07'),
        },
      })
    ).rejects.toThrow(/Insufficient annual leave balance/);
  });

  it('should allow unpaid leave without balance check', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId,
      userId,
      employeeId: 'EMP-SVC-003',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: { baseAmount: 100000, currency: 'USD', frequency: 'monthly' },
      leaveBalances: [],
    });
    await employee.save();

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: { enforceBalance: true, checkOverlap: false },
    });

    const result = await service.requestLeave({
      organizationId: orgId,
      employeeId: employee._id,
      userId,
      request: {
        type: 'unpaid',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-07'),
      },
    });

    expect(result.request.type).toBe('unpaid');
    expect(result.days).toBe(5);
  });

  it('should detect overlapping requests', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();

    // Create existing approved request
    await LeaveRequest.create({
      organizationId: orgId,
      employeeId,
      userId,
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'approved',
    });

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: { checkOverlap: true, enforceBalance: false },
    });

    const { hasOverlap, overlappingRequests } = await service.checkOverlap({
      employeeId,
      startDate: new Date('2024-06-05'),
      endDate: new Date('2024-06-10'),
    });

    expect(hasOverlap).toBe(true);
    expect(overlappingRequests).toHaveLength(1);
  });

  it('should approve leave and update balance from pending to used', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const reviewerId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId,
      userId,
      employeeId: 'EMP-SVC-004',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: { baseAmount: 100000, currency: 'USD', frequency: 'monthly' },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 5, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    // Create pending request
    const request = await LeaveRequest.create({
      organizationId: orgId,
      employeeId: employee._id,
      userId,
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'pending',
    });

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
      config: { enforceBalance: true },
    });

    const result = await service.reviewLeave({
      requestId: request._id,
      reviewerId,
      action: 'approve',
      notes: 'Approved!',
    });

    expect(result.request.status).toBe('approved');
    expect(result.balanceUpdated).toBe(true);

    // Check balance was updated
    const updated = await TestEmployee.findById(employee._id);
    const balance = updated?.leaveBalances?.find((b: LeaveBalance) => b.type === 'annual' && b.year === 2024);
    expect(balance?.pending).toBe(0);
    expect(balance?.used).toBe(5);
  });

  it('should reject leave and remove from pending', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const reviewerId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId,
      userId,
      employeeId: 'EMP-SVC-005',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: { baseAmount: 100000, currency: 'USD', frequency: 'monthly' },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 5, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const request = await LeaveRequest.create({
      organizationId: orgId,
      employeeId: employee._id,
      userId,
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'pending',
    });

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
    });

    const result = await service.reviewLeave({
      requestId: request._id,
      reviewerId,
      action: 'reject',
      notes: 'Peak season',
    });

    expect(result.request.status).toBe('rejected');

    // Check balance was restored
    const updated = await TestEmployee.findById(employee._id);
    const balance = updated?.leaveBalances?.find((b: LeaveBalance) => b.type === 'annual' && b.year === 2024);
    expect(balance?.pending).toBe(0);
    expect(balance?.used).toBe(0);
  });

  it('should cancel pending request and restore balance', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const employee = new TestEmployee({
      organizationId: orgId,
      userId,
      employeeId: 'EMP-SVC-006',
      position: 'Developer',
      department: 'it',
      hireDate: new Date('2024-01-01'),
      status: 'active',
      compensation: { baseAmount: 100000, currency: 'USD', frequency: 'monthly' },
      leaveBalances: [
        { type: 'annual', allocated: 20, used: 0, pending: 5, carriedOver: 0, year: 2024 },
      ],
    });
    await employee.save();

    const request = await LeaveRequest.create({
      organizationId: orgId,
      employeeId: employee._id,
      userId,
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'pending',
    });

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
    });

    const result = await service.cancelLeave({
      requestId: request._id,
    });

    expect(result.request.status).toBe('cancelled');

    const updated = await TestEmployee.findById(employee._id);
    const balance = updated?.leaveBalances?.find((b: LeaveBalance) => b.type === 'annual' && b.year === 2024);
    expect(balance?.pending).toBe(0);
  });

  it('should calculate unpaid leave deduction for payroll', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    // Create approved unpaid leave requests
    await LeaveRequest.create([
      {
        organizationId: orgId,
        employeeId,
        userId,
        type: 'unpaid',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-05'),
        days: 3,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId,
        userId,
        type: 'annual', // Not unpaid
        startDate: new Date('2024-06-10'),
        endDate: new Date('2024-06-12'),
        days: 3,
        status: 'approved',
      },
    ]);

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
    });

    const { totalDays, deduction } = await service.calculateUnpaidDeduction({
      organizationId: orgId,
      employeeId,
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-30'),
      baseSalary: 100000,
      workingDaysInMonth: 22,
    });

    expect(totalDays).toBe(3);
    expect(deduction).toBe(13636); // 100000 / 22 * 3 = 13636
  });

  it('should get leave for payroll period', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    await LeaveRequest.create([
      {
        organizationId: orgId,
        employeeId,
        userId,
        type: 'unpaid',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-05'),
        days: 3,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId,
        userId,
        type: 'unpaid',
        startDate: new Date('2024-07-01'), // Outside period
        endDate: new Date('2024-07-03'),
        days: 3,
        status: 'approved',
      },
    ]);

    const service = createLeaveService({
      EmployeeModel: TestEmployee as any,
      LeaveRequestModel: LeaveRequest,
    });

    const leaves = await service.getLeaveForPayroll({
      organizationId: orgId,
      employeeId,
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-30'),
      type: 'unpaid',
    });

    expect(leaves).toHaveLength(1);
  });
});

// ============================================================================
// LeaveRequest Overlap Detection
// ============================================================================

describe('LeaveRequest.hasOverlap', () => {
  const LeaveRequest = getLeaveRequestModel();

  it('should detect overlapping requests', async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create({
      organizationId: orgId,
      employeeId,
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'approved',
    });

    // Overlapping request
    const hasOverlap = await LeaveRequest.hasOverlap(
      employeeId,
      new Date('2024-06-05'),
      new Date('2024-06-10')
    );

    expect(hasOverlap).toBe(true);
  });

  it('should not detect non-overlapping requests', async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create({
      organizationId: orgId,
      employeeId,
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'approved',
    });

    // Non-overlapping request
    const hasOverlap = await LeaveRequest.hasOverlap(
      employeeId,
      new Date('2024-06-10'),
      new Date('2024-06-14')
    );

    expect(hasOverlap).toBe(false);
  });

  it('should exclude cancelled requests from overlap check', async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create({
      organizationId: orgId,
      employeeId,
      userId: new mongoose.Types.ObjectId(),
      type: 'annual',
      startDate: new Date('2024-06-03'),
      endDate: new Date('2024-06-07'),
      days: 5,
      status: 'cancelled',
    });

    const hasOverlap = await LeaveRequest.hasOverlap(
      employeeId,
      new Date('2024-06-05'),
      new Date('2024-06-10')
    );

    expect(hasOverlap).toBe(false);
  });

  it('should find overlapping requests', async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();

    await LeaveRequest.create([
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'annual',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-07'),
        days: 5,
        status: 'approved',
      },
      {
        organizationId: orgId,
        employeeId,
        userId: new mongoose.Types.ObjectId(),
        type: 'sick',
        startDate: new Date('2024-06-10'),
        endDate: new Date('2024-06-12'),
        days: 3,
        status: 'pending',
      },
    ]);

    const overlapping = await LeaveRequest.findOverlapping(
      employeeId,
      new Date('2024-06-06'),
      new Date('2024-06-11')
    );

    expect(overlapping).toHaveLength(2);
  });
});

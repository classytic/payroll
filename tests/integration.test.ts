/**
 * @classytic/payroll - Integration Tests
 *
 * Shows the RIGHT way to merge @classytic/clockin + @classytic/payroll schemas.
 * This is production-ready code showing real-world usage.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createAttendanceSchema, commonAttendanceFields, applyAttendanceIndexes } from '@classytic/clockin/schemas';
import { createPayrollInstance, employmentFields, employeePlugin, createPayrollRecordSchema, getAttendance, getHolidays, createHolidaySchema } from '../src/index.js';
import { countWorkingDays } from '../src/core/index.js';
import { disableLogging } from '../src/utils/logger.js';

// ============================================================================
// Setup MongoDB
// ============================================================================

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  disableLogging(); // Quiet tests

  // MongoMemoryServer doesn't support transactions without replica set.
  // Mock startSession to return null - Mongoose handles .session(null) gracefully
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
// Models - The RIGHT Way (Merged Schemas)
// ============================================================================

/**
 * Employee Model - Merging Payroll + ClockIn fields
 *
 * This is the recommended approach:
 * - Start with base schema
 * - Add payroll fields (employmentFields)
 * - Add clockin fields (commonAttendanceFields)
 * - Apply both plugins
 */
const employeeSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  
  // Payroll: employment, compensation, bank details, etc.
  ...employmentFields,
  
  // ClockIn: currentSession, attendanceStats, attendanceEnabled
  ...commonAttendanceFields,
  
  // Your app fields
  notes: String,
}, { timestamps: true });

// Apply plugins
employeeSchema.plugin(employeePlugin);
applyAttendanceIndexes(employeeSchema, { tenantField: 'organizationId' });

const Employee = model('Employee', employeeSchema);

// Other models
const Attendance = model('Attendance', createAttendanceSchema());
const PayrollRecord = model('PayrollRecord', createPayrollRecordSchema());

// User model (required for population)
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
}, { timestamps: true });

const User = model('User', userSchema);

const transactionSchema = new Schema({
  organizationId: Schema.Types.ObjectId,
  type: String,
  category: String,
  amount: Number,
  method: String,
  status: String,
  date: Date,
  referenceId: Schema.Types.ObjectId,
  referenceModel: String,
  handledBy: Schema.Types.ObjectId,
  notes: String,
  metadata: Schema.Types.Mixed,
}, { timestamps: true });

const Transaction = model('Transaction', transactionSchema);
const Holiday = model('Holiday', createHolidaySchema());

// ============================================================================
// Integration Tests
// ============================================================================

describe('Schema Integration', () => {
  it('should have both payroll and clockin fields on employee', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-001',
      position: 'Engineer',
      department: 'it',
      employmentType: 'full_time',
      hireDate: new Date(),
      status: 'active',
      compensation: {
        baseAmount: 100000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    await employee.save();

    // Payroll fields
    expect(employee.employeeId).toBeDefined();
    expect(employee.position).toBe('Engineer');
    expect(employee.compensation.baseAmount).toBe(100000);
    expect(employee.status).toBe('active');

    // ClockIn fields
    expect(employee.attendanceEnabled).toBe(true);
    expect(employee.attendanceStats).toBeDefined();

    // Payroll plugin methods
    expect(typeof (employee as any).canReceiveSalary).toBe('function');
    expect((employee as any).canReceiveSalary()).toBe(true);
  });
});

describe('Payroll + Attendance Flow', () => {
  let payroll: any;
  let org: mongoose.Types.ObjectId;
  let user: mongoose.Types.ObjectId;

  beforeEach(async () => {
    org = new mongoose.Types.ObjectId();
    // Create actual User document for population to work
    const userDoc = await User.create({ name: 'Test User', email: 'test@example.com' });
    user = userDoc._id;

    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should process payroll with attendance deduction', async () => {
    // Hire employee (hire date before the payroll period)
    const employee = await payroll.hire({
      userId: user,
      organizationId: org,
      employment: {
        position: 'Software Engineer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'), // Hired before March
      },
      compensation: {
        baseAmount: 110000,
        currency: 'USD',
      },
    });

    // Create attendance (ClockIn format)
    // March 2024 has 21 working days, we'll record 20 days worked (1 day absent)
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 3,
      monthlyTotal: 19,
      uniqueDaysVisited: 19,
      fullDaysCount: 17,      // 17 full days
      halfDaysCount: 2,       // 2 half days (= 1 day equivalent)
      paidLeaveDaysCount: 2,  // 2 paid leave
      overtimeDaysCount: 0,
      totalWorkDays: 20,      // Total: 17 + 1 + 2 = 20 (1 absent from 21)
      checkIns: [],
      visitedDays: [],
    });

    // Get attendance for payroll
    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 3,
      year: 2024,
      expectedDays: 21, // March 2024 has 21 working days
    });

    expect(attendance).toBeDefined();
    expect(attendance?.actualDays).toBe(20); // 17 full + 1 half + 2 leave = 20

    // Process payroll
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
      attendance,
    });

    // Verify salary calculated correctly
    expect(result.payrollRecord.breakdown.baseAmount).toBe(110000);

    // Verify attendance deduction (1 day absent)
    // Daily rate = 110000 / 21 ≈ 5238
    // 1 absent day ≈ 5238 deduction
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBeCloseTo(5238, -2);

    // Verify transaction created
    expect(result.transaction.amount).toBe(result.payrollRecord.breakdown.netSalary);
    expect(result.transaction.category).toBe('salary');
  });

  it('should process payroll without attendance (no deduction)', async () => {
    const employee = await payroll.hire({
      userId: user,
      organizationId: org,
      employment: { position: 'Engineer', department: 'it', type: 'full_time' },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // No attendance record = no deduction
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    expect(result.payrollRecord.breakdown.attendanceDeduction).toBe(0);
  });
});

describe('Holiday Integration', () => {
  it('should create holidays and fetch them for payroll', async () => {
    const org = new mongoose.Types.ObjectId();

    // Add holidays
    await Holiday.create([
      {
        organizationId: org,
        date: new Date('2024-03-17'),
        name: 'Company Day',
        type: 'company',
        paid: true,
      },
      {
        organizationId: org,
        date: new Date('2024-03-25'),
        name: 'Emergency Closure',
        type: 'company',
        paid: true,
      },
    ]);

    // Get holidays for period
    const holidays = await getHolidays(Holiday, {
      organizationId: org,
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-03-31'),
    });

    expect(holidays).toHaveLength(2);
    expect(holidays[0]).toBeInstanceOf(Date);
  });
});

describe('Pro-Rating with Attendance', () => {
  let payroll: any;
  let org: mongoose.Types.ObjectId;

  beforeEach(async () => {
    org = new mongoose.Types.ObjectId();

    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should prorate salary for mid-month hire', async () => {
    // Create user first
    const userDoc = await User.create({ name: 'Test User', email: 'prorate@example.com' });

    // Hire on March 15
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-03-15'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    // Should be prorated (hired mid-month)
    expect(result.payrollRecord.breakdown.baseAmount).toBeLessThan(100000);
    expect(result.payrollRecord.breakdown.proRatedAmount).toBeGreaterThan(0);
  });

  it('should NOT over-deduct attendance for mid-month hire (expected days should match employment period)', async () => {
    // Create user first
    const userDoc = await User.create({ name: 'Attendance Prorate User', email: 'attendance-prorate@example.com' });

    // Hire on March 15 (mid-month)
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-03-15'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // Expected working days ONLY for the employee's active range (Mar 15 -> Mar 31), Mon-Fri.
    const expected = countWorkingDays(
      new Date('2024-03-15'),
      new Date('2024-03-31'),
      { workDays: [1, 2, 3, 4, 5] }
    ).workingDays;

    // Create attendance record that matches perfect attendance for the active range
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 3,
      monthlyTotal: expected,
      uniqueDaysVisited: expected,
      fullDaysCount: expected,
      halfDaysCount: 0,
      paidLeaveDaysCount: 0,
      overtimeDaysCount: 0,
      totalWorkDays: expected,
      checkIns: [],
      visitedDays: [],
    });

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    // No attendance deduction when attendance matches expected working days for the employment window.
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBe(0);
  });
});

describe('Allowances and Deductions', () => {
  let payroll: any;

  beforeEach(async () => {
    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should include taxable and non-taxable allowances correctly', async () => {
    // Create user first
    const userDoc = await User.create({ name: 'Test User', email: 'allowances@example.com' });

    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: new mongoose.Types.ObjectId(),
      employment: {
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'), // Hired before March
      },
      compensation: {
        baseAmount: 100000,
        currency: 'USD',
        allowances: [
          { type: 'housing', amount: 20000, taxable: true, effectiveFrom: new Date('2024-01-01') },
          { type: 'meal', amount: 5000, taxable: false, effectiveFrom: new Date('2024-01-01') },
        ],
      },
    });

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    const breakdown = result.payrollRecord.breakdown;

    // Total allowances: 25000
    const totalAllowances = breakdown.allowances.reduce((sum: number, a: any) => sum + a.amount, 0);
    expect(totalAllowances).toBe(25000);

    // Gross = base + allowances
    expect(breakdown.grossSalary).toBe(125000);

    // Tax should only be on base + taxable allowances (120000, not 125000)
    expect(breakdown.taxableAmount).toBe(120000);

    // Net should be less than gross (has tax)
    expect(breakdown.netSalary).toBeLessThan(breakdown.grossSalary);
  });
});

// ============================================================================
// ClockIn → Payroll End-to-End Flow
// ============================================================================

describe('ClockIn → Payroll End-to-End Flow', () => {
  let payroll: any;
  let org: mongoose.Types.ObjectId;
  let userDoc: any;

  beforeEach(async () => {
    org = new mongoose.Types.ObjectId();
    userDoc = await User.create({ name: 'E2E Test User', email: 'e2e@example.com' });

    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should process payroll using ClockIn attendance data format', async () => {
    // 1. Hire employee
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Developer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: {
        baseAmount: 120000,
        currency: 'USD',
      },
    });

    // Verify employee has ClockIn fields from merged schema
    expect(employee.attendanceEnabled).toBe(true);
    expect(employee.attendanceStats).toBeDefined();
    expect(employee.attendanceStats.totalVisits).toBe(0);

    // 2. Simulate ClockIn recording attendance over the month
    // This mimics what ClockIn.checkIn.record() would create
    const attendanceRecord = await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 4, // April
      monthlyTotal: 22,
      uniqueDaysVisited: 22,
      fullDaysCount: 20,
      halfDaysCount: 2,
      paidLeaveDaysCount: 0,
      overtimeDaysCount: 3,
      totalWorkDays: 21, // 20 + 0.5*2 = 21
      checkIns: [
        { timestamp: new Date('2024-04-01T09:00:00Z'), method: 'qr_code' },
        { timestamp: new Date('2024-04-02T09:05:00Z'), method: 'manual' },
      ],
      visitedDays: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 29, 30],
    });

    // 3. Get attendance using payroll helper
    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 4,
      year: 2024,
      expectedDays: 22, // April 2024 working days
    });

    expect(attendance).toBeDefined();
    expect(attendance?.actualDays).toBe(21);
    expect(attendance?.absentDays).toBe(1);

    // 4. Process payroll with attendance
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
      attendance,
    });

    // Verify complete flow
    expect(result.payrollRecord).toBeDefined();
    expect(result.transaction).toBeDefined();
    expect(result.payrollRecord.breakdown.baseAmount).toBe(120000);
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBeGreaterThan(0);
    expect(result.payrollRecord.status).toBe('paid');
  });

  it('should handle perfect attendance (no deductions)', async () => {
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Manager',
        department: 'hr',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 150000, currency: 'USD' },
    });

    // Perfect attendance - all 22 days worked
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 4,
      monthlyTotal: 22,
      uniqueDaysVisited: 22,
      fullDaysCount: 22,
      halfDaysCount: 0,
      paidLeaveDaysCount: 0,
      overtimeDaysCount: 0,
      totalWorkDays: 22,
      checkIns: [],
      visitedDays: [],
    });

    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 4,
      year: 2024,
      expectedDays: 22,
    });

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
      attendance,
    });

    // No deductions for perfect attendance
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBe(0);
    expect(attendance?.absentDays).toBe(0);
  });

  it('should calculate overtime correctly in attendance', async () => {
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Support',
        department: 'operations',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 80000, currency: 'USD' },
    });

    // Employee worked overtime
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 4,
      monthlyTotal: 25, // More than expected
      uniqueDaysVisited: 22,
      fullDaysCount: 22,
      halfDaysCount: 0,
      paidLeaveDaysCount: 0,
      overtimeDaysCount: 5, // 5 overtime days
      totalWorkDays: 22,
      checkIns: [],
      visitedDays: [],
    });

    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 4,
      year: 2024,
      expectedDays: 22,
    });

    expect(attendance?.overtimeDays).toBe(5);
    expect(attendance?.absentDays).toBe(0);
  });
});

// ============================================================================
// Termination Scenarios
// ============================================================================

describe('Termination Scenarios', () => {
  let payroll: any;
  let org: mongoose.Types.ObjectId;

  beforeEach(async () => {
    org = new mongoose.Types.ObjectId();

    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should prorate salary for mid-month termination', async () => {
    const userDoc = await User.create({ name: 'Terminated User', email: 'term@example.com' });

    // Hire employee
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Contractor',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // Set termination date on employee (keeping status active) to test prorating
    // This simulates the scenario where termination is scheduled but employee is still active
    await Employee.findByIdAndUpdate(employee._id, {
      terminationDate: new Date('2024-03-15'),
    });

    // Process salary - should prorate based on terminationDate
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    // Should be prorated for partial month (roughly 11/22 working days = ~50%)
    // March 1-15 has about 11 working days out of ~22 total
    expect(result.payrollRecord.breakdown.baseAmount).toBeLessThan(100000);
    expect(result.payrollRecord.breakdown.baseAmount).toBeGreaterThan(40000); // ~50% of 100k
  });

  it('should handle employee terminated before payroll period', async () => {
    const userDoc = await User.create({ name: 'Past Term User', email: 'pastterm@example.com' });

    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Temp',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // Terminated in February
    await payroll.terminate({
      employeeId: employee._id,
      terminationDate: new Date('2024-02-28'),
      reason: 'contract_end',
    });

    // Try to process March payroll - should fail or return 0
    await expect(
      payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
      })
    ).rejects.toThrow();
  });
});

// ============================================================================
// Single-Tenant Mode
// ============================================================================

describe('Single-Tenant Mode', () => {
  it('should auto-inject organizationId in single-tenant mode', async () => {
    const userDoc = await User.create({ name: 'Single Tenant User', email: 'single@example.com' });
    const defaultOrgId = new mongoose.Types.ObjectId();

    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .forSingleTenant({ organizationId: defaultOrgId })
      .build();

    // Hire without explicitly specifying organizationId - it should be auto-injected
    const employee = await payroll.hire({
      userId: userDoc._id,
      employment: {
        position: 'Solo Developer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 90000, currency: 'USD' },
    });

    expect(employee).toBeDefined();
    expect(employee.position).toBe('Solo Developer');
    // Verify organizationId was auto-injected
    expect(employee.organizationId.toString()).toBe(defaultOrgId.toString());

    // Process payroll without specifying organizationId
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    expect(result.payrollRecord).toBeDefined();
    expect(result.payrollRecord.breakdown.baseAmount).toBe(90000);
  });
});

// ============================================================================
// Validation & Error Scenarios
// ============================================================================

describe('Validation & Error Scenarios', () => {
  let payroll: any;
  let org: mongoose.Types.ObjectId;

  beforeEach(async () => {
    org = new mongoose.Types.ObjectId();

    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should reject duplicate payroll for same period', async () => {
    const userDoc = await User.create({ name: 'Dup Test', email: 'dup@example.com' });

    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // First payroll - should succeed
    await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    // Second payroll for same period - should fail
    await expect(
      payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
      })
    ).rejects.toThrow(/duplicate|already.*processed|exists/i);
  });

  it('should reject processing for non-existent employee', async () => {
    const fakeEmployeeId = new mongoose.Types.ObjectId();

    await expect(
      payroll.processSalary({
        employeeId: fakeEmployeeId,
        month: 3,
        year: 2024,
      })
    ).rejects.toThrow(/not found|does not exist/i);
  });

  it('should reject processing for inactive employee', async () => {
    const userDoc = await User.create({ name: 'Inactive User', email: 'inactive@example.com' });

    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Former Employee',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // Suspend employee
    await Employee.findByIdAndUpdate(employee._id, { status: 'suspended' });

    await expect(
      payroll.processSalary({
        employeeId: employee._id,
        month: 3,
        year: 2024,
      })
    ).rejects.toThrow(/not eligible|suspended|cannot receive/i);
  });

  it('should validate required compensation fields', async () => {
    const userDoc = await User.create({ name: 'No Comp User', email: 'nocomp@example.com' });

    // Try to hire without compensation
    await expect(
      payroll.hire({
        userId: userDoc._id,
        organizationId: org,
        employment: {
          position: 'Unpaid Intern',
          department: 'it',
          type: 'full_time',
        },
        compensation: {
          baseAmount: 0, // Zero salary
          currency: 'USD',
        },
      })
    ).resolves.toBeDefined(); // Zero salary is valid (unpaid intern)

    // But processing should fail for ineligible
    const employee = await Employee.findOne({ position: 'Unpaid Intern' });
    if (employee) {
      await expect(
        payroll.processSalary({
          employeeId: employee._id,
          month: 3,
          year: 2024,
        })
      ).rejects.toThrow(/not eligible|cannot receive/i);
    }
  });
});

// ============================================================================
// Multiple Attendance Scenarios
// ============================================================================

describe('Multiple Attendance Scenarios', () => {
  let payroll: any;
  let org: mongoose.Types.ObjectId;
  let userDoc: any;

  beforeEach(async () => {
    org = new mongoose.Types.ObjectId();
    userDoc = await User.create({ name: 'Attendance User', email: 'attendance@example.com' });

    payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
        AttendanceModel: Attendance,
      })
      .build();
  });

  it('should handle half-day attendance correctly', async () => {
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Part-timer',
        department: 'support',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 60000, currency: 'USD' },
    });

    // Many half days
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 4,
      monthlyTotal: 22,
      uniqueDaysVisited: 22,
      fullDaysCount: 10,    // 10 full days
      halfDaysCount: 12,    // 12 half days = 6 full day equivalent
      paidLeaveDaysCount: 0,
      overtimeDaysCount: 0,
      totalWorkDays: 16,    // 10 + 6 = 16
      checkIns: [],
      visitedDays: [],
    });

    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 4,
      year: 2024,
      expectedDays: 22,
    });

    expect(attendance?.actualDays).toBe(16);
    expect(attendance?.absentDays).toBe(6); // 22 - 16 = 6 absent

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
      attendance,
    });

    // Deduction should be for 6 days
    // Daily rate ≈ 60000 / 22 ≈ 2727
    // 6 days × 2727 ≈ 16364
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBeCloseTo(16364, -2);
  });

  it('should handle paid leave correctly (no deduction)', async () => {
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Senior Dev',
        department: 'it',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 180000, currency: 'USD' },
    });

    // Employee took paid leave
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 4,
      monthlyTotal: 17,
      uniqueDaysVisited: 17,
      fullDaysCount: 17,
      halfDaysCount: 0,
      paidLeaveDaysCount: 5, // 5 days paid leave
      overtimeDaysCount: 0,
      totalWorkDays: 22,     // 17 + 5 = 22 (full attendance with leave)
      checkIns: [],
      visitedDays: [],
    });

    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 4,
      year: 2024,
      expectedDays: 22,
    });

    expect(attendance?.actualDays).toBe(22); // Paid leave counts
    expect(attendance?.absentDays).toBe(0);

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
      attendance,
    });

    // No deduction - paid leave counts as attendance
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBe(0);
  });

  it('should handle extended absence correctly', async () => {
    const employee = await payroll.hire({
      userId: userDoc._id,
      organizationId: org,
      employment: {
        position: 'Analyst',
        department: 'finance',
        type: 'full_time',
        hireDate: new Date('2024-01-01'),
      },
      compensation: { baseAmount: 100000, currency: 'USD' },
    });

    // Employee was mostly absent
    await Attendance.create({
      tenantId: org,
      targetId: employee._id,
      targetModel: 'Employee',
      year: 2024,
      month: 4,
      monthlyTotal: 5,
      uniqueDaysVisited: 5,
      fullDaysCount: 5,
      halfDaysCount: 0,
      paidLeaveDaysCount: 0,
      overtimeDaysCount: 0,
      totalWorkDays: 5, // Only 5 days worked out of 22
      checkIns: [],
      visitedDays: [],
    });

    const attendance = await getAttendance(Attendance, {
      organizationId: org,
      employeeId: employee._id,
      month: 4,
      year: 2024,
      expectedDays: 22,
    });

    expect(attendance?.actualDays).toBe(5);
    expect(attendance?.absentDays).toBe(17);

    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
      attendance,
    });

    // Large deduction for 17 absent days
    // Daily rate ≈ 100000 / 22 ≈ 4545
    // 17 days × 4545 ≈ 77273
    expect(result.payrollRecord.breakdown.attendanceDeduction).toBeCloseTo(77273, -2);
    // Net salary should be very low
    expect(result.payrollRecord.breakdown.netSalary).toBeLessThan(30000);
  });
});

// ============================================================================
// Employee Plugin Methods
// ============================================================================

describe('Employee Plugin Methods', () => {
  it('should provide canReceiveSalary method', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-PLUGIN-001',
      position: 'Tester',
      department: 'support',
      employmentType: 'full_time',
      hireDate: new Date(),
      status: 'active',
      compensation: {
        baseAmount: 50000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    await employee.save();

    // Active with salary = can receive
    expect((employee as any).canReceiveSalary()).toBe(true);

    // Suspended = cannot receive
    employee.status = 'suspended';
    await employee.save();
    expect((employee as any).canReceiveSalary()).toBe(false);

    // Active but zero salary = cannot receive
    employee.status = 'active';
    employee.compensation.baseAmount = 0;
    await employee.save();
    expect((employee as any).canReceiveSalary()).toBe(false);
  });

  it('should have attendance fields from ClockIn schema', async () => {
    const employee = new Employee({
      organizationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-CLOCKIN-001',
      position: 'Developer',
      department: 'it',
      employmentType: 'full_time',
      hireDate: new Date(),
      status: 'active',
      compensation: {
        baseAmount: 100000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    await employee.save();

    // ClockIn fields should exist with defaults
    expect(employee.attendanceEnabled).toBe(true);
    expect(employee.attendanceStats).toBeDefined();
    expect(employee.attendanceStats.totalVisits).toBe(0);
    expect(employee.attendanceStats.currentStreak).toBe(0);
    expect(employee.attendanceStats.longestStreak).toBe(0);
    expect(employee.currentSession).toBeDefined();
    expect(employee.currentSession.isActive).toBe(false);
  });
});

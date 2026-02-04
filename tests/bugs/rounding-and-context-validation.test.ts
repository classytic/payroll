/**
 * Validation tests for:
 * 1. processBulkPayroll context.organizationId support
 * 2. Attendance calculator integer rounding
 * 3. totalDeduction floating point safety
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  calculateAttendanceDeduction,
  calculateDailyRate,
  calculateHourlyRate,
  calculatePartialDayDeduction,
  calculateTotalAttendanceDeduction,
} from '../../src/calculators/attendance.calculator.js';
import { roundMoney } from '../../src/utils/money.js';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema } from '../../src/index.js';
import { disableLogging } from '../../src/utils/logger.js';

// Simple transaction schema for testing
const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  flow: { type: String },
  status: { type: String, default: 'pending' },
  description: { type: String },
  date: { type: Date, default: Date.now },
  tags: [String],
  referenceId: Schema.Types.ObjectId,
  referenceModel: String,
  notes: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

describe('Rounding and Context Validation', () => {
  // ============================================================================
  // Issue 1: Attendance Calculator 2-Decimal Rounding (Enterprise Standard)
  // ============================================================================
  describe('Attendance Calculator 2-Decimal Rounding', () => {
    describe('roundMoney defaults to 2-decimal precision', () => {
      it('should return exact value for whole numbers', () => {
        expect(roundMoney(100)).toBe(100);
        expect(roundMoney(4545)).toBe(4545);
      });

      it('should preserve 2 decimal places', () => {
        expect(roundMoney(100.55)).toBe(100.55);
        expect(roundMoney(4545.45)).toBe(4545.45);
      });

      it('should round at 3rd decimal', () => {
        expect(roundMoney(100.456)).toBe(100.46);
        expect(roundMoney(100.454)).toBe(100.45);
      });

      it('should apply banker\'s rounding for exactly 0.5 at 3rd decimal', () => {
        // Banker's rounding: round to nearest even
        expect(roundMoney(100.455)).toBe(100.46); // .55 rounds up
        expect(roundMoney(100.445)).toBe(100.44); // .44 rounds down to even
        expect(roundMoney(100.435)).toBe(100.44); // .43 rounds up to even
      });

      it('should still support integer rounding with decimals=0', () => {
        expect(roundMoney(2272.5, 0)).toBe(2272); // Banker's to even
        expect(roundMoney(2273.5, 0)).toBe(2274);
        expect(Number.isInteger(roundMoney(2272.5, 0))).toBe(true);
      });
    });

    describe('calculateDailyRate returns 2-decimal values', () => {
      it('should return 2-decimal daily rate', () => {
        const result = calculateDailyRate(100000, 22);
        // 100000 / 22 = 4545.454545... → rounds to 4545.45
        expect(result).toBe(4545.45);
      });

      it('should handle exact divisions', () => {
        const result = calculateDailyRate(88000, 22);
        expect(result).toBe(4000);
      });
    });

    describe('calculateHourlyRate returns 2-decimal values', () => {
      it('should return 2-decimal hourly rate', () => {
        const result = calculateHourlyRate(100000, 22, 8);
        // 4545.45 / 8 = 568.18125 → rounds to 568.18
        expect(result).toBe(568.18);
      });

      it('should apply banker\'s rounding', () => {
        const result = calculateHourlyRate(100000, 22, 10);
        // 4545.45 / 10 = 454.545 → rounds to 454.54 (banker's rounds half to even)
        expect(result).toBe(454.54);
      });
    });

    describe('calculatePartialDayDeduction returns 2-decimal values', () => {
      it('should return 2-decimal for half-day', () => {
        // 4545.45 * 0.5 = 2272.725 → banker's rounds to 2272.72
        const result = calculatePartialDayDeduction(4545.45, 0.5);
        expect(result).toBe(2272.72);
      });

      it('should return 2-decimal for quarter-day', () => {
        // 4545.45 * 0.25 = 1136.3625 → rounds to 1136.36
        const result = calculatePartialDayDeduction(4545.45, 0.25);
        expect(result).toBe(1136.36);
      });
    });

    describe('calculateAttendanceDeduction returns 2-decimal values', () => {
      it('should return 2-decimal deduction amount', () => {
        const result = calculateAttendanceDeduction({
          expectedWorkingDays: 22,
          actualWorkingDays: 20,
          dailyRate: 4545.45,
        });
        // 2 * 4545.45 = 9090.9
        expect(result.deductionAmount).toBe(9090.9);
      });

      it('should handle fractional daily rates with proper rounding', () => {
        const result = calculateAttendanceDeduction({
          expectedWorkingDays: 22,
          actualWorkingDays: 21,
          dailyRate: 4545.45, // Fractional rate
        });
        // 1 * 4545.45 = 4545.45
        expect(result.deductionAmount).toBe(4545.45);
      });
    });

    describe('calculateTotalAttendanceDeduction returns 2-decimal values', () => {
      it('should return 2-decimal totalDeduction', () => {
        const result = calculateTotalAttendanceDeduction({
          dailyRate: 4545.45,
          fullDayAbsences: 2,
          partialDayAbsences: [0.5, 0.25],
        });

        // Verify values with 2-decimal precision
        expect(result.fullDayDeduction).toBe(9090.9); // 2 * 4545.45
        expect(result.partialDayDeduction).toBe(3409.08); // 2272.72 + 1136.36
        expect(result.totalDeduction).toBe(12499.98);     // 9090.9 + 3409.08
      });

      it('should not have floating point artifacts in totalDeduction', () => {
        // Test with many partial day absences to check for accumulation errors
        const result = calculateTotalAttendanceDeduction({
          dailyRate: 1000,
          fullDayAbsences: 0,
          partialDayAbsences: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], // 10 x 0.1
        });

        // Each 0.1 * 1000 = 100
        expect(result.partialDayDeduction).toBe(1000);
        expect(result.totalDeduction).toBe(1000);
      });

      it('should handle edge case with many 0.33 fractions', () => {
        // 0.33 can cause floating point issues
        const result = calculateTotalAttendanceDeduction({
          dailyRate: 3000,
          fullDayAbsences: 0,
          partialDayAbsences: [0.33, 0.33, 0.33],
        });

        // Each 0.33 * 3000 = 990
        expect(result.partialDayDeduction).toBe(2970); // 990 * 3
      });
    });
  });

  // ============================================================================
  // Issue 2: processBulkPayroll context.organizationId Support
  // ============================================================================
  describe('processBulkPayroll context.organizationId Support', () => {
    let mongoServer: MongoMemoryServer;
    let EmployeeModel: mongoose.Model<any>;
    let PayrollRecordModel: mongoose.Model<any>;
    let TransactionModel: mongoose.Model<any>;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
      disableLogging();

      // Mock session for MongoMemoryServer (no replica set)
      const mockSession = { startTransaction: () => { throw new Error("No replica set"); }, commitTransaction: async () => {}, abortTransaction: async () => {}, endSession: () => {}, inTransaction: () => false };
      mongoose.startSession = (async () => mockSession) as any;

      // Create models
      const employeeSchema = createEmployeeSchema();
      const payrollRecordSchema = createPayrollRecordSchema();

      EmployeeModel = mongoose.model('Employee', employeeSchema);
      PayrollRecordModel = mongoose.model('PayrollRecord', payrollRecordSchema);
      TransactionModel = mongoose.model('Transaction', transactionSchema);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await EmployeeModel.deleteMany({});
      await PayrollRecordModel.deleteMany({});
      await TransactionModel.deleteMany({});
    });

    it('should accept organizationId via context parameter', async () => {
      const orgId = new mongoose.Types.ObjectId();

      // Create test employee
      const employee = await EmployeeModel.create({
        organizationId: orgId,
        employeeId: 'EMP-001',
        email: 'test@example.com',
        position: 'Engineer',
        department: 'it',
        hireDate: new Date('2024-01-01'),
        status: 'active',
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Call processBulkPayroll with organizationId in context (not in params)
      const result = await payroll.processBulkPayroll({
        month: 1,
        year: 2024,
        context: { organizationId: orgId },
      });

      // Should process successfully
      expect(result.total).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(0);
    });

    it('should prefer explicit organizationId over context.organizationId', async () => {
      const orgId1 = new mongoose.Types.ObjectId();
      const orgId2 = new mongoose.Types.ObjectId();

      // Create employee in org1
      await EmployeeModel.create({
        organizationId: orgId1,
        employeeId: 'EMP-001',
        email: 'test1@example.com',
        position: 'Engineer',
        department: 'it',
        hireDate: new Date('2024-01-01'),
        status: 'active',
        compensation: {
          baseAmount: 100000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      // Create employee in org2
      await EmployeeModel.create({
        organizationId: orgId2,
        employeeId: 'EMP-002',
        email: 'test2@example.com',
        position: 'Manager',
        department: 'management',
        hireDate: new Date('2024-01-01'),
        status: 'active',
        compensation: {
          baseAmount: 120000,
          currency: 'USD',
          frequency: 'monthly',
          allowances: [],
          deductions: [],
        },
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Explicit organizationId should take precedence
      const result = await payroll.processBulkPayroll({
        organizationId: orgId1,
        month: 1,
        year: 2024,
        context: { organizationId: orgId2 }, // This should be ignored
      });

      // Should only process org1's employee
      expect(result.total).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.successful[0].employeeId).toBe('EMP-001');
    });

    it('should throw in multi-tenant mode when no organizationId provided', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Should throw when no organizationId in params or context
      await expect(
        payroll.processBulkPayroll({
          month: 1,
          year: 2024,
        })
      ).rejects.toThrow(/organizationId/i);
    });
  });

  // ============================================================================
  // Issue 3: payrollSummary context.organizationId Support
  // ============================================================================
  describe('payrollSummary should also support context.organizationId', () => {
    let mongoServer: MongoMemoryServer;
    let EmployeeModel: mongoose.Model<any>;
    let PayrollRecordModel: mongoose.Model<any>;
    let TransactionModel: mongoose.Model<any>;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
      disableLogging();

      // Mock session for MongoMemoryServer (no replica set)
      const mockSession = { startTransaction: () => { throw new Error("No replica set"); }, commitTransaction: async () => {}, abortTransaction: async () => {}, endSession: () => {}, inTransaction: () => false };
      mongoose.startSession = (async () => mockSession) as any;

      const employeeSchema = createEmployeeSchema();
      const payrollRecordSchema = createPayrollRecordSchema();

      // Use different model names to avoid conflicts
      EmployeeModel = mongoose.model('EmployeeSum', employeeSchema);
      PayrollRecordModel = mongoose.model('PayrollRecordSum', payrollRecordSchema);
      TransactionModel = mongoose.model('TransactionSum', transactionSchema);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    it('payrollSummary organizationId is resolved correctly', async () => {
      const orgId = new mongoose.Types.ObjectId();

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Should not throw when organizationId is provided
      const result = await payroll.payrollSummary({
        organizationId: orgId,
        month: 1,
        year: 2024,
      });

      expect(result).toBeDefined();
      expect(result.totalGross).toBe(0);
      expect(result.employeeCount).toBe(0);
    });
  });

  // ============================================================================
  // Issue 4: Working Days Indexing (0-6 vs 1-7)
  // ============================================================================
  describe('Working Days Indexing Convention', () => {
    it('countWorkingDays uses Date.getDay() convention (0=Sunday, 6=Saturday)', async () => {
      // Import countWorkingDays from config
      const { countWorkingDays } = await import('../../src/core/config.js');

      // March 2024 calendar:
      // Sun=3,10,17,24,31 (5 days)
      // Mon=4,11,18,25 (4 days)
      // Tue=5,12,19,26 (4 days)
      // Wed=6,13,20,27 (4 days)
      // Thu=7,14,21,28 (4 days)
      // Fri=1,8,15,22,29 (5 days)
      // Sat=2,9,16,23,30 (5 days)

      const start = new Date('2024-03-01');
      const end = new Date('2024-03-31');

      // Default: Mon-Fri = [1,2,3,4,5] in Date.getDay() convention
      const result = countWorkingDays(start, end);
      expect(result.workingDays).toBe(21); // 4+4+4+4+5 = 21 weekdays

      // Test with Sunday included: [0,1,2,3,4,5] = Sun-Fri
      const withSunday = countWorkingDays(start, end, { workingDays: [0, 1, 2, 3, 4, 5] });
      expect(withSunday.workingDays).toBe(26); // 21 + 5 Sundays

      // Test with Saturday included: [1,2,3,4,5,6] = Mon-Sat
      const withSaturday = countWorkingDays(start, end, { workingDays: [1, 2, 3, 4, 5, 6] });
      expect(withSaturday.workingDays).toBe(26); // 21 + 5 Saturdays
    });

    it('passing 7 for Sunday does NOT work (use 0 instead)', async () => {
      const { countWorkingDays } = await import('../../src/core/config.js');

      const start = new Date('2024-03-01');
      const end = new Date('2024-03-31');

      // WRONG: Using 7 for Sunday - this will NOT count Sundays
      const wrongSunday = countWorkingDays(start, end, { workingDays: [7] });
      expect(wrongSunday.workingDays).toBe(0); // No days match because getDay() returns 0-6

      // CORRECT: Using 0 for Sunday
      const correctSunday = countWorkingDays(start, end, { workingDays: [0] });
      expect(correctSunday.workingDays).toBe(5); // 5 Sundays in March 2024
    });

    it('calculateProRating uses same 0-6 convention', async () => {
      const { calculateProRating } = await import('../../src/calculators/prorating.calculator.js');

      const result = calculateProRating({
        hireDate: new Date('2024-03-01'),
        terminationDate: null,
        periodStart: new Date('2024-03-01'),
        periodEnd: new Date('2024-03-31'),
        workingDays: [1, 2, 3, 4, 5], // Mon-Fri using 0-6 convention
        holidays: [],
      });

      expect(result.isProRated).toBe(false);
      expect(result.ratio).toBe(1);
      expect(result.periodWorkingDays).toBe(21); // 21 weekdays in March 2024
    });
  });

  // ============================================================================
  // Issue 5: Idempotency Key Format
  // ============================================================================
  describe('Idempotency Key Format', () => {
    it('generatePayrollIdempotencyKey includes payrollRunType', async () => {
      const { generatePayrollIdempotencyKey } = await import('../../src/core/idempotency.js');

      const orgId = '507f1f77bcf86cd799439011';
      const empId = '507f1f77bcf86cd799439012';

      // Default (regular)
      const regularKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024);
      expect(regularKey).toBe(`payroll:${orgId}:${empId}:2024-3:regular`);

      // Explicit run type
      const supplementalKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'supplemental');
      expect(supplementalKey).toBe(`payroll:${orgId}:${empId}:2024-3:supplemental`);

      const retroactiveKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'retroactive');
      expect(retroactiveKey).toBe(`payroll:${orgId}:${empId}:2024-3:retroactive`);

      const offCycleKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'off-cycle');
      expect(offCycleKey).toBe(`payroll:${orgId}:${empId}:2024-3:off-cycle`);
    });

    it('different payrollRunTypes generate different keys for same period', async () => {
      const { generatePayrollIdempotencyKey } = await import('../../src/core/idempotency.js');

      const orgId = '507f1f77bcf86cd799439011';
      const empId = '507f1f77bcf86cd799439012';

      const keys = [
        generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular'),
        generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'supplemental'),
        generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'retroactive'),
        generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'off-cycle'),
      ];

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(4);
    });
  });

  // ============================================================================
  // Issue 6: nextPaymentDate Calculation
  // ============================================================================
  describe('nextPaymentDate Calculation', () => {
    it('addDays and addMonths work correctly', async () => {
      const { addDays, addMonths } = await import('../../src/utils/date.js');

      const paymentDate = new Date('2024-03-15');

      // Monthly: add 1 month
      const nextMonthly = addMonths(paymentDate, 1);
      expect(nextMonthly.getFullYear()).toBe(2024);
      expect(nextMonthly.getMonth()).toBe(3); // April (0-indexed)
      expect(nextMonthly.getDate()).toBe(15);

      // Bi-weekly: add 14 days
      const nextBiWeekly = addDays(paymentDate, 14);
      expect(nextBiWeekly.getFullYear()).toBe(2024);
      expect(nextBiWeekly.getMonth()).toBe(2); // Still March
      expect(nextBiWeekly.getDate()).toBe(29);

      // Weekly: add 7 days
      const nextWeekly = addDays(paymentDate, 7);
      expect(nextWeekly.getFullYear()).toBe(2024);
      expect(nextWeekly.getMonth()).toBe(2); // Still March
      expect(nextWeekly.getDate()).toBe(22);
    });

    it('weekly frequency results in 7-day intervals', async () => {
      const { addDays } = await import('../../src/utils/date.js');

      const paymentDates = [
        new Date('2024-03-01'),
        new Date('2024-03-08'),
        new Date('2024-03-15'),
        new Date('2024-03-22'),
      ];

      // Each payment should be 7 days apart
      for (let i = 0; i < paymentDates.length - 1; i++) {
        const next = addDays(paymentDates[i], 7);
        expect(next.getTime()).toBe(paymentDates[i + 1].getTime());
      }
    });

    it('bi_weekly frequency results in 14-day intervals', async () => {
      const { addDays } = await import('../../src/utils/date.js');

      const paymentDates = [
        new Date('2024-03-01'),
        new Date('2024-03-15'),
        new Date('2024-03-29'),
      ];

      // Each payment should be 14 days apart
      for (let i = 0; i < paymentDates.length - 1; i++) {
        const next = addDays(paymentDates[i], 14);
        expect(next.getTime()).toBe(paymentDates[i + 1].getTime());
      }
    });
  });
});

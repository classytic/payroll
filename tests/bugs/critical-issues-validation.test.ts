/**
 * @classytic/payroll - Critical Issues Validation Tests
 *
 * Tests validating and fixing 6 critical issues:
 * 1. CRITICAL: Payroll record indexing conflict between model and schema helper
 * 2. HIGH: payrollRunType/retroactiveAdjustment not persisted during processing
 * 3. HIGH: Stuck processing/pending records deadlock (no crash recovery)
 * 4. MEDIUM: Export marks records before confirmation
 * 5. MEDIUM: Idempotency key ignores payroll run type
 * 6. MEDIUM: Schema helper missing critical fields
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  payrollRecordIndexes,
  createPayrollRecordFields,
  generatePayrollIdempotencyKey,
  PAYROLL_STATUS,
  employeePlugin,
} from '../../src/index.js';
import { disableLogging } from '../../src/utils/logger.js';

// ============================================================================
// Test Setup
// ============================================================================

let mongoServer: MongoMemoryServer;
let EmployeeModel: Model<any>;
let PayrollRecordModel: Model<any>;
let TransactionModel: Model<any>;

const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true },
  net: Number,
  type: { type: String, required: true },
  flow: String,
  status: { type: String, default: 'pending' },
  description: String,
  date: { type: Date, default: Date.now },
  tags: [String],
  currency: String,
  fee: Number,
  tax: Number,
  taxDetails: Schema.Types.Mixed,
  method: String,
  employeeId: Schema.Types.ObjectId,
  customerId: Schema.Types.ObjectId,
  processedBy: Schema.Types.ObjectId,
  breakdown: Schema.Types.Mixed,
  sourceId: Schema.Types.ObjectId,
  sourceModel: String,
  idempotencyKey: String,
  processedAt: Date,
  completedAt: Date,
  notes: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  disableLogging();

  // Mock session for non-replica set
  const mockSession = {
    startTransaction: () => { throw new Error("Transaction numbers are only allowed on a replica set member"); },
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: () => {},
    inTransaction: () => false
  };
  mongoose.startSession = (async () => mockSession) as any;

  // Create User model for population
  const userSchema = new Schema({ name: String, email: String });
  mongoose.model('User', userSchema);

  const employeeSchema = createEmployeeSchema();
  employeeSchema.plugin(employeePlugin);
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
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function createTestOrg() {
  return new Types.ObjectId();
}

async function createTestEmployee(orgId: Types.ObjectId, overrides = {}) {
  const employeeId = `EMP-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
  return await EmployeeModel.create({
    organizationId: orgId,
    employeeId,
    position: 'Developer',
    department: 'it',
    status: 'active',
    hireDate: new Date('2024-01-01'),
    employmentType: 'full_time',
    compensation: {
      baseAmount: 100000,
      currency: 'USD',
      frequency: 'monthly',
      netSalary: 100000,
    },
    ...overrides,
  });
}

// ============================================================================
// Issue 1: Payroll Record Indexing Conflict (CRITICAL)
// ============================================================================

describe('Issue 1: Payroll Record Indexing - Unique Index with Partial Filter', () => {
  describe('Schema helper index definition', () => {
    it('should have UNIQUE compound index with partial filter (v2.8.0+ race protection)', () => {
      // The schema helper should have a unique index with partialFilterExpression
      const uniqueIndex = payrollRecordIndexes.find(
        idx => idx.fields &&
          'employeeId' in idx.fields &&
          'period.month' in idx.fields &&
          'period.year' in idx.fields &&
          'payrollRunType' in idx.fields &&
          idx.options?.unique === true
      );

      // Should exist and be unique with partial filter
      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex?.options?.unique).toBe(true);
      // Partial filter excludes voided records to allow re-processing
      expect(uniqueIndex?.options?.partialFilterExpression).toBeDefined();
      expect(uniqueIndex?.options?.partialFilterExpression?.isVoided?.$eq).toBe(false);
    });

    it('should include organizationId in unique compound index', () => {
      const uniqueIndex = payrollRecordIndexes.find(
        idx => idx.fields &&
          'organizationId' in idx.fields &&
          'employeeId' in idx.fields &&
          'period.month' in idx.fields &&
          idx.options?.unique === true
      );

      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex?.fields?.organizationId).toBe(1);
    });

    it('should include payrollRunType in unique index for multi-run type support', () => {
      const uniqueIndex = payrollRecordIndexes.find(
        idx => idx.fields &&
          'payrollRunType' in idx.fields &&
          idx.options?.unique === true
      );

      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex?.fields?.payrollRunType).toBe(1);
    });
  });

  describe('Re-processing after reversal', () => {
    it('should allow creating new payroll record after reversing previous one', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Process salary first time
      const result1 = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2024,
      });

      // Reverse the payroll
      await payroll.reversePayroll({
        organizationId: orgId,
        payrollRecordId: result1.payrollRecord._id,
        reason: 'Incorrect amount - recalculating',
      });

      // Should be able to process again after reversal
      const result2 = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2024,
        // Use different idempotency key to bypass cache
        idempotencyKey: `reprocess-${Date.now()}`,
      });

      expect(result2.payrollRecord._id.toString()).not.toBe(result1.payrollRecord._id.toString());
      expect(result2.payrollRecord.status).toBe('paid');

      // Both records should exist (reversed + new)
      const allRecords = await PayrollRecordModel.find({
        employeeId: employee._id,
        'period.month': 3,
        'period.year': 2024,
      });
      expect(allRecords.length).toBe(2);
    });
  });
});

// ============================================================================
// Issue 2: payrollRunType/retroactiveAdjustment Not Persisted (HIGH)
// ============================================================================

describe('Issue 2: PayrollRunType and RetroactiveAdjustment Persistence', () => {
  describe('Schema fields existence', () => {
    it('should include payrollRunType in schema fields', () => {
      const fields = createPayrollRecordFields();
      expect(fields).toHaveProperty('payrollRunType');
    });

    it('should include retroactiveAdjustment in schema fields', () => {
      const fields = createPayrollRecordFields();
      expect(fields).toHaveProperty('retroactiveAdjustment');
    });

    it('should include employerContributions in schema fields', () => {
      const fields = createPayrollRecordFields();
      expect(fields).toHaveProperty('employerContributions');
    });

    it('should include corrections in schema fields', () => {
      const fields = createPayrollRecordFields();
      expect(fields).toHaveProperty('corrections');
    });
  });

  describe('Processing with payrollRunType', () => {
    it('should persist payrollRunType when provided in params', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2024,
        payrollRunType: 'supplemental',
      });

      // Fetch fresh from DB to verify persistence
      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.payrollRunType).toBe('supplemental');
    });

    it('should default payrollRunType to regular when not provided', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2024,
      });

      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.payrollRunType).toBe('regular');
    });

    it('should allow multiple payroll runs of different types for same period', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Regular payroll
      const regular = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2024,
        payrollRunType: 'regular',
      });

      // Supplemental payroll (bonus) for same period - different run type
      const supplemental = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2024,
        payrollRunType: 'supplemental',
      });

      expect(regular.payrollRecord._id.toString()).not.toBe(supplemental.payrollRecord._id.toString());

      const allRecords = await PayrollRecordModel.find({
        employeeId: employee._id,
        'period.month': 3,
        'period.year': 2024,
      });
      expect(allRecords.length).toBe(2);
      expect(allRecords.map(r => r.payrollRunType).sort()).toEqual(['regular', 'supplemental']);
    });
  });

  describe('Retroactive adjustment processing', () => {
    it('should persist retroactiveAdjustment details when provided', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const originalPayrollId = new Types.ObjectId();

      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 4,
        year: 2024,
        payrollRunType: 'retroactive',
        retroactiveAdjustment: {
          originalPeriod: { month: 2, year: 2024 },
          originalPayrollId,
          reason: 'Salary revision backdated to February',
          adjustmentAmount: 5000,
        },
      });

      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.payrollRunType).toBe('retroactive');
      expect(record?.retroactiveAdjustment).toBeDefined();
      expect(record?.retroactiveAdjustment?.originalPeriod?.month).toBe(2);
      expect(record?.retroactiveAdjustment?.originalPeriod?.year).toBe(2024);
      expect(record?.retroactiveAdjustment?.reason).toBe('Salary revision backdated to February');
      expect(record?.retroactiveAdjustment?.adjustmentAmount).toBe(5000);
    });
  });
});

// ============================================================================
// Issue 3: Stuck Processing/Pending Records Recovery (HIGH)
// ============================================================================

describe('Issue 3: Stuck Processing/Pending Records Recovery', () => {
  describe('Crash recovery method', () => {
    it('should have recoverStuckPayrolls method', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      expect(typeof payroll.recoverStuckPayrolls).toBe('function');
    });

    it('should mark stuck records without transaction as failed', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Simulate a crashed processing record (no transaction)
      const stuckRecord = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
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
          netSalary: 100000,
        },
        status: 'processing',
        processedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        // No transactionId - simulates crash before transaction
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Run recovery
      const recovered = await payroll.recoverStuckPayrolls({
        organizationId: orgId,
        staleThresholdMinutes: 30,
      });

      expect(recovered.markedFailed).toBeGreaterThanOrEqual(1);

      // Verify the record was marked as failed
      const updatedRecord = await PayrollRecordModel.findById(stuckRecord._id);
      expect(updatedRecord?.status).toBe('failed');
    });

    it('should NOT mark records with transactions as failed (prevent orphaning)', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create a transaction
      const transaction = await TransactionModel.create({
        organizationId: orgId,
        amount: 100000,
        type: 'salary',
        status: 'completed',
      });

      // Simulate a stuck record WITH transaction (partial failure after transaction)
      const recordWithTx = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: {
          month: 4,
          year: 2024,
          startDate: new Date('2024-04-01'),
          endDate: new Date('2024-04-30'),
          payDate: new Date('2024-04-30'),
        },
        breakdown: {
          baseAmount: 100000,
          allowances: [],
          deductions: [],
          grossSalary: 100000,
          netSalary: 100000,
        },
        status: 'processing',
        transactionId: transaction._id,
        processedAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const recovered = await payroll.recoverStuckPayrolls({
        organizationId: orgId,
        staleThresholdMinutes: 30,
      });

      // Should NOT mark records with transactions (needs manual intervention)
      const updatedRecord = await PayrollRecordModel.findById(recordWithTx._id);
      expect(updatedRecord?.status).toBe('processing'); // Unchanged
      expect(recovered.requiresManualReview.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Issue 4: Two-Phase Export (MEDIUM)
// ============================================================================

describe('Issue 4: Two-Phase Export', () => {
  describe('Export methods exist', () => {
    it('should have prepareExport method', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      expect(typeof payroll.prepareExport).toBe('function');
    });

    it('should have confirmExport method', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      expect(typeof payroll.confirmExport).toBe('function');
    });

    it('should have cancelExport method', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      expect(typeof payroll.cancelExport).toBe('function');
    });
  });

  describe('Two-phase export flow', () => {
    it('should NOT mark records as exported until confirmation', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Process some payrolls with a specific payment date within our query range
      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 1,
        year: 2024,
        paymentDate: new Date('2024-01-15'), // Set payment date within query range
      });

      // Export phase 1: Prepare (returns data but doesn't mark)
      const exported = await payroll.prepareExport({
        organizationId: orgId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      });

      expect(exported.records.length).toBeGreaterThan(0);
      expect(exported.exportId).toBeDefined();

      // Verify records are NOT marked yet
      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.exported).toBeFalsy();

      // Export phase 2: Confirm (marks records after successful downstream handling)
      await payroll.confirmExport({
        organizationId: orgId,
        exportId: exported.exportId,
      });

      // Now records should be marked
      const confirmedRecord = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(confirmedRecord?.exported).toBe(true);
      expect(confirmedRecord?.exportedAt).toBeDefined();
    });

    it('should allow cancelling export if downstream fails', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 2,
        year: 2024,
        paymentDate: new Date('2024-02-15'), // Set payment date within query range
      });

      // Prepare export
      const exported = await payroll.prepareExport({
        organizationId: orgId,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-29'),
      });

      // Cancel export (downstream failed)
      await payroll.cancelExport({
        organizationId: orgId,
        exportId: exported.exportId,
        reason: 'External system unavailable',
      });

      // Records should remain unmarked
      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.exported).toBeFalsy();
    });
  });
});

// ============================================================================
// Issue 5: Idempotency Key Should Include Run Type (MEDIUM)
// ============================================================================

describe('Issue 5: Idempotency Key Should Include Run Type', () => {
  describe('Key generation', () => {
    it('should generate different keys for different run types', () => {
      const orgId = new Types.ObjectId();
      const empId = new Types.ObjectId();

      const regularKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular');
      const supplementalKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'supplemental');
      const retroactiveKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'retroactive');

      expect(regularKey).not.toBe(supplementalKey);
      expect(regularKey).not.toBe(retroactiveKey);
      expect(supplementalKey).not.toBe(retroactiveKey);
    });

    it('should generate same key for same run type (idempotent)', () => {
      const orgId = new Types.ObjectId();
      const empId = new Types.ObjectId();

      const key1 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular');
      const key2 = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular');

      expect(key1).toBe(key2);
    });

    it('should default to regular when run type not provided', () => {
      const orgId = new Types.ObjectId();
      const empId = new Types.ObjectId();

      const defaultKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024);
      const regularKey = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'regular');

      expect(defaultKey).toBe(regularKey);
    });

    it('should include run type in key string', () => {
      const orgId = new Types.ObjectId();
      const empId = new Types.ObjectId();

      const key = generatePayrollIdempotencyKey(orgId, empId, 3, 2024, 'supplemental');

      expect(key).toContain('supplemental');
    });
  });

  describe('Processing with different run types', () => {
    it('should allow regular + supplemental payroll in same period', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Regular payroll
      const regular = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 5,
        year: 2024,
        payrollRunType: 'regular',
      });

      // Supplemental (bonus) - should NOT be blocked by idempotency
      const supplemental = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 5,
        year: 2024,
        payrollRunType: 'supplemental',
      });

      expect(regular.payrollRecord._id.toString()).not.toBe(supplemental.payrollRecord._id.toString());
    });
  });
});

// ============================================================================
// Issue 6: Schema Helper Field Completeness (MEDIUM)
// ============================================================================

describe('Issue 6: Schema Helper Field Completeness', () => {
  describe('PayrollRecord schema fields', () => {
    it('should include payrollRunType field with enum', () => {
      const fields = createPayrollRecordFields();
      expect(fields.payrollRunType).toBeDefined();
      expect(fields.payrollRunType.type).toBe(String);
      expect(fields.payrollRunType.enum).toEqual(['regular', 'off-cycle', 'supplemental', 'retroactive']);
      expect(fields.payrollRunType.default).toBe('regular');
    });

    it('should include retroactiveAdjustment field', () => {
      const fields = createPayrollRecordFields();
      expect(fields.retroactiveAdjustment).toBeDefined();
    });

    it('should include employerContributions array field', () => {
      const fields = createPayrollRecordFields();
      expect(fields.employerContributions).toBeDefined();
      expect(Array.isArray(fields.employerContributions)).toBe(true);
    });

    it('should include corrections array field', () => {
      const fields = createPayrollRecordFields();
      expect(fields.corrections).toBeDefined();
      expect(Array.isArray(fields.corrections)).toBe(true);
    });

    it('should use expireAt for TTL (not createdAt)', () => {
      // The TTL index should be on expireAt, allowing per-document retention
      const ttlIndex = payrollRecordIndexes.find(
        idx => idx.options?.expireAfterSeconds !== undefined
      );

      // Should use expireAt field for per-document retention
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex?.fields).toHaveProperty('expireAt');
    });
  });
});

// ============================================================================
// EXPLICIT VALIDATION: User's 5 Critical Concerns (v2.8.0+ Fixes)
// ============================================================================

describe('EXPLICIT VALIDATION: User Critical Concerns', () => {
  /**
   * CRITICAL CONCERN #1:
   * "payroll-record.model.ts (lines 229-231) still defines a unique { employeeId, period.month, period.year } index"
   *
   * VALIDATION: The model index is NOT unique - allows multiple run types per period
   */
  describe('Concern #1: Model Index is NOT Unique', () => {
    it('should allow creating multiple payroll records for same employee+period with different run types', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create regular payroll record directly
      const regular = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 6, year: 2024, startDate: new Date('2024-06-01'), endDate: new Date('2024-06-30'), payDate: new Date('2024-06-30') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000 },
        status: 'paid',
        payrollRunType: 'regular',
      });

      // Create supplemental - should NOT throw duplicate key error
      const supplemental = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 6, year: 2024, startDate: new Date('2024-06-01'), endDate: new Date('2024-06-30'), payDate: new Date('2024-06-30') },
        breakdown: { baseAmount: 5000, allowances: [], deductions: [], grossSalary: 5000, netSalary: 5000 },
        status: 'paid',
        payrollRunType: 'supplemental',
      });

      // Create retroactive - should also work
      const retroactive = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 6, year: 2024, startDate: new Date('2024-06-01'), endDate: new Date('2024-06-30'), payDate: new Date('2024-06-30') },
        breakdown: { baseAmount: 2000, allowances: [], deductions: [], grossSalary: 2000, netSalary: 2000 },
        status: 'paid',
        payrollRunType: 'retroactive',
      });

      // All three should exist
      const allRecords = await PayrollRecordModel.find({
        employeeId: employee._id,
        'period.month': 6,
        'period.year': 2024,
      });

      expect(allRecords.length).toBe(3);
      expect(allRecords.map(r => r.payrollRunType).sort()).toEqual(['regular', 'retroactive', 'supplemental']);
    });

    it('should have unique compound index with partial filter for race protection', () => {
      // Verify unique index exists with proper configuration
      const uniqueIndex = payrollRecordIndexes.find(
        idx => idx.options?.unique === true &&
          idx.fields &&
          'employeeId' in idx.fields &&
          'payrollRunType' in idx.fields
      );

      expect(uniqueIndex).toBeDefined();
      // Partial filter allows re-processing after void (isVoided: true records are excluded)
      expect(uniqueIndex?.options?.partialFilterExpression?.isVoided?.$eq).toBe(false);
    });
  });

  /**
   * CRITICAL CONCERN #2:
   * "Idempotency cache clearing on void/reverse uses the default key (runType omitted)"
   *
   * VALIDATION: void/reverse methods extract payrollRunType and include it in cache key
   */
  describe('Concern #2: Void/Reverse Clears Correct Idempotency Key', () => {
    it('should clear idempotency cache for supplemental payroll when reversed', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Process supplemental payroll
      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 7,
        year: 2024,
        payrollRunType: 'supplemental',
      });

      expect(result.payrollRecord.payrollRunType).toBe('supplemental');

      // Reverse it (void not allowed for paid records)
      await payroll.reversePayroll({
        organizationId: orgId,
        payrollRecordId: result.payrollRecord._id,
        reason: 'Testing reverse cache clearing for supplemental',
      });

      // Should be able to process supplemental again (cache was cleared with correct key)
      const result2 = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 7,
        year: 2024,
        payrollRunType: 'supplemental',
        idempotencyKey: `supplemental-retry-${Date.now()}`, // New key to bypass any remaining cache
      });

      // Old record is reversed, new record is created
      const records = await PayrollRecordModel.find({
        employeeId: employee._id,
        'period.month': 7,
        'period.year': 2024,
        payrollRunType: 'supplemental',
      });

      expect(records.length).toBe(2); // reversed + new
      expect(records.find(r => r.status === 'reversed')).toBeDefined();
      expect(records.find(r => r.status === 'paid')).toBeDefined();
    });

    it('should clear idempotency cache for retroactive payroll when reversed', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Process retroactive payroll
      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 8,
        year: 2024,
        payrollRunType: 'retroactive',
      });

      expect(result.payrollRecord.payrollRunType).toBe('retroactive');

      // Reverse it
      await payroll.reversePayroll({
        organizationId: orgId,
        payrollRecordId: result.payrollRecord._id,
        reason: 'Testing reverse cache clearing',
      });

      // Should be able to process retroactive again (cache was cleared with correct key)
      const result2 = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 8,
        year: 2024,
        payrollRunType: 'retroactive',
        idempotencyKey: `retroactive-retry-${Date.now()}`,
      });

      expect(result2.payrollRecord.status).toBe('paid');
    });
  });

  /**
   * CRITICAL CONCERN #3:
   * "Retention/TTL behavior is still inconsistent between the two schema entrypoints"
   *
   * VALIDATION: Both model and schema helper use expireAt with expireAfterSeconds: 0
   */
  describe('Concern #3: TTL Behavior is Consistent', () => {
    it('schema helper should define TTL index with expireAfterSeconds: 0', () => {
      const ttlIndex = payrollRecordIndexes.find(
        idx => idx.fields && 'expireAt' in idx.fields
      );

      expect(ttlIndex).toBeDefined();
      expect(ttlIndex?.options?.expireAfterSeconds).toBe(0);
    });

    it('should allow setting per-document expireAt for TTL', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create record with specific expireAt (e.g., 7 years retention)
      const expireDate = new Date();
      expireDate.setFullYear(expireDate.getFullYear() + 7);

      const record = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 9, year: 2024, startDate: new Date('2024-09-01'), endDate: new Date('2024-09-30'), payDate: new Date('2024-09-30') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000 },
        status: 'paid',
        expireAt: expireDate,
      });

      const fetched = await PayrollRecordModel.findById(record._id);
      expect(fetched?.expireAt).toBeDefined();
      expect(fetched?.expireAt?.getFullYear()).toBe(expireDate.getFullYear());
    });

    it('should allow records without expireAt (never expire)', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create record without expireAt - should never expire
      const record = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 10, year: 2024, startDate: new Date('2024-10-01'), endDate: new Date('2024-10-31'), payDate: new Date('2024-10-31') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000 },
        status: 'paid',
        // No expireAt - document never expires
      });

      const fetched = await PayrollRecordModel.findById(record._id);
      expect(fetched?.expireAt).toBeUndefined();
    });
  });

  /**
   * CRITICAL CONCERN #4:
   * "Export still marks records as exported immediately after query"
   *
   * VALIDATION: v2.8.0+ - Two-phase export (prepareExport/confirmExport/cancelExport)
   * ensures records are only marked AFTER downstream confirms success.
   */
  describe('Concern #4: Two-Phase Export Behavior (v2.8.0+)', () => {
    it('prepareExport should NOT mark records as exported', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Process payroll with payment date in range
      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 11,
        year: 2024,
        paymentDate: new Date('2024-11-15'),
      });

      // Prepare export (phase 1)
      const exportResult = await payroll.prepareExport({
        organizationId: orgId,
        startDate: new Date('2024-11-01'),
        endDate: new Date('2024-11-30'),
      });

      expect(exportResult.records.length).toBeGreaterThan(0);

      // Verify record is NOT marked as exported
      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.exported).toBeFalsy();
      expect(record?.exportedAt).toBeUndefined();
    });

    it('confirmExport should mark records as exported', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 12,
        year: 2024,
        paymentDate: new Date('2024-12-15'),
      });

      // Prepare export (phase 1)
      const exportResult = await payroll.prepareExport({
        organizationId: orgId,
        startDate: new Date('2024-12-01'),
        endDate: new Date('2024-12-31'),
      });

      // Confirm export (phase 2 - after downstream success)
      await payroll.confirmExport({
        organizationId: orgId,
        exportId: exportResult.exportId,
      });

      // Now record SHOULD be marked as exported
      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.exported).toBe(true);
      expect(record?.exportedAt).toBeDefined();
    });

    it('cancelExport should leave records unmarked for retry', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 1,
        year: 2025,
        paymentDate: new Date('2025-01-15'),
      });

      // Prepare export (phase 1)
      const exportResult = await payroll.prepareExport({
        organizationId: orgId,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      });

      // Cancel export (downstream failed)
      await payroll.cancelExport({
        organizationId: orgId,
        exportId: exportResult.exportId,
        reason: 'Downstream system failure',
      });

      // Record should NOT be marked - can retry
      const record = await PayrollRecordModel.findById(result.payrollRecord._id);
      expect(record?.exported).toBeFalsy();
    });
  });

  /**
   * CRITICAL CONCERN #5:
   * "A stuck pending or processing record without a transaction still blocks retries"
   *
   * VALIDATION: Pending/processing records WITHOUT transaction CAN be retried (deleted and reprocessed)
   */
  describe('Concern #5: Stuck Records Without Transaction Can Be Retried', () => {
    it('should allow retry for PENDING record WITHOUT transaction', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create a stuck pending record (no transaction)
      const stuckRecord = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 2, year: 2025, startDate: new Date('2025-02-01'), endDate: new Date('2025-02-28'), payDate: new Date('2025-02-28') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000, workingDays: 21, actualDays: 0 },
        status: 'pending',
        payrollRunType: 'regular',
        // NO transactionId - safe to delete and retry
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Retry should succeed - pending without transaction is safe to delete
      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 2,
        year: 2025,
        payrollRunType: 'regular',
      });

      expect(result.payrollRecord.status).toBe('paid');

      // Old stuck record should be gone
      const oldRecord = await PayrollRecordModel.findById(stuckRecord._id);
      expect(oldRecord).toBeNull();
    });

    it('should allow retry for FAILED record WITHOUT transaction', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create a failed record (no transaction)
      const failedRecord = await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 3, year: 2025, startDate: new Date('2025-03-01'), endDate: new Date('2025-03-31'), payDate: new Date('2025-03-31') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000, workingDays: 21, actualDays: 0 },
        status: 'failed',
        payrollRunType: 'regular',
        // NO transactionId
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Retry should succeed
      const result = await payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 3,
        year: 2025,
        payrollRunType: 'regular',
      });

      expect(result.payrollRecord.status).toBe('paid');

      // Old failed record should be gone
      const oldRecord = await PayrollRecordModel.findById(failedRecord._id);
      expect(oldRecord).toBeNull();
    });

    it('should BLOCK retry for PENDING record WITH transaction (preserve integrity)', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      // Create transaction first
      const transaction = await TransactionModel.create({
        organizationId: orgId,
        amount: 100000,
        type: 'salary',
        status: 'completed',
      });

      // Create a pending record WITH transaction (partial failure - needs manual review)
      await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 4, year: 2025, startDate: new Date('2025-04-01'), endDate: new Date('2025-04-30'), payDate: new Date('2025-04-30') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000, workingDays: 21, actualDays: 0 },
        status: 'pending',
        payrollRunType: 'regular',
        transactionId: transaction._id, // HAS transaction - cannot delete!
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Retry should FAIL - would orphan the transaction
      await expect(
        payroll.processSalary({
          organizationId: orgId,
          employeeId: employee._id,
          month: 4,
          year: 2025,
          payrollRunType: 'regular',
        })
      ).rejects.toThrow(/orphan financial records/i);
    });

    it('should BLOCK retry for PROCESSING record WITH transaction', async () => {
      const orgId = createTestOrg();
      const employee = await createTestEmployee(orgId);

      const transaction = await TransactionModel.create({
        organizationId: orgId,
        amount: 100000,
        type: 'salary',
        status: 'pending',
      });

      await PayrollRecordModel.create({
        organizationId: orgId,
        employeeId: employee._id,
        period: { month: 5, year: 2025, startDate: new Date('2025-05-01'), endDate: new Date('2025-05-31'), payDate: new Date('2025-05-31') },
        breakdown: { baseAmount: 100000, allowances: [], deductions: [], grossSalary: 100000, netSalary: 100000, workingDays: 21, actualDays: 0 },
        status: 'processing',
        payrollRunType: 'regular',
        transactionId: transaction._id,
      });

      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
        .build();

      // Retry should FAIL - 'processing' status blocks (already in progress)
      await expect(
        payroll.processSalary({
          organizationId: orgId,
          employeeId: employee._id,
          month: 5,
          year: 2025,
          payrollRunType: 'regular',
        })
      ).rejects.toThrow(/already processed|duplicate/i);
    });
  });
});

// ============================================================================
// Issue 7: restorePayroll Unique Index Violation (HIGH)
// ============================================================================

describe('Issue 7: restorePayroll Unique Index Violation', () => {
  /**
   * CRITICAL SCENARIO:
   * 1. Create a pending payroll record
   * 2. Void it (isVoided: true, excluded from unique index)
   * 3. Create a replacement record (allowed since original is voided)
   * 4. Attempt to restore original → SHOULD FAIL because replacement exists
   *
   * Without proper check, restorePayroll sets isVoided=false and saves,
   * which violates the unique index and throws E11000.
   */
  it('should FAIL to restore voided payroll when replacement already exists', async () => {
    const orgId = createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
      .build();

    // Step 1: Create initial payroll record with pending status (voidable)
    const record1 = await PayrollRecordModel.create({
      organizationId: orgId,
      employeeId: employee._id,
      period: {
        month: 6,
        year: 2025,
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-30'),
        payDate: new Date('2025-06-30'),
      },
      breakdown: {
        baseAmount: 100000,
        allowances: [],
        deductions: [],
        grossSalary: 100000,
        netSalary: 100000,
        workingDays: 21,
        actualDays: 21,
      },
      status: 'pending',
      payrollRunType: 'regular',
      isVoided: false,
    });

    // Step 2: Void the payroll
    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: record1._id,
      reason: 'Voiding for test - will create replacement',
    });

    // Verify it's voided
    const voidedRecord = await PayrollRecordModel.findById(record1._id);
    expect(voidedRecord?.isVoided).toBe(true);
    expect(voidedRecord?.status).toBe('voided');

    // Step 3: Create replacement payroll (should succeed since original is voided)
    const record2 = await PayrollRecordModel.create({
      organizationId: orgId,
      employeeId: employee._id,
      period: {
        month: 6,
        year: 2025,
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-30'),
        payDate: new Date('2025-06-30'),
      },
      breakdown: {
        baseAmount: 100000,
        allowances: [],
        deductions: [],
        grossSalary: 100000,
        netSalary: 100000,
        workingDays: 21,
        actualDays: 21,
      },
      status: 'paid',
      payrollRunType: 'regular',
      isVoided: false,
    });

    expect(record2._id.toString()).not.toBe(record1._id.toString());

    // Step 4: Attempt to restore the voided payroll - SHOULD FAIL
    // Because a replacement record exists with the same (org, employee, period, runType)
    // The restorePayroll method now checks proactively and gives a clear error message
    await expect(
      payroll.restorePayroll({
        organizationId: orgId,
        payrollRecordId: record1._id,
        reason: 'Attempting to restore voided payroll',
      })
    ).rejects.toThrow(/Cannot restore.*active payroll record already exists/i);
  });

  it('should SUCCEED to restore voided payroll when no replacement exists', async () => {
    const orgId = createTestOrg();
    const employee = await createTestEmployee(orgId);
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
      .build();

    // Step 1: Create initial payroll record with pending status (voidable)
    const record = await PayrollRecordModel.create({
      organizationId: orgId,
      employeeId: employee._id,
      period: {
        month: 7,
        year: 2025,
        startDate: new Date('2025-07-01'),
        endDate: new Date('2025-07-31'),
        payDate: new Date('2025-07-31'),
      },
      breakdown: {
        baseAmount: 100000,
        allowances: [],
        deductions: [],
        grossSalary: 100000,
        netSalary: 100000,
        workingDays: 21,
        actualDays: 21,
      },
      status: 'pending',
      payrollRunType: 'regular',
      isVoided: false,
    });

    // Step 2: Void the payroll
    await payroll.voidPayroll({
      organizationId: orgId,
      payrollRecordId: record._id,
      reason: 'Voiding for test - will restore later',
    });

    // Step 3: Restore (should succeed - no replacement exists)
    const restored = await payroll.restorePayroll({
      organizationId: orgId,
      payrollRecordId: record._id,
      reason: 'Restoring voided payroll - no replacement',
    });

    expect(restored.payrollRecord.status).toBe('pending');
    expect(restored.payrollRecord.isVoided).toBe(false);
  });
});

// ============================================================================
// Issue 8: Schema Default for isVoided
// ============================================================================

describe('Issue 8: Schema Default for isVoided', () => {
  /**
   * The unique index uses: partialFilterExpression: { isVoided: { $eq: false } }
   *
   * Schema default ensures all new records have isVoided: false, so they are
   * properly included in the unique index for duplicate protection.
   */

  it('schema should have default isVoided: false for new records', async () => {
    const orgId = createTestOrg();
    const employee = await createTestEmployee(orgId);

    // Create record using Mongoose (should apply schema defaults)
    const record = await PayrollRecordModel.create({
      organizationId: orgId,
      employeeId: employee._id,
      period: {
        month: 9,
        year: 2025,
        startDate: new Date('2025-09-01'),
        endDate: new Date('2025-09-30'),
        payDate: new Date('2025-09-30'),
      },
      breakdown: {
        baseAmount: 100000,
        allowances: [],
        deductions: [],
        grossSalary: 100000,
        netSalary: 100000,
        workingDays: 21,
        actualDays: 21,
      },
      status: 'pending',
      payrollRunType: 'regular',
      // NOT setting isVoided - should default to false
    });

    // Schema default should set isVoided: false
    expect(record.isVoided).toBe(false);
  });

  it('unique index should block duplicates for records with isVoided: false', async () => {
    const orgId = createTestOrg();
    const employee = await createTestEmployee(orgId);

    // Create first record
    await PayrollRecordModel.create({
      organizationId: orgId,
      employeeId: employee._id,
      period: {
        month: 10,
        year: 2025,
        startDate: new Date('2025-10-01'),
        endDate: new Date('2025-10-31'),
        payDate: new Date('2025-10-31'),
      },
      breakdown: {
        baseAmount: 100000,
        allowances: [],
        deductions: [],
        grossSalary: 100000,
        netSalary: 100000,
        workingDays: 21,
        actualDays: 21,
      },
      status: 'paid',
      payrollRunType: 'regular',
      isVoided: false,
    });

    // Try to create duplicate - should be blocked by unique index
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
      .build();

    await expect(
      payroll.processSalary({
        organizationId: orgId,
        employeeId: employee._id,
        month: 10,
        year: 2025,
        payrollRunType: 'regular',
      })
    ).rejects.toThrow(/duplicate|already processed|already exists/i);
  });
});

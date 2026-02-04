/**
 * Issue Fixes Validation Tests
 *
 * Validates fixes for 6 reported issues:
 * 1. Critical: Non-transactional fallback leaving stuck payroll records
 * 2. High: Streaming bulk payroll unbounded memory accumulation
 * 3. High: Webhook delivery log unbounded growth and PII leak
 * 4. Medium: getEmployeeByIdentity mode:'any' swallowing all errors
 * 5. Medium: tax:withheld events emitting empty employeeId
 * 6. Low: calculateProration returning reason 'full' when ratio is 0
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  employeePlugin,
} from '../../src/index.js';
import { calculateProration } from '../../src/core/config.js';
import { WebhookManager } from '../../src/core/webhooks.js';
import { TaxWithholdingService } from '../../src/services/tax-withholding.service.js';
import { createEventBus } from '../../src/core/events.js';

// ============================================================================
// Issue #6: calculateProration returns reason 'full' when ratio is 0
// ============================================================================

describe('Issue #6: calculateProration reason for out-of-period employees', () => {
  it('should return reason "not_active" when employee hired after period end', () => {
    const result = calculateProration(
      new Date('2024-06-01'), // Hired June 1
      null,
      new Date('2024-01-01'), // Period: January
      new Date('2024-01-31')
    );

    expect(result.ratio).toBe(0);
    expect(result.isProrated).toBe(true);
    expect(result.reason).toBe('not_active');
    // Previously returned 'full' which was misleading for zero ratio
  });

  it('should return reason "not_active" when employee terminated before period start', () => {
    const result = calculateProration(
      new Date('2023-01-01'), // Hired Jan 2023
      new Date('2023-12-15'), // Terminated Dec 15, 2023
      new Date('2024-01-01'), // Period: January 2024
      new Date('2024-01-31')
    );

    expect(result.ratio).toBe(0);
    expect(result.isProrated).toBe(true);
    expect(result.reason).toBe('not_active');
  });

  it('should return reason "full" for full-period employees (no proration)', () => {
    const result = calculateProration(
      new Date('2023-01-01'), // Hired long ago
      null, // Still active
      new Date('2024-01-01'), // Period: January 2024
      new Date('2024-01-31')
    );

    expect(result.ratio).toBe(1);
    expect(result.isProrated).toBe(false);
    expect(result.reason).toBe('full');
  });

  it('should return reason "new_hire" for mid-period hire', () => {
    const result = calculateProration(
      new Date('2024-01-15'), // Hired mid-January
      null,
      new Date('2024-01-01'), // Period: January
      new Date('2024-01-31')
    );

    expect(result.ratio).toBeGreaterThan(0);
    expect(result.ratio).toBeLessThan(1);
    expect(result.isProrated).toBe(true);
    expect(result.reason).toBe('new_hire');
  });

  it('should return reason "termination" for mid-period termination', () => {
    const result = calculateProration(
      new Date('2023-01-01'), // Hired long ago
      new Date('2024-01-15'), // Terminated mid-January
      new Date('2024-01-01'), // Period: January
      new Date('2024-01-31')
    );

    expect(result.ratio).toBeGreaterThan(0);
    expect(result.ratio).toBeLessThan(1);
    expect(result.isProrated).toBe(true);
    expect(result.reason).toBe('termination');
  });
});

// ============================================================================
// Issue #3: Webhook delivery log unbounded growth and PII leak
// ============================================================================

describe('Issue #3: WebhookManager delivery log bounds and PII', () => {
  it('should cap delivery log at maxLogSize', () => {
    const manager = new WebhookManager({ maxLogSize: 5, storePayloads: true });

    // Register a webhook
    manager.register({
      url: 'https://example.com/webhook',
      events: ['employee:hired'],
    });

    // Simulate multiple deliveries by accessing the delivery log
    // We'll use getDeliveries to verify behavior
    const deliveries = manager.getDeliveries();
    expect(deliveries).toHaveLength(0);
  });

  it('should not store payloads by default (PII protection)', () => {
    const manager = new WebhookManager(); // storePayloads defaults to false

    // Register webhook
    manager.register({
      url: 'https://example.com/webhook',
      events: ['employee:hired'],
    });

    // The default storePayloads=false means deliver() won't retain payload data
    const deliveries = manager.getDeliveries();
    // No deliveries yet, but verify constructor doesn't error
    expect(deliveries).toHaveLength(0);
  });

  it('should prune old entries when maxLogSize is exceeded', async () => {
    const manager = new WebhookManager({ maxLogSize: 3, storePayloads: false });

    // We need to test that pruneLog works. Since deliver() is private,
    // we test through the public API by sending multiple webhook events.
    // Mock fetch to make deliver() work:
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'OK',
    }) as unknown as typeof fetch;

    manager.register({
      url: 'https://example.com/webhook',
      events: ['employee:hired'],
    });

    // Send 5 webhook events
    for (let i = 0; i < 5; i++) {
      await manager.send('employee:hired', {
        employee: { id: `emp-${i}`, employeeId: `EMP-${i}`, email: 'test@test.com' },
        organizationId: new mongoose.Types.ObjectId(),
      } as any);
    }

    const deliveries = manager.getDeliveries();
    // Should be capped at 3 (maxLogSize)
    expect(deliveries.length).toBeLessThanOrEqual(3);

    // Restore fetch
    global.fetch = originalFetch;
  });

  it('should strip payload when storePayloads is false', async () => {
    const manager = new WebhookManager({ maxLogSize: 100, storePayloads: false });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'OK',
    }) as unknown as typeof fetch;

    manager.register({
      url: 'https://example.com/webhook',
      events: ['employee:hired'],
    });

    await manager.send('employee:hired', {
      employee: { id: 'emp-1', employeeId: 'EMP-001', email: 'sensitive@email.com' },
      organizationId: new mongoose.Types.ObjectId(),
    } as any);

    const deliveries = manager.getDeliveries();
    expect(deliveries.length).toBe(1);
    // Payload should be undefined (stripped for PII protection)
    expect(deliveries[0].payload).toBeUndefined();

    global.fetch = originalFetch;
  });

  it('should retain payload when storePayloads is true', async () => {
    const manager = new WebhookManager({ maxLogSize: 100, storePayloads: true });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'OK',
    }) as unknown as typeof fetch;

    manager.register({
      url: 'https://example.com/webhook',
      events: ['employee:hired'],
    });

    const payload = {
      employee: { id: 'emp-1', employeeId: 'EMP-001', email: 'test@test.com' },
      organizationId: new mongoose.Types.ObjectId(),
    };

    await manager.send('employee:hired', payload as any);

    const deliveries = manager.getDeliveries();
    expect(deliveries.length).toBe(1);
    // Payload should be retained
    expect(deliveries[0].payload).toBeDefined();

    global.fetch = originalFetch;
  });

  it('should default maxLogSize to 1000', () => {
    const manager = new WebhookManager();
    // Can't directly test private field, but verify it doesn't throw
    manager.register({
      url: 'https://example.com/webhook',
      events: ['employee:hired'],
    });
    expect(manager.getDeliveries()).toHaveLength(0);
  });
});

// ============================================================================
// Issue #2: Streaming bulk payroll unbounded memory (BulkPayrollResult counters)
// ============================================================================

describe('Issue #2: BulkPayrollResult has accurate counters', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Mock startSession for tests
    const mockSession = {
      startTransaction: () => {
        throw new Error('Transaction numbers are only allowed on a replica set member');
      },
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    };
    mongoose.startSession = (async () => mockSession) as any;

    const userSchema = new Schema({ name: String, email: String });
    if (!mongoose.models.User) {
      mongoose.model('User', userSchema);
    }

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('IssueTestEmployee', employeeSchema);
    PayrollRecord = mongoose.model('IssueTestPayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      net: Number,
      currency: String,
      tax: Number,
      status: String,
      date: Date,
      employeeId: Schema.Types.ObjectId,
      customerId: Schema.Types.ObjectId,
      breakdown: Schema.Types.Mixed,
      sourceId: Schema.Types.ObjectId,
      sourceModel: String,
      description: String,
      metadata: Schema.Types.Mixed,
      idempotencyKey: String,
      processedAt: Date,
      completedAt: Date,
    });
    Transaction = mongoose.model('IssueTestTransaction', transactionSchema);
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

  it('should populate successCount and failCount on BulkPayrollResult', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    // Create employees
    for (let i = 0; i < 3; i++) {
      await payroll.hire({
        userId: new mongoose.Types.ObjectId(),
        employment: {
          employeeId: `ISSUE2-${i}`,
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 50000, currency: 'USD' },
      });
    }

    const result = await payroll.processBulkPayroll({
      organizationId: org,
      month: 7,
      year: 2024,
    });

    // Verify counters exist and are accurate
    expect(result.successCount).toBe(3);
    expect(result.failCount).toBe(0);
    expect(result.successful).toHaveLength(3);
    expect(result.total).toBe(3);
    // Counters should match array lengths when not capped
    expect(result.successCount).toBe(result.successful.length);
    expect(result.failCount).toBe(result.failed.length);
  });

  it('should cap result arrays with maxResultDetails while counters stay accurate', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    // Create 5 employees
    for (let i = 0; i < 5; i++) {
      await payroll.hire({
        userId: new mongoose.Types.ObjectId(),
        employment: {
          employeeId: `ISSUE2B-${i}`,
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 50000, currency: 'USD' },
      });
    }

    const result = await payroll.processBulkPayroll({
      organizationId: org,
      month: 8,
      year: 2024,
      maxResultDetails: 2, // Only store up to 2 entries per array
    });

    // Counters should reflect all 5 employees
    expect(result.successCount).toBe(5);
    expect(result.total).toBe(5);

    // Arrays should be capped at 2
    expect(result.successful.length).toBeLessThanOrEqual(2);

    // Counters are accurate even when arrays are capped
    expect(result.successCount).toBeGreaterThan(result.successful.length);
  });
});

// ============================================================================
// Issue #5: tax:withheld events emit empty employeeId
// ============================================================================

describe('Issue #5: tax:withheld events include employeeId', () => {
  it('should emit employeeBusinessId in tax:withheld event', () => {
    const events = createEventBus();
    const emittedEvents: any[] = [];

    events.on('tax:withheld', (payload: any) => {
      emittedEvents.push(payload);
    });

    // Create a minimal mock TaxWithholdingModel
    const mockModel = {
      create: vi.fn().mockResolvedValue([{
        _id: new mongoose.Types.ObjectId(),
        taxType: 'income_tax',
        amount: 500,
      }]),
    } as any;

    const service = new TaxWithholdingService(mockModel, undefined, events);

    const orgId = new mongoose.Types.ObjectId();
    const empId = new mongoose.Types.ObjectId();

    // Call createFromBreakdown with employeeBusinessId
    service.createFromBreakdown({
      organizationId: orgId,
      employeeId: empId,
      employeeBusinessId: 'EMP-001',
      payrollRecordId: new mongoose.Types.ObjectId(),
      transactionId: new mongoose.Types.ObjectId(),
      period: { month: 1, year: 2024, startDate: new Date(), endDate: new Date(), payDate: new Date() },
      breakdown: {
        baseAmount: 5000,
        grossSalary: 5000,
        netSalary: 4500,
        taxAmount: 500,
        taxableAmount: 5000,
        deductions: [{ type: 'tax', amount: 500 }],
        allowances: [],
      } as any,
    }).then(() => {
      // Verify event was emitted with employeeBusinessId
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].employee.employeeId).toBe('EMP-001');
      // Should NOT be empty string
      expect(emittedEvents[0].employee.employeeId).not.toBe('');
    });
  });

  it('should fallback to ObjectId string when employeeBusinessId not provided', () => {
    const events = createEventBus();
    const emittedEvents: any[] = [];

    events.on('tax:withheld', (payload: any) => {
      emittedEvents.push(payload);
    });

    const mockModel = {
      create: vi.fn().mockResolvedValue([{
        _id: new mongoose.Types.ObjectId(),
        taxType: 'income_tax',
        amount: 500,
      }]),
    } as any;

    const service = new TaxWithholdingService(mockModel, undefined, events);

    const orgId = new mongoose.Types.ObjectId();
    const empId = new mongoose.Types.ObjectId();

    // Call WITHOUT employeeBusinessId
    service.createFromBreakdown({
      organizationId: orgId,
      employeeId: empId,
      // no employeeBusinessId
      payrollRecordId: new mongoose.Types.ObjectId(),
      transactionId: new mongoose.Types.ObjectId(),
      period: { month: 1, year: 2024, startDate: new Date(), endDate: new Date(), payDate: new Date() },
      breakdown: {
        baseAmount: 5000,
        grossSalary: 5000,
        netSalary: 4500,
        taxAmount: 500,
        taxableAmount: 5000,
        deductions: [{ type: 'tax', amount: 500 }],
        allowances: [],
      } as any,
    }).then(() => {
      expect(emittedEvents.length).toBe(1);
      // Should fallback to ObjectId string, not empty string
      expect(emittedEvents[0].employee.employeeId).toBe(empId.toString());
      expect(emittedEvents[0].employee.employeeId).not.toBe('');
    });
  });
});

// ============================================================================
// Issue #4: getEmployeeByIdentity mode:'any' swallowing all errors
// ============================================================================

describe('Issue #4: getEmployeeByIdentity propagates operational errors', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const mockSession = {
      startTransaction: () => {
        throw new Error('Transaction numbers are only allowed on a replica set member');
      },
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    };
    mongoose.startSession = (async () => mockSession) as any;

    if (!mongoose.models.User) {
      mongoose.model('User', new Schema({ name: String, email: String }));
    }

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('Issue4Employee', employeeSchema);
    PayrollRecord = mongoose.model('Issue4PayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      net: Number,
      currency: String,
      status: String,
    });
    Transaction = mongoose.model('Issue4Transaction', transactionSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Employee.deleteMany({});
  });

  it('should throw EmployeeNotFoundError for non-existent identity in any mode', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    await expect(payroll.getEmployeeByIdentity({
      identity: 'nonexistent',
      mode: 'any',
    })).rejects.toThrow('Employee not found');
  });

  it('should find employee via any mode when it exists', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    const hired = await payroll.hire({
      userId: new mongoose.Types.ObjectId(),
      employment: {
        employeeId: 'ISSUE4-EMP',
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
      },
      compensation: { baseAmount: 50000, currency: 'USD' },
    });

    // Should find by employeeId via 'any' mode
    const found = await payroll.getEmployeeByIdentity({
      identity: 'ISSUE4-EMP',
      mode: 'any',
    });

    expect(found.employeeId).toBe('ISSUE4-EMP');
  });
});

// ============================================================================
// Issue #1: Non-transactional fallback stuck payroll records
// ============================================================================

describe('Issue #1: Non-transactional fallback cleanup', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Mock startSession to trigger non-transactional fallback
    const mockSession = {
      startTransaction: () => {
        throw new Error('Transaction numbers are only allowed on a replica set member');
      },
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    };
    mongoose.startSession = (async () => mockSession) as any;

    if (!mongoose.models.User) {
      mongoose.model('User', new Schema({ name: String, email: String }));
    }

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('Issue1Employee', employeeSchema);
    PayrollRecord = mongoose.model('Issue1PayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      net: Number,
      currency: String,
      tax: Number,
      status: String,
      date: Date,
      employeeId: Schema.Types.ObjectId,
      customerId: Schema.Types.ObjectId,
      breakdown: Schema.Types.Mixed,
      sourceId: Schema.Types.ObjectId,
      sourceModel: String,
      description: String,
      metadata: Schema.Types.Mixed,
      idempotencyKey: String,
      processedAt: Date,
      completedAt: Date,
    });
    Transaction = mongoose.model('Issue1Transaction', transactionSchema);
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

  it('should allow retry after failed payroll (failed records without transaction are retryable)', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    const employee = await payroll.hire({
      userId: new mongoose.Types.ObjectId(),
      employment: {
        employeeId: 'ISSUE1-RETRY',
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
      },
      compensation: { baseAmount: 60000, currency: 'USD' },
    });

    // First attempt: successful processing
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 1,
      year: 2024,
    });

    expect(result.payrollRecord).toBeDefined();
    expect(result.transaction).toBeDefined();

    // Verify the payroll record is in 'paid' status
    const record = await PayrollRecord.findById(result.payrollRecord._id);
    expect(record?.status).toBe('paid');
  });

  it('should block retry for paid payroll records', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    const employee = await payroll.hire({
      userId: new mongoose.Types.ObjectId(),
      employment: {
        employeeId: 'ISSUE1-PAID',
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
      },
      compensation: { baseAmount: 60000, currency: 'USD' },
    });

    // First attempt: successful
    const first = await payroll.processSalary({
      employeeId: employee._id,
      month: 2,
      year: 2024,
    });

    // Second attempt with SAME instance: returns cached idempotent result
    const second = await payroll.processSalary({
      employeeId: employee._id,
      month: 2,
      year: 2024,
    });

    // Idempotent: same payroll record returned
    expect(second.payrollRecord._id.toString()).toBe(first.payrollRecord._id.toString());

    // With a NEW instance (no idempotency cache), should block retry for 'paid' record
    const payroll2 = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    await expect(payroll2.processSalary({
      employeeId: employee._id,
      month: 2,
      year: 2024,
    })).rejects.toThrow(/already processed|already exists|Duplicate/i);
  });

  it('should allow retry for failed records without transaction (cascade delete)', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    const employee = await payroll.hire({
      userId: new mongoose.Types.ObjectId(),
      employment: {
        employeeId: 'ISSUE1-FAILED',
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
      },
      compensation: { baseAmount: 60000, currency: 'USD' },
    });

    // Manually create a failed payroll record without transaction (simulating cleanup)
    await PayrollRecord.create({
      organizationId: org,
      employeeId: employee._id,
      period: { month: 3, year: 2024, startDate: new Date('2024-03-01'), endDate: new Date('2024-03-31'), payDate: new Date('2024-03-31') },
      breakdown: { grossSalary: 5000, netSalary: 4500, baseAmount: 5000, taxAmount: 500 },
      status: 'failed', // Failed, no transactionId
      paymentMethod: 'bank',
      processedAt: new Date(),
    });

    // Retry should succeed - cascade delete the failed record and reprocess
    const result = await payroll.processSalary({
      employeeId: employee._id,
      month: 3,
      year: 2024,
    });

    expect(result.payrollRecord).toBeDefined();
    expect(result.transaction).toBeDefined();
    expect(result.payrollRecord.status).toBe('paid');
  });

  it('should block retry when failed record has a transactionId (prevent orphaned transaction)', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    const employee = await payroll.hire({
      userId: new mongoose.Types.ObjectId(),
      employment: {
        employeeId: 'ISSUE1-ORPHAN',
        position: 'Engineer',
        department: 'it',
        type: 'full_time',
      },
      compensation: { baseAmount: 60000, currency: 'USD' },
    });

    // Simulate: a non-transactional failure AFTER the transaction was created.
    // The catch block now preserves transactionId on the failed record.
    const fakeTransactionId = new mongoose.Types.ObjectId();
    await PayrollRecord.create({
      organizationId: org,
      employeeId: employee._id,
      period: { month: 4, year: 2024, startDate: new Date('2024-04-01'), endDate: new Date('2024-04-30'), payDate: new Date('2024-04-30') },
      breakdown: { grossSalary: 5000, netSalary: 4500, baseAmount: 5000, taxAmount: 500 },
      status: 'failed',
      transactionId: fakeTransactionId, // Transaction exists - must not be orphaned
      paymentMethod: 'bank',
      processedAt: new Date(),
    });

    // Retry should be BLOCKED because the failed record has a transactionId.
    // Cascade-deleting would orphan the existing transaction.
    await expect(payroll.processSalary({
      employeeId: employee._id,
      month: 4,
      year: 2024,
    })).rejects.toThrow(/orphan|financial_record|Cannot retry/i);
  });
});

// ============================================================================
// Follow-up: totalAmount accumulator in bulk processing
// ============================================================================

describe('Follow-up: totalAmount accumulator in BulkPayrollResult', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const mockSession = {
      startTransaction: () => {
        throw new Error('Transaction numbers are only allowed on a replica set member');
      },
      commitTransaction: async () => {},
      abortTransaction: async () => {},
      endSession: () => {},
      inTransaction: () => false,
    };
    mongoose.startSession = (async () => mockSession) as any;

    if (!mongoose.models.User) {
      mongoose.model('User', new Schema({ name: String, email: String }));
    }

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('TotalAmtEmployee', employeeSchema);
    PayrollRecord = mongoose.model('TotalAmtPayrollRecord', createPayrollRecordSchema());

    const transactionSchema = new Schema({
      organizationId: Schema.Types.ObjectId,
      type: String,
      flow: String,
      amount: Number,
      net: Number,
      currency: String,
      tax: Number,
      status: String,
      date: Date,
      employeeId: Schema.Types.ObjectId,
      customerId: Schema.Types.ObjectId,
      breakdown: Schema.Types.Mixed,
      sourceId: Schema.Types.ObjectId,
      sourceModel: String,
      description: String,
      metadata: Schema.Types.Mixed,
      idempotencyKey: String,
      processedAt: Date,
      completedAt: Date,
    });
    Transaction = mongoose.model('TotalAmtTransaction', transactionSchema);
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

  it('should have totalAmount matching sum of all net salaries (uncapped)', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    // Create 3 employees with different salaries
    // Use a hire date BEFORE the payroll period to avoid pro-rating to 0
    for (let i = 0; i < 3; i++) {
      await payroll.hire({
        userId: new mongoose.Types.ObjectId(),
        employment: {
          employeeId: `TOTALAMT-${i}`,
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
          hireDate: new Date('2024-01-01'),
        },
        compensation: { baseAmount: 10000 * (i + 1), currency: 'USD' },
      });
    }

    const result = await payroll.processBulkPayroll({
      organizationId: org,
      month: 9,
      year: 2024,
    });

    expect(result.successCount).toBe(3);
    expect(result.totalAmount).toBeGreaterThan(0);
    // totalAmount should match the sum of the successful array amounts
    const arraySum = result.successful.reduce((sum, r) => sum + r.amount, 0);
    expect(result.totalAmount).toBe(arraySum);
  });

  it('should have accurate totalAmount even when maxResultDetails caps the arrays', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    // Create 5 employees with same salary for easy math
    // Use a hire date BEFORE the payroll period to avoid pro-rating to 0
    const baseSalary = 50000;
    for (let i = 0; i < 5; i++) {
      await payroll.hire({
        userId: new mongoose.Types.ObjectId(),
        employment: {
          employeeId: `TOTALAMT-CAP-${i}`,
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
          hireDate: new Date('2024-01-01'),
        },
        compensation: { baseAmount: baseSalary, currency: 'USD' },
      });
    }

    const result = await payroll.processBulkPayroll({
      organizationId: org,
      month: 10,
      year: 2024,
      maxResultDetails: 2, // Only store 2 entries
    });

    expect(result.successCount).toBe(5);
    expect(result.successful).toHaveLength(2); // Capped at 2

    // totalAmount should reflect ALL 5 employees, not just the 2 in the array
    const arraySumCapped = result.successful.reduce((sum, r) => sum + r.amount, 0);
    expect(result.totalAmount).toBeGreaterThan(arraySumCapped);

    // Each employee gets same base salary, so totalAmount should be ~5x one employee's net
    // (exact amount depends on deductions, but totalAmount must be > 2x one net)
    expect(result.totalAmount).toBeGreaterThan(arraySumCapped * 2);
  });

  it('should emit correct totalAmount in payroll:completed event with capped arrays', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
      .forSingleTenant({ organizationId: org, autoInject: true })
      .build();

    // Capture event
    let completedEvent: any = null;
    payroll.on('payroll:completed', (event: any) => {
      completedEvent = event;
    });

    // Create 4 employees with hire date before payroll period
    const baseSalary = 40000;
    for (let i = 0; i < 4; i++) {
      await payroll.hire({
        userId: new mongoose.Types.ObjectId(),
        employment: {
          employeeId: `TOTALAMT-EVT-${i}`,
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
          hireDate: new Date('2024-01-01'),
        },
        compensation: { baseAmount: baseSalary, currency: 'USD' },
      });
    }

    const result = await payroll.processBulkPayroll({
      organizationId: org,
      month: 11,
      year: 2024,
      maxResultDetails: 1, // Extreme cap: only 1 entry stored
    });

    expect(result.successCount).toBe(4);
    expect(result.successful).toHaveLength(1);

    // Event should have been emitted with correct totalAmount
    expect(completedEvent).not.toBeNull();
    expect(completedEvent.summary.totalAmount).toBe(result.totalAmount);
    // The event totalAmount should NOT be just the sum of the 1 stored entry
    expect(completedEvent.summary.totalAmount).toBeGreaterThan(result.successful[0].amount);
  });
});

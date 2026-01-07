/**
 * Webhook Tests
 * Ensures events trigger HTTP notifications
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '../src/index.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('Webhooks (Stripe-style)', () => {
  let mongoServer: MongoMemoryServer;
  let Employee: mongoose.Model<any>;
  let PayrollRecord: mongoose.Model<any>;
  let Transaction: mongoose.Model<any>;

  const org = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Mock startSession for tests (MongoMemoryServer doesn't support transactions)
    mongoose.startSession = (async () => null) as any;

    // Create User model (referenced by Employee)
    const userSchema = new Schema({ name: String, email: String });
    mongoose.model('User', userSchema);

    const employeeSchema = createEmployeeSchema();
    employeeSchema.plugin(employeePlugin);
    Employee = mongoose.model('Employee', employeeSchema);
    PayrollRecord = mongoose.model('PayrollRecord', createPayrollRecordSchema());

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
    Transaction = mongoose.model('Transaction', transactionSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Employee.deleteMany({});
    await PayrollRecord.deleteMany({});
    await Transaction.deleteMany({});
    vi.clearAllMocks();
  });

  describe('Webhook Registration', () => {
    it('should register webhook for specific events', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      // Mock successful webhook response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      // Register webhook
      payroll.registerWebhook({
        url: 'https://example.com/webhooks/payroll',
        events: ['employee:hired'],
      });

      // Trigger event
      const employee = await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Wait for async webhook delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify webhook was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhooks/payroll',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Payroll-Event': 'employee:hired',
          }),
        })
      );
    });

    it('should send webhooks for salary processed event', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      // Register webhook for salary events
      payroll.registerWebhook({
        url: 'https://example.com/webhooks/salary',
        events: ['salary:processed'],
      });

      const employee = await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      // Process salary (should trigger webhook)
      await payroll.processSalary({
        employeeId: employee._id,
        organizationId: org,
        month: 3,
        year: 2024,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify webhook was called
      const calls = (global.fetch as any).mock.calls;
      const salaryWebhook = calls.find((call: any) => 
        call[0] === 'https://example.com/webhooks/salary'
      );

      expect(salaryWebhook).toBeDefined();
    });

    it('should support multiple webhooks for same event', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      // Register multiple webhooks
      payroll.registerWebhook({
        url: 'https://slack.com/webhook',
        events: ['employee:hired'],
      });

      payroll.registerWebhook({
        url: 'https://email.com/webhook',
        events: ['employee:hired'],
      });

      // Trigger event
      await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Both webhooks should be called
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should unregister webhooks', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const webhookUrl = 'https://example.com/webhook';

      payroll.registerWebhook({
        url: webhookUrl,
        events: ['employee:hired'],
      });

      // Unregister
      payroll.unregisterWebhook(webhookUrl);

      // Trigger event
      await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Webhook should NOT be called
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Webhook Delivery Log', () => {
    it('should track webhook deliveries', async () => {
      const payroll = createPayrollInstance()
        .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
        .build();

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      payroll.registerWebhook({
        url: 'https://example.com/webhook',
        events: ['employee:hired'],
      });

      await payroll.hire({
        userId: user,
        organizationId: org,
        employment: {
          employeeId: 'EMP-001',
          position: 'Engineer',
          department: 'it',
          type: 'full_time',
        },
        compensation: { baseAmount: 100000, currency: 'USD' },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check delivery log
      const deliveries = payroll.getWebhookDeliveries();
      expect(deliveries.length).toBeGreaterThan(0);
      expect(deliveries[0].status).toBe('sent');
      expect(deliveries[0].event).toBe('employee:hired');
    });
  });
});

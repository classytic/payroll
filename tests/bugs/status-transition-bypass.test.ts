/**
 * Bug Fix Test: Status transitions bypass state machine validation
 *
 * Issue: PayrollService.markAsPaid() and updateStatus() update status directly
 * without validating against PayrollStatusMachine, enabling invalid transitions
 * like voided → paid, reversed → processing.
 *
 * Expected: All status transitions should be validated through PayrollStateManager
 * or by checking PayrollStatusMachine before updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollService } from '../../src/services/payroll.service.js';
import { Repository } from '@classytic/mongokit';
import { getPayrollRecordModel } from '../../src/models/payroll-record.model.js';
import { multiTenantPlugin } from '../../src/core/repository-plugins.js';

describe('Bug: Status Transition Bypass', () => {
  let mongod: MongoMemoryServer;
  let conn: mongoose.Connection;
  let PayrollRecord: any;
  let payrollService: any;
  let organizationId: mongoose.Types.ObjectId;

  // Helper to create valid period data
  const createPeriod = (month: number, year: number) => ({
    month,
    year,
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0),
    payDate: new Date(year, month, 5),
  });

  // Helper to create valid breakdown data
  const createBreakdown = () => ({
    baseAmount: 5000,
    allowances: [],
    deductions: [],
    grossSalary: 5000,
    netSalary: 4500,
    taxableAmount: 5000,
    taxAmount: 500,
  });

  beforeEach(async () => {
    mongod = await MongoMemoryServer.create();
    conn = mongoose.createConnection(mongod.getUri());
    PayrollRecord = getPayrollRecordModel(conn);
    organizationId = new mongoose.Types.ObjectId();

    const repo = new Repository(PayrollRecord, [multiTenantPlugin(organizationId)]);
    payrollService = createPayrollService(repo, {} as any);
  });

  afterEach(async () => {
    await conn.close();
    await mongod.stop();
  });

  it('should reject invalid transition from voided to paid', async () => {
    // Create a voided payroll record
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'voided',
      voidedAt: new Date(),
      voidReason: 'Test void',
    });

    // Attempt to mark as paid (invalid transition)
    await expect(
      payrollService.markAsPaid(payroll._id)
    ).rejects.toThrow(/invalid.*transition|voided.*paid/i);
  });

  it('should reject invalid transition from reversed to processing', async () => {
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'reversed',
      reversedAt: new Date(),
      reversalReason: 'Test reversal',
    });

    await expect(
      payrollService.updateStatus(payroll._id, 'processing')
    ).rejects.toThrow(/invalid.*transition|reversed.*processing/i);
  });

  it('should reject invalid transition from paid to pending', async () => {
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'paid',
      paidAt: new Date(),
    });

    await expect(
      payrollService.updateStatus(payroll._id, 'pending')
    ).rejects.toThrow(/invalid.*transition|paid.*pending/i);
  });

  it('should reject invalid transition from voided to processing', async () => {
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'voided',
      voidedAt: new Date(),
      voidReason: 'Test void',
    });

    await expect(
      payrollService.updateStatus(payroll._id, 'processing')
    ).rejects.toThrow(/invalid.*transition|voided.*processing/i);
  });

  it('should allow valid transition from pending to processing', async () => {
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'pending',
    });

    const updated = await payrollService.updateStatus(payroll._id, 'processing');
    expect(updated.status).toBe('processing');
  });

  it('should allow valid transition from processing to paid', async () => {
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'processing',
    });

    const updated = await payrollService.markAsPaid(payroll._id);
    expect(updated.status).toBe('paid');
    expect(updated.paidAt).toBeDefined();
  });

  it('should allow valid transition from failed to pending (retry)', async () => {
    const payroll = await PayrollRecord.create({
      organizationId,
      employeeId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      period: createPeriod(1, 2024),
      breakdown: createBreakdown(),
      status: 'failed',
      error: {
        message: 'Previous processing failed',
        code: 'TEST_ERROR',
      },
    });

    const updated = await payrollService.updateStatus(payroll._id, 'pending');
    expect(updated.status).toBe('pending');
  });
});

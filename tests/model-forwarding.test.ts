/**
 * Test: Model Forwarding
 *
 * Verifies that all models (including optional LeaveRequestModel and TaxWithholdingModel)
 * are properly forwarded from PayrollBuilder.withModels() through to the container.
 *
 * BUG FIX: v2.6.1 - Fixed issue where LeaveRequestModel and TaxWithholdingModel
 * were not being passed from build() to initialize() to container.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Schema, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema } from '../src/index.js';
import { leaveRequestSchema, taxWithholdingSchema } from '../src/models/index.js';

describe('Model Forwarding', () => {
  let mongoServer: MongoMemoryServer;
  let EmployeeModel: Model<any>;
  let PayrollRecordModel: Model<any>;
  let TransactionModel: Model<any>;
  let LeaveRequestModel: Model<any>;
  let TaxWithholdingModel: Model<any>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create models
    const employeeSchema = createEmployeeSchema();
    EmployeeModel = mongoose.model('Employee', employeeSchema);

    const payrollSchema = createPayrollRecordSchema();
    PayrollRecordModel = mongoose.model('PayrollRecord', payrollSchema);

    const transactionSchema = new Schema({
      organizationId: { type: Schema.Types.ObjectId, required: true },
      amount: { type: Number, required: true },
      type: { type: String, required: true },
    });
    TransactionModel = mongoose.model('Transaction', transactionSchema);

    LeaveRequestModel = mongoose.model('LeaveRequest', leaveRequestSchema);
    TaxWithholdingModel = mongoose.model('TaxWithholding', taxWithholdingSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should forward all models including LeaveRequestModel and TaxWithholdingModel to container', () => {
    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        LeaveRequestModel,
        TaxWithholdingModel,
      })
      .build();

    // Access internal container to verify models are set
    // @ts-ignore - accessing private for testing
    const container = payroll._container;
    const models = container.getModels();

    // Verify all models are forwarded correctly
    expect(models.EmployeeModel).toBe(EmployeeModel);
    expect(models.PayrollRecordModel).toBe(PayrollRecordModel);
    expect(models.TransactionModel).toBe(TransactionModel);
    expect(models.LeaveRequestModel).toBe(LeaveRequestModel);
    expect(models.TaxWithholdingModel).toBe(TaxWithholdingModel);
  });

  it('should set optional models to null when not provided', () => {
    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        // LeaveRequestModel and TaxWithholdingModel intentionally omitted
      })
      .build();

    // @ts-ignore - accessing private for testing
    const container = payroll._container;
    const models = container.getModels();

    // Required models should be set
    expect(models.EmployeeModel).toBe(EmployeeModel);
    expect(models.PayrollRecordModel).toBe(PayrollRecordModel);
    expect(models.TransactionModel).toBe(TransactionModel);

    // Optional models should be null (not undefined)
    expect(models.LeaveRequestModel).toBeNull();
    expect(models.TaxWithholdingModel).toBeNull();
  });

  it('should forward only TaxWithholdingModel when LeaveRequestModel is not provided', () => {
    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        TaxWithholdingModel,
      })
      .build();

    // @ts-ignore
    const models = payroll._container.getModels();

    expect(models.TaxWithholdingModel).toBe(TaxWithholdingModel);
    expect(models.LeaveRequestModel).toBeNull();
  });

  it('should forward only LeaveRequestModel when TaxWithholdingModel is not provided', () => {
    const payroll = createPayrollInstance()
      .withModels({
        EmployeeModel,
        PayrollRecordModel,
        TransactionModel,
        LeaveRequestModel,
      })
      .build();

    // @ts-ignore
    const models = payroll._container.getModels();

    expect(models.LeaveRequestModel).toBe(LeaveRequestModel);
    expect(models.TaxWithholdingModel).toBeNull();
  });
});

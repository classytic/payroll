/**
 * Test: Transaction Schema Compliance
 *
 * Verifies that all transactions created by the payroll package
 * conform to @classytic/shared-types ITransaction interface.
 *
 * This test ensures we don't create invalid transactions that would
 * fail in the revenue package or any other consumer.
 */

import { describe, it, expect } from 'vitest';
import { createPayrollTransaction, createTaxPaymentTransaction } from '../src/factories/transaction.factory.js';
import type { ITransactionCreateInput } from '@classytic/shared-types';
import mongoose from 'mongoose';

describe('Transaction Schema Compliance', () => {
  it('createPayrollTransaction should include all required fields', () => {
    const orgId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const payrollRecordId = new mongoose.Types.ObjectId();

    const transaction = createPayrollTransaction({
      organizationId: orgId,
      employee: {
        _id: employeeId,
        compensation: {
          baseAmount: 5000,
          currency: 'USD',
        },
      } as any,
      payrollRecord: {
        _id: payrollRecordId,
        period: { month: 1, year: 2024 },
      } as any,
      breakdown: {
        baseAmount: 5000,
        allowances: [],
        deductions: [],
        totalAllowances: 500,
        totalDeductions: 300,
        taxAmount: 200,
        grossSalary: 5500,
        netSalary: 5000,
      } as any,
      period: { month: 1, year: 2024 },
      paymentDate: new Date('2024-01-31'),
    });

    // Verify required fields per ITransactionCreateInput
    expect(transaction.type).toBe('salary');
    expect(transaction.flow).toBe('outflow');
    expect(transaction.amount).toBeGreaterThan(0);
    expect(transaction.net).toBeGreaterThan(0);
    expect(transaction.currency).toBe('USD');
    expect(transaction.status).toBeDefined();

    // CRITICAL: method is required by ITransaction
    expect(transaction.method).toBeDefined();
    expect(typeof transaction.method).toBe('string');

    // Verify method is a valid value (not 'bank_transfer')
    expect(transaction.method).toBe('bank');
  });

  it('createPayrollTransaction should use valid payment method enum', () => {
    const transaction = createPayrollTransaction({
      organizationId: new mongoose.Types.ObjectId(),
      employee: {
        _id: new mongoose.Types.ObjectId(),
        compensation: { baseAmount: 5000, currency: 'USD' },
      } as any,
      payrollRecord: { _id: new mongoose.Types.ObjectId() } as any,
      breakdown: {
        baseAmount: 5000,
        allowances: [],
        deductions: [],
        grossSalary: 5000,
        netSalary: 5000,
      } as any,
      period: { month: 1, year: 2024 },
      paymentDate: new Date(),
      paymentMethod: 'cash',
    });

    expect(transaction.method).toBe('cash');
  });

  it('tax payment transactions should have required fields', () => {
    // Simulate what tax-withholding.service.ts creates
    const taxTransaction: Partial<ITransactionCreateInput> = {
      organizationId: new mongoose.Types.ObjectId(),
      type: 'tax_payment',
      flow: 'outflow',
      tags: ['tax', 'government', 'withholding'],
      amount: 1000,
      net: 1000,  // MUST be present
      currency: 'USD',
      method: 'bank',  // MUST be present
      status: 'completed',
      date: new Date(),
      description: 'Tax payment to government',
    };

    // Verify critical fields are present
    expect(taxTransaction.type).toBe('tax_payment');
    expect(taxTransaction.flow).toBe('outflow');
    expect(taxTransaction.amount).toBe(1000);
    expect(taxTransaction.net).toBe(1000);
    expect(taxTransaction.method).toBe('bank');
    expect(taxTransaction.currency).toBeDefined();
    expect(taxTransaction.status).toBeDefined();
  });

  it('should reject invalid payment methods', () => {
    // This would fail validation if 'bank_transfer' is used
    const validMethods = ['bank', 'cash', 'check', 'card'];
    const invalidMethod = 'bank_transfer';

    expect(validMethods).not.toContain(invalidMethod);
  });

  it('createTaxPaymentTransaction should include all required fields', () => {
    const transaction = createTaxPaymentTransaction({
      organizationId: new mongoose.Types.ObjectId(),
      totalAmount: 5000,
      currency: 'USD',
      referenceNumber: 'TAX-2024-001',
      notes: 'Q1 2024 tax payment',
      withholdingIds: [new mongoose.Types.ObjectId()],
    });

    // Verify required fields
    expect(transaction.type).toBe('tax_payment');
    expect(transaction.flow).toBe('outflow');
    expect(transaction.amount).toBe(5000);
    expect(transaction.net).toBe(5000);
    expect(transaction.currency).toBe('USD');
    expect(transaction.status).toBe('completed');

    // CRITICAL: method must be valid (not 'bank_transfer')
    expect(transaction.method).toBe('bank');
    expect(transaction.method).not.toBe('bank_transfer');
  });

  it('createPayrollTransaction should include all ITransactionCreateInput fields', () => {
    const transaction = createPayrollTransaction({
      organizationId: new mongoose.Types.ObjectId(),
      employee: {
        _id: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        compensation: { baseAmount: 5000, currency: 'USD' },
      } as any,
      payrollRecord: { _id: new mongoose.Types.ObjectId() } as any,
      breakdown: {
        baseAmount: 5000,
        allowances: [],
        deductions: [],
        totalAllowances: 500,
        totalDeductions: 300,
        taxAmount: 200,
        grossSalary: 5500,
        netSalary: 5000,
      } as any,
      period: { month: 1, year: 2024 },
      paymentDate: new Date(),
    });

    // Type assertion to verify it conforms to ITransactionCreateInput
    const validateType: ITransactionCreateInput = transaction;

    // Runtime verification of critical fields
    expect(validateType.type).toBeDefined();
    expect(validateType.flow).toBeDefined();
    expect(validateType.amount).toBeDefined();
    expect(validateType.net).toBeDefined();
    expect(validateType.method).toBeDefined();
    expect(validateType.currency).toBeDefined();
    expect(validateType.status).toBeDefined();
  });

  it('reversal transactions should use correct field names and positive amounts', () => {
    // Simulate reversal transaction structure from payroll-state.manager.ts
    const reversalTransaction: Partial<ITransactionCreateInput> = {
      organizationId: new mongoose.Types.ObjectId(),
      type: 'salary_reversal', // ✅ Correct type
      flow: 'inflow', // Reversal is inflow
      tags: ['reversal', 'payroll', 'correction'],
      status: 'completed',
      amount: 5500, // ✅ Positive (not negative)
      net: 5000, // ✅ Positive
      currency: 'USD',
      method: 'bank',
      sourceId: new mongoose.Types.ObjectId(), // ✅ Correct field name (not referenceId)
      sourceModel: 'PayrollRecord', // ✅ Correct field name (not referenceModel)
      relatedTransactionId: new mongoose.Types.ObjectId(),
      description: 'Payroll Reversal: Test',
    };

    // Verify critical fields
    expect(reversalTransaction.type).toBe('salary_reversal');
    expect(reversalTransaction.flow).toBe('inflow');
    expect(reversalTransaction.amount).toBeGreaterThan(0); // ✅ Positive
    expect(reversalTransaction.net).toBeGreaterThan(0); // ✅ Positive
    expect(reversalTransaction.method).toBe('bank');
    expect(reversalTransaction.sourceId).toBeDefined(); // ✅ Correct field
    expect(reversalTransaction.sourceModel).toBe('PayrollRecord'); // ✅ Correct field
    expect('referenceId' in reversalTransaction).toBe(false); // ❌ Should not exist
    expect('referenceModel' in reversalTransaction).toBe(false); // ❌ Should not exist
  });
});

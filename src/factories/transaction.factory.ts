/**
 * @classytic/payroll - Transaction Factory
 *
 * Pure functions for building transaction objects aligned with @classytic/shared-types.
 * Ensures consistency with revenue package for unified cashflow.
 *
 * @packageDocumentation
 */

import type { ITransactionCreateInput } from '@classytic/shared-types';
import type { ObjectIdLike, PayrollBreakdown } from '../types.js';
import { toObjectId } from '../utils/query-builders.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating a payroll transaction
 */
export interface CreatePayrollTransactionInput {
  organizationId: ObjectIdLike;
  employee: {
    _id: ObjectIdLike;
    userId?: ObjectIdLike | { _id: ObjectIdLike; name?: string } | null;
    employeeId: string;
    email?: string;
    compensation: {
      currency?: string;
    };
  };
  payrollRecord: {
    _id: ObjectIdLike;
  };
  breakdown: PayrollBreakdown;
  period: {
    month: number;
    year: number;
  };
  paymentDate: Date;
  paymentMethod?: string; // Flexible: 'bank', 'cash', 'check', 'mobile_wallet', etc.
  processedBy?: ObjectIdLike;
  idempotencyKey?: string;
  jurisdiction?: string; // Optional: 'US', 'BD', 'UK', etc. (defaults based on org)
  defaultCurrency?: string; // Config default currency (fallback before USD)
}

/**
 * Input for creating a tax payment transaction
 */
export interface CreateTaxPaymentTransactionInput {
  organizationId: ObjectIdLike;
  totalAmount: number;
  currency: string;
  referenceNumber?: string;
  notes?: string;
  withholdingIds: ObjectIdLike[];
}

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Create payroll transaction aligned with @classytic/shared-types
 *
 * This is the SINGLE SOURCE OF TRUTH for payroll transaction structure.
 * Aligns with revenue package for unified cashflow.
 *
 * @param input - Payroll transaction parameters
 * @returns Transaction data ready for DB creation (ITransactionCreateInput)
 *
 * @pure This function has no side effects
 */
export function createPayrollTransaction(input: CreatePayrollTransactionInput): ITransactionCreateInput {
  const { organizationId, employee, payrollRecord, breakdown, period, paymentDate, paymentMethod = 'bank_transfer', processedBy, idempotencyKey, jurisdiction, defaultCurrency } = input;

  // Extract userId if present (optional for guest employees)
  const userIdValue = employee.userId
    ? (typeof employee.userId === 'object' && '_id' in employee.userId
        ? (employee.userId as { _id: ObjectIdLike })._id
        : employee.userId)
    : undefined;

  // Extract user name for description (if available)
  const userName = employee.userId && typeof employee.userId === 'object' && 'name' in employee.userId
    ? (employee.userId as { name?: string })?.name
    : undefined;

  // Use employee's currency with proper fallback chain
  const currency = employee.compensation.currency || defaultCurrency || 'USD';

  // Align with @classytic/shared-types ITransactionCreateInput
  return {
    organizationId: toObjectId(organizationId),

    // Classification
    type: 'salary',
    flow: 'outflow',
    tags: ['recurring', 'payroll', 'monthly'],
    status: 'completed',

    // Amounts (aligned with shared-types)
    amount: breakdown.grossSalary, // Gross amount
    net: breakdown.netSalary, // Net after deductions
    currency, // From employee compensation (flexible!)
    fee: 0,
    tax: breakdown.taxAmount || 0,

    // Tax details (shared-types structure)
    taxDetails: breakdown.taxAmount && breakdown.taxAmount > 0 ? {
      type: 'income_tax',
      rate: breakdown.grossSalary > 0 ? breakdown.taxAmount / breakdown.grossSalary : 0,
      jurisdiction: jurisdiction || undefined, // Optional, app-controlled
    } : undefined,

    // Payment (user can pass any method: 'bank_transfer', 'cash', 'check', 'mobile_wallet')
    method: paymentMethod,
    date: paymentDate,

    // Parties (shared-types)
    employeeId: toObjectId(employee._id),
    customerId: userIdValue ? toObjectId(userIdValue as ObjectIdLike) : null,
    processedBy: processedBy ? toObjectId(processedBy) : undefined,

    // Payroll breakdown (shared-types compatible)
    breakdown: {
      base: breakdown.baseAmount,
      additions: breakdown.allowances.map((a) => ({
        type: a.type,
        amount: a.amount,
        description: a.type,
        isTaxable: a.taxable,
      })),
      deductions: breakdown.deductions.map((d) => ({
        type: d.type,
        amount: d.amount,
        description: d.description,
      })),
      period: {
        month: period.month,
        year: period.year,
        start: new Date(period.year, period.month - 1, 1),
        end: new Date(period.year, period.month, 0),
      },
      workingDays: breakdown.workingDays
        ? {
            expected: breakdown.workingDays,
            actual: breakdown.actualDays || breakdown.workingDays,
          }
        : undefined,
    },

    // References
    sourceId: toObjectId(payrollRecord._id),
    sourceModel: 'PayrollRecord',

    // Idempotency (Stripe-style)
    idempotencyKey: idempotencyKey || null,

    // Timestamps
    processedAt: paymentDate,
    completedAt: paymentDate,

    // Metadata
    description: `Salary payment - ${userName || employee.employeeId} (${period.month}/${period.year})`,
    notes: breakdown.proRatedAmount ? `Pro-rated: ${breakdown.actualDays}/${breakdown.workingDays} days` : undefined,
    metadata: {
      employeeId: employee.employeeId,
      email: employee.email,
      payrollRecordId: payrollRecord._id.toString(),
    },
  };
}

/**
 * Create tax payment transaction aligned with @classytic/shared-types
 *
 * For government tax payments (withholding remittance).
 *
 * @param input - Tax payment parameters
 * @returns Transaction data ready for DB creation (ITransactionCreateInput)
 *
 * @pure This function has no side effects
 */
export function createTaxPaymentTransaction(input: CreateTaxPaymentTransactionInput): ITransactionCreateInput {
  const { organizationId, totalAmount, currency, referenceNumber, notes, withholdingIds } = input;

  // Align with shared-types ITransactionCreateInput
  return {
    organizationId: toObjectId(organizationId),

    // Classification
    type: 'tax_payment',
    flow: 'outflow',
    tags: ['tax', 'government', 'compliance'],
    status: 'completed',

    // Amounts (shared-types convention)
    amount: totalAmount,
    net: totalAmount, // No deductions for tax payments
    currency,
    fee: 0,

    // Payment
    method: 'bank_transfer',
    date: new Date(),

    // References
    sourceModel: 'TaxWithholding',

    // Timestamps
    completedAt: new Date(),

    // Metadata
    description: referenceNumber
      ? `Tax payment to government - ${referenceNumber}`
      : 'Tax payment to government',
    notes,
    metadata: {
      withholdingIds: withholdingIds.map((id) => id.toString()),
      referenceNumber,
      type: 'government_tax_remittance',
    },
  };
}

/**
 * Transaction Factory class (for builder pattern if needed)
 */
export class TransactionFactory {
  static createPayrollTransaction = createPayrollTransaction;
  static createTaxPaymentTransaction = createTaxPaymentTransaction;
}


/**
 * Transaction Interface
 * @classytic/payroll
 *
 * Payroll uses the unified transaction interface from @classytic/shared-types
 * so revenue and payroll share a single cashflow event model.
 */

import type {
  ITransaction,
  ITransactionCreateInput,
} from '@classytic/shared-types';

import { isTransaction } from '@classytic/shared-types';

/**
 * Core transaction interface expected by payroll package
 * Apps must provide a Transaction model with AT LEAST these fields
 */
export type IPayrollTransaction = ITransaction;

/**
 * Transaction write input (what payroll package creates)
 */
export type IPayrollTransactionCreateInput = ITransactionCreateInput;

/**
 * Type guard to check if object is a Transaction
 */
export function isPayrollTransaction(obj: unknown): obj is IPayrollTransaction {
  return isTransaction(obj) && typeof obj === 'object' && obj !== null && 'employeeId' in obj;
}

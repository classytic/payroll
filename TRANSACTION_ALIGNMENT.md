# Transaction Schema Alignment

## Overview

All @classytic packages use the unified `ITransaction` interface from `@classytic/shared-types` for consistent cashflow tracking.

## Shared Transaction Structure

### Source of Truth: @classytic/shared-types

```typescript
export interface ITransaction {
  // Amounts (unified convention)
  amount: number;     // GROSS amount (before deductions)
  net: number;        // NET amount (after deductions)
  fee?: number;       // Processing fees
  tax?: number;       // Tax amount
  currency: string;   // 'USD', 'BDT', etc.

  // Classification
  type: string;       // 'salary', 'subscription', 'refund', etc.
  flow: 'inflow' | 'outflow';
  status: string;

  // Parties (polymorphic)
  customerId?: ObjectId;   // Revenue package
  employeeId?: ObjectId;   // Payroll package

  // Source tracking
  sourceId?: ObjectId;
  sourceModel?: string;    // 'Subscription', 'PayrollRecord', 'Order'
}
```

## Package Implementations

### ✅ @classytic/payroll

**Location:** `src/factories/transaction.factory.ts`

```typescript
export function createPayrollTransaction(input) {
  return {
    // ALIGNED: amount = gross, net = net
    amount: breakdown.grossSalary,  // Gross amount ✅
    net: breakdown.netSalary,       // Net amount ✅
    tax: breakdown.taxAmount || 0,

    type: 'salary',
    flow: 'outflow',
    employeeId: employee._id,
    sourceModel: 'PayrollRecord',
  };
}
```

**Status:** ✅ Fully aligned with shared-types

### ✅ @classytic/revenue

**Location:** `revenue/examples/05-transaction-model.ts`

```typescript
const transactionSchema = new Schema<ITransaction>({
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  // Uses ITransaction interface directly
  // Follows: amount = gross, net = net
});
```

**Status:** ✅ Fully aligned with shared-types

### ✅ @classytic/clockin

**Location:** `src/core/transaction.ts`

```typescript
// MongoDB transaction helpers (not financial transactions)
export async function withTransaction<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>
): Promise<T>
```

**Note:** This is for MongoDB ACID transactions, not financial records.

## Field Semantics (Standard Across All Packages)

| Field | Meaning | Example (Payroll) | Example (Revenue) |
|-------|---------|-------------------|-------------------|
| `amount` | **Gross amount** (before deductions) | 100,000 BDT | 2,999 BDT |
| `tax` | Tax withheld/collected | 10,000 BDT | 299 BDT |
| `fee` | Processing fees | 0 | 87 BDT (2.9%) |
| `net` | **Net amount** (actual transfer) | 90,000 BDT | 2,613 BDT |

## Schema Export Strategy

### What's Exported from @classytic/payroll/schemas

```typescript
// ✅ EXPORTED (for app customization)
export {
  // Core schema field creators (configurable references)
  createEmploymentFields,      // Multi-branch/tenant support via organizationRef option
  createPayrollRecordFields,
  createEmployeeSchema,
  createPayrollRecordSchema,

  // Optional models (app decides to use)
  leaveRequestSchema,
  taxWithholdingSchema,
  getTaxWithholdingModel,
  getLeaveRequestModel,
};
```

**Why expose TaxWithholding & LeaveRequest schemas?**
- Apps may want custom fields (e.g., `taxWithholding.approvedBy`)
- Apps create their own models: `getTaxWithholdingModel()`
- Package gracefully works without these models

**Pattern (from README):**
```typescript
import { getTaxWithholdingModel } from '@classytic/payroll/schemas';

// App creates model (optional)
const TaxWithholding = getTaxWithholdingModel();

const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,        // Uses ITransaction from shared-types
    TaxWithholdingModel: TaxWithholding,  // Optional
  })
  .build();
```

## Verification Status

- ✅ Payroll uses `ITransactionCreateInput` from shared-types
- ✅ Transaction factory aligns: `amount = gross, net = net`
- ✅ Revenue examples use `ITransaction` interface
- ✅ No conflicts or duplicate transaction types
- ✅ Schema exports allow app customization
- ✅ Optional models (Tax, Leave) properly exposed

## Benefits

1. **Unified Reporting:** All packages write to same transaction structure
2. **Cross-Package Queries:** Apps can aggregate revenue + payroll in one query
3. **Type Safety:** TypeScript enforces consistency via shared interface
4. **No Duplication:** Single source of truth for transaction semantics
5. **Flexible:** Apps can extend with custom fields via `metadata`

## Testing Alignment

All packages test against shared-types interface:

```bash
# Payroll
cd packages/payroll && npm test  # 595 passing ✅

# Revenue
cd packages/revenue/revenue && npm test  # Uses ITransaction ✅

# Shared-types
cd packages/shared-types && npm run typecheck  # Interface validation ✅
```

---

**Last Verified:** 2026-01-13
**Status:** ✅ All packages aligned

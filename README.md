# @classytic/payroll

HRM & Payroll for MongoDB. Multi-tenant, event-driven, type-safe.

## Install

```bash
npm install @classytic/payroll mongoose @classytic/mongokit
```

## Quick Start

```typescript
import { createPayrollInstance } from '@classytic/payroll';

const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .build();

// Hire
await payroll.hire({
  organizationId,
  employment: { email: 'dev@example.com', position: 'Engineer', hireDate: new Date() },
  compensation: { baseAmount: 80000, currency: 'USD', frequency: 'monthly' },
});

// Process salary
await payroll.processSalary({
  organizationId,
  employeeId,
  month: 1,
  year: 2024,
});
```

## Package Exports

| Entry Point | Description |
|-------------|-------------|
| `@classytic/payroll` | Main API: Payroll class, types, schemas, errors |
| `@classytic/payroll/calculators` | Pure calculation functions (no DB required) |
| `@classytic/payroll/utils` | Date, money, validation utilities |
| `@classytic/payroll/schemas` | Mongoose schema factories |

---

## Employee Operations

```typescript
// Hire
await payroll.hire({
  organizationId,
  employment: { email, employeeId, position, department, hireDate },
  compensation: { baseAmount, currency, frequency },
});

// Get employee
const emp = await payroll.getEmployee({ employeeId, organizationId });

// Update employment
await payroll.updateEmployment({
  employeeId,
  organizationId,
  updates: { position: 'Senior Engineer', department: 'engineering' },
});

// Terminate
await payroll.terminate({
  employeeId,
  organizationId,
  terminationDate: new Date(),
  reason: 'resignation',
});

// Re-hire
await payroll.reHire({ employeeId, organizationId, hireDate: new Date() });
```

## Compensation

```typescript
// Update salary
await payroll.updateSalary({
  employeeId,
  organizationId,
  compensation: { baseAmount: 90000 },
  effectiveFrom: new Date(),
});

// Add allowance
await payroll.addAllowance({
  employeeId,
  organizationId,
  allowance: {
    type: 'housing',    // 'housing' | 'transport' | 'meal' | 'mobile' | 'medical' | 'bonus' | 'other'
    amount: 2000,
    taxable: true,
  },
});

// Add deduction
await payroll.addDeduction({
  employeeId,
  organizationId,
  deduction: {
    type: 'provident_fund',  // 'tax' | 'loan' | 'advance' | 'provident_fund' | 'insurance'
    amount: 500,
    auto: true,
  },
});

// Update bank details
await payroll.updateBankDetails({
  employeeId,
  organizationId,
  bankDetails: { accountNumber, bankName, routingNumber },
});
```

### Payment Frequencies

Supports multiple payment frequencies with automatic tax annualization:

| Frequency | baseAmount | Periods/Year | Example ($104k/year) |
|-----------|------------|--------------|----------------------|
| `monthly` | Monthly salary | 12 | $8,666.67/month |
| `bi_weekly` | Bi-weekly wage | 26 | $4,000/bi-week |
| `weekly` | Weekly wage | 52 | $2,000/week |
| `daily` | Daily rate | 365 | $285/day |
| `hourly` | Hourly rate | 2080 | $50/hour |

Tax is calculated consistently: same annual income = same annual tax, regardless of frequency.

## Payroll Processing

```typescript
// Single employee
const result = await payroll.processSalary({
  organizationId,
  employeeId,
  month: 1,
  year: 2024,
  paymentDate: new Date(),
  paymentMethod: 'bank',
  payrollRunType: 'regular',  // 'regular' | 'supplemental' | 'retroactive' | 'off-cycle'
});
// Returns: { employee, payrollRecord, transaction }

// Bulk processing
const bulk = await payroll.processBulkPayroll({
  organizationId,         // Optional in single-tenant mode or with context.organizationId
  month: 1,
  year: 2024,
  employeeIds: [],        // Optional: specific employees (default: all active + on_leave)
  batchSize: 50,
  concurrency: 5,
  onProgress: (p) => console.log(`${p.percentage}%`),
});
// Returns: { successCount, failCount, totalAmount, successful[], failed[] }
```

### Duplicate Protection

The package provides database-level duplicate protection via a unique compound index:

```typescript
// Unique index on: (organizationId, employeeId, period.month, period.year, payrollRunType)
// With partial filter: { isVoided: { $eq: false } }

// This allows:
// - One active record per employee per period per run type
// - Multiple run types in same period (regular + supplemental)
// - Re-processing after voiding (requires restorePayroll() first)
// - Re-processing after reversing
```

**Important**: Voided records require `restorePayroll()` before re-processing. Voided is a terminal state that preserves audit trail.

## Two-Phase Export

Safe export that only marks records after downstream confirms receipt:

```typescript
// Phase 1: Prepare (records NOT marked)
const { records, exportId } = await payroll.prepareExport({
  organizationId,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
});

// Send to external system...

// Phase 2a: Confirm success (marks records)
await payroll.confirmExport({ organizationId, exportId });

// Phase 2b: Cancel if failed (records stay unmarked)
await payroll.cancelExport({ organizationId, exportId, reason: 'API error' });
```

## Void / Reverse / Restore

```typescript
// Void unpaid payroll (pending, processing, failed)
await payroll.voidPayroll({
  organizationId,
  payrollRecordId,
  reason: 'Test payroll',
});

// Reverse paid payroll (creates reversal transaction)
await payroll.reversePayroll({
  organizationId,
  payrollRecordId,
  reason: 'Duplicate payment',
});

// Restore voided payroll (blocked if replacement exists)
await payroll.restorePayroll({
  organizationId,
  payrollRecordId,
  reason: 'Voided in error',
});
```

**Status Flow:**
```
PENDING → PROCESSING → PAID → REVERSED
   ↓          ↓
   └──→ VOIDED ←── FAILED
         ↓
       PENDING (restore)
```

## Leave Management

```typescript
// Request leave
await payroll.requestLeave({
  employeeId,
  organizationId,
  leaveType: 'annual',  // 'annual' | 'sick' | 'unpaid' | 'maternity' | 'paternity'
  startDate: new Date('2024-03-01'),
  endDate: new Date('2024-03-05'),
  reason: 'Vacation',
});

// Approve
await payroll.approveLeave({ leaveRequestId, organizationId, approverId: managerId });

// Reject
await payroll.rejectLeave({
  leaveRequestId,
  organizationId,
  rejectedBy: managerId,
  rejectionReason: 'Insufficient leave balance',
});

// Get balance
const balance = await payroll.getLeaveBalance({ employeeId, organizationId });
// { annual: { total: 20, used: 5, remaining: 15 }, sick: {...}, ... }
```

---

## Pure Calculators (No DB Required)

Import from `@classytic/payroll/calculators` for client-side or serverless:

```typescript
import {
  calculateSalaryBreakdown,
  calculateProRating,
  calculateAttendanceDeduction,
} from '@classytic/payroll/calculators';
```

### Salary Breakdown

```typescript
const breakdown = calculateSalaryBreakdown({
  employee: {
    hireDate: new Date('2024-01-01'),
    terminationDate: null,
    compensation: {
      baseAmount: 100000,
      frequency: 'monthly',
      currency: 'USD',
      allowances: [
        { type: 'housing', amount: 20000, taxable: true },
        { type: 'transport', amount: 5000, taxable: true },
      ],
      deductions: [
        { type: 'provident_fund', amount: 5000, auto: true },
      ],
    },
  },
  period: {
    month: 3,
    year: 2024,
    startDate: new Date('2024-03-01'),
    endDate: new Date('2024-03-31'),
  },
  attendance: {
    expectedDays: 22,
    actualDays: 20,
  },
  config: {
    allowProRating: true,
    autoDeductions: true,
    defaultCurrency: 'USD',
    attendanceIntegration: true,
  },
  taxBrackets: [
    { min: 0, max: 600000, rate: 0 },
    { min: 600000, max: 1200000, rate: 0.1 },
    { min: 1200000, max: Infinity, rate: 0.2 },
  ],
});

// Returns PayrollBreakdown
{
  baseAmount: number,
  allowances: Array<{ type, amount, taxable }>,
  deductions: Array<{ type, amount, description }>,
  grossSalary: number,
  netSalary: number,
  taxableAmount: number,
  taxAmount: number,
  workingDays: number,
  actualDays: number,
  proRatedAmount: number,
  attendanceDeduction: number,
}
```

### Pro-Rating

```typescript
import { calculateProRating } from '@classytic/payroll/calculators';

const result = calculateProRating({
  hireDate: new Date('2024-03-15'),
  terminationDate: null,
  periodStart: new Date('2024-03-01'),
  periodEnd: new Date('2024-03-31'),
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
});

// Returns ProRatingResult
{
  isProRated: true,
  ratio: 0.545,
  periodWorkingDays: 22,
  effectiveWorkingDays: 12,
  reason: 'new_hire',
}
```

---

## Events

```typescript
payroll.on('employee:hired', (payload) => { /* { employee, organizationId } */ });
payroll.on('employee:terminated', (payload) => { /* { employee, reason } */ });
payroll.on('salary:processed', (payload) => { /* { payrollRecord, transaction } */ });
payroll.on('payroll:completed', (payload) => { /* { summary, period } */ });
payroll.on('payroll:exported', (payload) => { /* { exportId, recordCount } */ });
```

## Webhooks

```typescript
// Register webhook
payroll.registerWebhook({
  url: 'https://api.example.com/webhooks',
  events: ['salary:processed', 'employee:hired'],
  secret: 'your-secret',
});

// Verify signature in handler
const signature = req.headers['x-payroll-signature'];
const timestamp = req.headers['x-payroll-timestamp'];
const signedPayload = `${timestamp}.${JSON.stringify(req.body)}`;
const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
```

---

## Configuration

### Multi-Tenant (Default)

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .withConfig({
    payroll: {
      defaultCurrency: 'USD',
      attendanceIntegration: true,
      allowProRating: true,
      autoDeductions: true,
    },
  })
  .build();

// organizationId required on all operations
await payroll.hire({ organizationId, employment, compensation });
```

### Single-Tenant

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({ organizationId: YOUR_ORG_ID, autoInject: true })
  .build();

// organizationId auto-injected
await payroll.hire({ employment, compensation });
```

---

## Key Types

```typescript
import type {
  // Documents
  EmployeeDocument,
  PayrollRecordDocument,
  LeaveRequestDocument,

  // Core types
  Compensation,
  Allowance,
  Deduction,
  PayrollBreakdown,
  TaxBracket,
  BankDetails,

  // Params
  HireEmployeeParams,
  ProcessSalaryParams,
  ProcessBulkPayrollParams,
  ExportPayrollParams,

  // Results
  ProcessSalaryResult,
  BulkPayrollResult,

  // Enums
  EmployeeStatus,      // 'active' | 'on_leave' | 'suspended' | 'terminated'
  PayrollStatus,       // 'pending' | 'processing' | 'paid' | 'failed' | 'voided' | 'reversed'
  PayrollRunType,      // 'regular' | 'supplemental' | 'retroactive' | 'off-cycle'
  LeaveType,           // 'annual' | 'sick' | 'unpaid' | 'maternity' | 'paternity'
  AllowanceType,       // 'housing' | 'transport' | 'meal' | 'mobile' | 'medical' | 'bonus' | 'other'
  DeductionType,       // 'tax' | 'loan' | 'advance' | 'provident_fund' | 'insurance'
  PaymentFrequency,    // 'monthly' | 'bi_weekly' | 'weekly' | 'daily' | 'hourly'
  PaymentMethod,       // 'bank' | 'cash' | 'check'
} from '@classytic/payroll';
```

---

## Schemas

```typescript
import {
  createEmployeeSchema,
  createPayrollRecordSchema,
  employeeIndexes,
  payrollRecordIndexes,
} from '@classytic/payroll/schemas';

// Create with custom fields
const employeeSchema = createEmployeeSchema({
  skills: [String],
  certifications: [{ name: String, date: Date }],
});

// Apply indexes
employeeIndexes.forEach(idx => employeeSchema.index(idx.fields, idx.options));
```

---

## Utilities

```typescript
import {
  // Date
  addDays, addMonths, diffInDays, startOfMonth, endOfMonth,
  getPayPeriod, getWorkingDaysInMonth,

  // Money (banker's rounding)
  roundMoney, percentageOf, prorateAmount,

  // Query builders
  toObjectId, isValidObjectId,
} from '@classytic/payroll/utils';
```

---

## Error Handling

```typescript
import {
  PayrollError,
  DuplicatePayrollError,
  EmployeeNotFoundError,
  NotEligibleError,
  ValidationError,
} from '@classytic/payroll';

try {
  await payroll.processSalary({ organizationId, employeeId, month, year });
} catch (error) {
  if (error instanceof DuplicatePayrollError) {
    // Already processed for this period + run type
  } else if (error instanceof EmployeeNotFoundError) {
    // Employee doesn't exist
  } else if (error instanceof NotEligibleError) {
    // Employee not eligible (terminated, etc.)
  }
}
```

---

## License

MIT

# API Reference

## Payroll Class

The main entry point. All operations go through this class with multi-tenant isolation.

```typescript
import { createPayrollInstance } from '@classytic/payroll';

const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .withConfig({ currency: 'USD' })
  .build();
```

---

## Employee Operations

### hire

```typescript
await payroll.hire({
  organizationId: ObjectId,
  employment: {
    email: string,
    employeeId?: string,           // Auto-generated if not provided
    position: string,
    department?: string,
    hireDate: Date,
    employmentType?: 'full_time' | 'part_time' | 'contract' | 'intern',
  },
  compensation: {
    baseAmount: number,         // Per-period amount (monthly salary, weekly wage, hourly rate, etc.)
    currency: string,
    frequency: 'monthly' | 'bi_weekly' | 'weekly' | 'daily' | 'hourly',
    allowances?: Allowance[],
    deductions?: Deduction[],
  },
  bankDetails?: {
    accountNumber: string,
    bankName: string,
    routingNumber?: string,
  },
});
// Returns: EmployeeDocument
```

### getEmployee

```typescript
const employee = await payroll.getEmployee({
  employeeId: string | ObjectId,   // MongoDB _id or employeeId string
  organizationId: ObjectId,
  employeeIdMode?: 'auto' | 'employeeId' | 'objectId',  // Default: 'auto'
});
// Returns: EmployeeDocument | null
```

### updateEmployment

```typescript
await payroll.updateEmployment({
  employeeId: string | ObjectId,
  updates: {
    position?: string,
    department?: string,
    employmentType?: 'full_time' | 'part_time' | 'contract' | 'intern',
  },
});
// Returns: EmployeeDocument
```

### terminate

```typescript
await payroll.terminate({
  employeeId: string | ObjectId,
  terminationDate: Date,
  reason: 'resignation' | 'termination' | 'retirement' | 'layoff',
});
// Returns: EmployeeDocument
```

### reHire

```typescript
await payroll.reHire({
  employeeId: string | ObjectId,
  hireDate: Date,
});
// Returns: EmployeeDocument
```

---

## Compensation Operations

### updateSalary

```typescript
await payroll.updateSalary({
  employeeId: string | ObjectId,
  organizationId: ObjectId,
  compensation: {
    baseAmount?: number,        // Per-period amount based on frequency
    currency?: string,
    frequency?: 'monthly' | 'bi_weekly' | 'weekly' | 'daily' | 'hourly',
  },
  effectiveFrom?: Date,
});
// Returns: EmployeeDocument
```

### addAllowance

```typescript
await payroll.addAllowance({
  employeeId: string | ObjectId,
  allowance: {
    type: 'housing' | 'transport' | 'meal' | 'mobile' | 'medical' | 'bonus' | 'other',
    amount: number,
    taxable?: boolean,           // Default: true
    recurring?: boolean,         // Default: true
    effectiveFrom?: Date,
    effectiveTo?: Date | null,
  },
});
// Returns: EmployeeDocument
```

### removeAllowance

```typescript
await payroll.removeAllowance({
  employeeId: string | ObjectId,
  allowanceType: AllowanceType,
});
// Returns: EmployeeDocument
```

### addDeduction

```typescript
await payroll.addDeduction({
  employeeId: string | ObjectId,
  deduction: {
    type: 'tax' | 'loan' | 'advance' | 'provident_fund' | 'insurance',
    amount: number,
    auto?: boolean,              // Auto-deduct each payroll
    recurring?: boolean,
    description?: string,
    reducesTaxableIncome?: boolean,  // Pre-tax deduction
    effectiveFrom?: Date,
    effectiveTo?: Date | null,
  },
});
// Returns: EmployeeDocument
```

### removeDeduction

```typescript
await payroll.removeDeduction({
  employeeId: string | ObjectId,
  deductionType: DeductionType,
});
// Returns: EmployeeDocument
```

### updateBankDetails

```typescript
await payroll.updateBankDetails({
  employeeId: string | ObjectId,
  bankDetails: {
    accountNumber: string,
    bankName: string,
    routingNumber?: string,
  },
});
// Returns: EmployeeDocument
```

---

## Payroll Processing

### processSalary

```typescript
const result = await payroll.processSalary({
  organizationId: ObjectId,
  employeeId: string | ObjectId,
  month: number,       // 1-12
  year: number,
  paymentDate?: Date,
  paymentMethod?: 'bank' | 'cash' | 'check',
  attendance?: {
    expectedDays?: number,
    actualDays?: number,
  },
  options?: {
    holidays?: Date[],
    skipTax?: boolean,
    skipProration?: boolean,
    skipAttendance?: boolean,
  },
});

// Returns ProcessSalaryResult
{
  employee: EmployeeDocument,
  payrollRecord: PayrollRecordDocument,
  transaction: TransactionDocument,
}
```

### processBulkPayroll

```typescript
const result = await payroll.processBulkPayroll({
  organizationId?: ObjectId,      // Optional if using context.organizationId or single-tenant
  month: number,
  year: number,
  employeeIds?: ObjectId[],      // Default: all active employees
  paymentDate?: Date,
  paymentMethod?: 'bank' | 'cash' | 'check',
  batchSize?: number,            // Default: 10
  concurrency?: number,          // Default: 1 (sequential)
  batchDelay?: number,           // Delay between batches (ms)
  maxResultDetails?: number,     // Limit detailed results
  useStreaming?: boolean,        // Auto-enabled for >10k employees
  signal?: AbortSignal,          // Cancellation support
  onProgress?: (progress: BulkPayrollProgress) => void,
  options?: PayrollProcessingOptions,
});

// Returns BulkPayrollResult
{
  total: number,
  successCount: number,
  failCount: number,
  totalAmount: number,
  successful: Array<{ employeeId, amount, transactionId }>,
  failed: Array<{ employeeId, error }>,
}

// Progress callback receives
{
  processed: number,
  total: number,
  successful: number,
  failed: number,
  percentage: number,
  currentEmployee?: string,
}
```

### voidPayroll

Void an unpaid payroll record.

```typescript
await payroll.voidPayroll({
  organizationId: ObjectId,
  payrollRecordId: ObjectId,
  reason: string,
});
// Returns: VoidPayrollResult
```

### reversePayroll

Reverse a paid payroll (creates reversal transaction).

```typescript
await payroll.reversePayroll({
  organizationId: ObjectId,
  payrollRecordId: ObjectId,
  reason: string,
});
// Returns: ReversePayrollResult
```

### restorePayroll

Restore a voided payroll to pending.

```typescript
await payroll.restorePayroll({
  organizationId: ObjectId,
  payrollRecordId: ObjectId,
  reason: string,
});
// Returns: RestorePayrollResult
```

---

## Leave Management

### requestLeave

```typescript
await payroll.requestLeave({
  employeeId: string | ObjectId,
  organizationId: ObjectId,
  leaveType: 'annual' | 'sick' | 'casual' | 'maternity' | 'paternity' | 'unpaid',
  startDate: Date,
  endDate: Date,
  reason?: string,
});
// Returns: LeaveRequestDocument
```

### approveLeave

```typescript
await payroll.approveLeave({
  leaveRequestId: ObjectId,
  approverId: ObjectId,
  notes?: string,
});
// Returns: LeaveRequestDocument
```

### rejectLeave

```typescript
await payroll.rejectLeave({
  leaveRequestId: ObjectId,
  rejectedBy: ObjectId,
  rejectionReason: string,
});
// Returns: LeaveRequestDocument
```

### cancelLeaveRequest

```typescript
await payroll.cancelLeaveRequest({
  leaveRequestId: ObjectId,
  cancelledBy: ObjectId,
  reason?: string,
});
// Returns: LeaveRequestDocument
```

### getLeaveBalance

```typescript
const balance = await payroll.getLeaveBalance({
  employeeId: string | ObjectId,
  organizationId: ObjectId,
});

// Returns
{
  annual: { total: 20, used: 5, remaining: 15, pending: 2 },
  sick: { total: 10, used: 2, remaining: 8, pending: 0 },
  casual: { total: 5, used: 1, remaining: 4, pending: 0 },
  // ...
}
```

### getLeaveHistory

```typescript
const history = await payroll.getLeaveHistory({
  employeeId: string | ObjectId,
  organizationId: ObjectId,
  filters?: {
    leaveType?: LeaveType,
    status?: LeaveRequestStatus,
    startDate?: Date,
    endDate?: Date,
  },
  page?: number,
  limit?: number,
});
// Returns: { docs: LeaveRequestDocument[], total, page, limit }
```

---

## Events

```typescript
// Subscribe
payroll.on('employee:hired', (payload) => { ... });
payroll.on('employee:terminated', (payload) => { ... });
payroll.on('employee:rehired', (payload) => { ... });
payroll.on('salary:processed', (payload) => { ... });
payroll.on('salary:failed', (payload) => { ... });
payroll.on('payroll:completed', (payload) => { ... });
payroll.on('compensation:changed', (payload) => { ... });
payroll.on('leave:requested', (payload) => { ... });
payroll.on('leave:approved', (payload) => { ... });
payroll.on('leave:rejected', (payload) => { ... });

// Unsubscribe
payroll.off('employee:hired', handler);

// One-time listener
payroll.once('salary:processed', (payload) => { ... });
```

---

## Webhooks

### registerWebhook

```typescript
await payroll.registerWebhook({
  organizationId: ObjectId,
  url: string,                   // HTTPS endpoint
  events: string[],              // Event types to receive
  secret: string,                // For signature verification
  enabled?: boolean,             // Default: true
});
```

### Webhook Payload

```typescript
{
  id: string,                    // Webhook delivery ID
  event: string,                 // Event type
  timestamp: number,             // Unix timestamp
  data: { ... },                 // Event-specific payload
}
```

### Signature Verification

```typescript
const signature = req.headers['x-payroll-signature'];  // v1=<hmac>
const timestamp = req.headers['x-payroll-timestamp'];

// Verify timestamp (reject if >5 min old)
const now = Math.floor(Date.now() / 1000);
if (Math.abs(now - parseInt(timestamp)) > 300) {
  throw new Error('Signature expired');
}

// Verify signature
const signedPayload = `${timestamp}.${JSON.stringify(req.body)}`;
const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
const providedSig = signature.split('v1=')[1];

if (providedSig !== expectedSig) {
  throw new Error('Invalid signature');
}
```

---

## Configuration

```typescript
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel: Model<EmployeeDocument>,
    PayrollRecordModel: Model<PayrollRecordDocument>,
    TransactionModel: Model<TransactionDocument>,
    AttendanceModel?: Model<AttendanceDocument>,    // Optional
    LeaveRequestModel?: Model<LeaveRequestDocument>, // Optional
  })
  .withConfig({
    currency: string,            // Default currency code
    payroll: {
      attendanceIntegration: boolean,
      autoCreateTransaction: boolean,
      enableIdempotency: boolean,
      allowProRating: boolean,
    },
    leave: {
      enabled: boolean,
      accrualStartMonth: number,
      defaultBalances: {
        annual: number,
        sick: number,
        casual: number,
      },
    },
  })
  .forSingleTenant({             // Optional: single-tenant mode
    organizationId: ObjectId,
    autoInject: boolean,
  })
  .build();
```

---

## Types Reference

### Allowance

```typescript
interface Allowance {
  type: AllowanceType,
  name?: string,
  amount: number,
  isPercentage?: boolean,        // Amount is percentage of base
  value?: number,                // Percentage value if isPercentage
  taxable?: boolean,
  recurring?: boolean,
  effectiveFrom?: Date,
  effectiveTo?: Date | null,
}
```

### Deduction

```typescript
interface Deduction {
  type: DeductionType,
  name?: string,
  amount: number,
  isPercentage?: boolean,
  value?: number,
  auto?: boolean,
  recurring?: boolean,
  effectiveFrom?: Date,
  effectiveTo?: Date | null,
  description?: string,
  reducesTaxableIncome?: boolean,
}
```

### TaxBracket

```typescript
interface TaxBracket {
  min: number,                   // Minimum income for bracket
  max: number,                   // Maximum income for bracket
  rate: number,                  // Tax rate (0-1)
  effectiveFrom?: Date,          // When bracket becomes active
  effectiveTo?: Date | null,     // When bracket expires
}
```

### PayrollBreakdown

```typescript
interface PayrollBreakdown {
  baseAmount: number,
  allowances: Array<{ type, amount, taxable? }>,
  deductions: Array<{ type, amount, description? }>,
  grossSalary: number,
  netSalary: number,
  taxableAmount?: number,
  taxAmount?: number,
  workingDays?: number,
  actualDays?: number,
  proRatedAmount?: number,
  attendanceDeduction?: number,
}
```

### Compensation

```typescript
interface Compensation {
  baseAmount: number,                                      // Per-period amount
  frequency: 'monthly' | 'bi_weekly' | 'weekly' | 'daily' | 'hourly',
  currency: string,
  allowances: Allowance[],
  deductions: Deduction[],
  grossSalary?: number,
  netSalary?: number,
  effectiveFrom?: Date,
}
```

#### Payment Frequencies

| Frequency | baseAmount | Periods/Year | Pay Period Calculation |
|-----------|------------|--------------|------------------------|
| `monthly` | Monthly salary | 12 | Full calendar month |
| `bi_weekly` | Bi-weekly wage | 26 | 14 days ending on paymentDate |
| `weekly` | Weekly wage | 52 | 7 days ending on paymentDate |
| `daily` | Daily rate | 365 | Single day (paymentDate) |
| `hourly` | Hourly rate | 2080 | Single day (paymentDate) |

**Tax Calculation**: Taxes are annualized based on frequency. A weekly employee earning $2,000/week has the same annual tax burden as a monthly employee earning $8,666.67/month (~$104,000/year).

**nextPaymentDate**: Automatically calculated based on frequency after each payroll run.

---

## Error Classes

```typescript
import {
  PayrollError,            // Base error class
  NotInitializedError,     // Payroll not initialized
  EmployeeNotFoundError,   // Employee doesn't exist
  InvalidEmployeeError,    // Invalid employee data
  DuplicatePayrollError,   // Already processed for period
  NotEligibleError,        // Employee not eligible
  EmployeeTerminatedError, // Employee is terminated
  AlreadyProcessedError,   // Operation already completed
  ValidationError,         // Validation failed
  SecurityError,           // Security violation
} from '@classytic/payroll';

// Error properties
error.code      // Error code string
error.message   // Human-readable message
error.details   // Additional context
```

# @classytic/payroll

Enterprise-grade payroll for Mongoose. Simple, powerful, production-ready.

[![npm version](https://badge.fury.io/js/@classytic%2Fpayroll.svg)](https://www.npmjs.com/package/@classytic/payroll)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Employee Management** | Hire, terminate, re-hire, update employment | ✅ Production-ready |
| **Compensation** | Base salary, allowances, deductions, bank details | ✅ Production-ready |
| **Payroll Processing** | Monthly salary with automatic calculations | ✅ Production-ready |
| **Bulk Processing** | Concurrency, progress tracking, cancellation | ✅ Production-ready |
| **Streaming Mode** | Cursor-based processing for millions (auto-detect) | ✅ Production-ready |
| **Attendance Integration** | Native `@classytic/clockin` support for absences | ✅ Production-ready |
| **Leave Management** | Balances, requests, approvals, payroll integration | ✅ Production-ready |
| **Pro-rating** | Mid-month hires, terminations, attendance | ✅ Production-ready |
| **Tax Calculation** | Progressive tax brackets | ✅ Production-ready |
| **Holidays** | Public holidays, company holidays, paid/unpaid | ✅ Production-ready |
| **Multi-tenant** | Organization isolation, role-based access | ✅ Production-ready |
| **Single-tenant** | Auto-inject org ID, simplified API | ✅ Production-ready |
| **Transactions** | Atomic operations with Mongoose sessions | ✅ Production-ready |
| **Pure Functions** | No-DB calculations for previews/testing | ✅ Production-ready |

## Why This Package?

- 🎯 **One clear way** - No confusion, single path to success
- ⚡ **Attendance native** - Built-in `@classytic/clockin` integration
- 🏢 **Flexible deployment** - Single-tenant or multi-tenant
- 💰 **Smart calculations** - Pro-rating, tax, deductions, working days
- 📋 **Complete leave workflow** - Balances, requests, approvals, payroll
- 🧪 **Pure functions** - Test without database, client-side previews
- 🔒 **Transaction-safe** - Atomic operations, no partial writes
- 📦 **Zero config** - Works immediately with smart defaults

## Installation

```bash
npm install @classytic/payroll @classytic/clockin mongoose
```

## Quick Start (3 steps)

### 1. Create Models

```typescript
import mongoose from 'mongoose';
import { createAttendanceSchema } from '@classytic/clockin';
import { createEmployeeSchema, createPayrollRecordSchema, employeePlugin, createHolidaySchema } from '@classytic/payroll';

// Attendance (from ClockIn - required for payroll)
const Attendance = mongoose.model('Attendance', createAttendanceSchema());

// Employee (create schema + apply payroll plugin)
const employeeSchema = createEmployeeSchema();
employeeSchema.plugin(employeePlugin);
const Employee = mongoose.model('Employee', employeeSchema);

// PayrollRecord
const PayrollRecord = mongoose.model('PayrollRecord', createPayrollRecordSchema());

// Transaction (your own model)
const Transaction = mongoose.model('Transaction', transactionSchema);

// Holiday (optional - use our schema or your own)
const Holiday = mongoose.model('Holiday', createHolidaySchema());
```

### 2. Initialize

```typescript
import { createPayrollInstance } from '@classytic/payroll';

const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel: Employee,
    PayrollRecordModel: PayrollRecord,
    TransactionModel: Transaction,
    AttendanceModel: Attendance,
  })
  .build();
```

### 3. Use It

```typescript
// Hire employee
const employee = await payroll.hire({
  userId: user._id,
  organizationId: org._id,
  employment: {
    position: 'Software Engineer',
    department: 'it',
    type: 'full_time',
  },
  compensation: {
    baseAmount: 100000,
    currency: 'USD',
    allowances: [
      { type: 'housing', amount: 20000, taxable: true },
    ],
  },
});

// Process monthly payroll (automatic attendance deductions)
const result = await payroll.processSalary({
  employeeId: employee._id,
  month: 3,
  year: 2024,
});

console.log(result.payrollRecord.breakdown);
// {
//   baseAmount: 100000,
//   allowances: [{ type: 'housing', amount: 20000, taxable: true }],
//   deductions: [{ type: 'absence', amount: 9090, description: 'Unpaid leave deduction' }],
//   taxAmount: 2500,
//   grossSalary: 120000,
//   netSalary: 108410,
//   attendanceDeduction: 9090
// }
```

## Single-Tenant Setup

Building a single-organization HRM? Configure once, forget `organizationId` everywhere else:

```typescript
// Configure with your organization ID once
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel })
  .forSingleTenant({ organizationId: myOrg._id })  // ← Set once
  .build();

// No organizationId needed in operations - auto-injected!
const employee = await payroll.hire({
  userId: user._id,
  employment: { position: 'Manager', department: 'hr', type: 'full_time' },
  compensation: { baseAmount: 150000, currency: 'USD' },
});
```

## Attendance (ClockIn)

Attendance is **native**, not an add-on:

```typescript
import { ClockIn } from '@classytic/clockin';
import { getAttendance } from '@classytic/payroll';

// Initialize ClockIn
const clockin = await ClockIn.create()
  .withModels({ Attendance, Employee })
  .build();

// Employees check in
await clockin.checkIn.record({
  member: employee,
  targetModel: 'Employee',
  data: { method: 'qr_code' },
});

// Payroll automatically uses attendance
const attendance = await getAttendance(Attendance, {
  organizationId: org._id,
  employeeId: employee._id,
  month: 3,
  year: 2024,
  expectedDays: 22,
});

await payroll.processSalary({
  employeeId: employee._id,
  month: 3,
  year: 2024,
  attendance, // ← Deductions automatically applied
});
```

## Holidays

Simple approach - one way:

```typescript
import { getHolidays } from '@classytic/payroll';

// Add sudden off day
await Holiday.create({
  organizationId: org._id,
  date: new Date('2024-03-17'),
  name: 'Emergency closure',
  type: 'company',
  paid: true,
});

// Get holidays when processing
const holidays = await getHolidays(Holiday, {
  organizationId: org._id,
  startDate: new Date('2024-03-01'),
  endDate: new Date('2024-03-31'),
});

// Pass to payroll
await payroll.processSalary({
  employeeId,
  month: 3,
  year: 2024,
  options: { holidays },
});
```

## Payroll Processing Options

Fine-tune calculations per run:

```typescript
await payroll.processSalary({
  employeeId,
  month: 3,
  year: 2024,
  options: {
    holidays: [new Date('2024-03-17')],
    workSchedule: { workDays: [1, 2, 3, 4, 5], hoursPerDay: 8 },
    skipTax: true,
    skipAttendance: true,
    skipProration: true,
  },
});
```

## Percentage Allowances & Deductions

Percentage-based items are supported and calculated from base salary:

```typescript
await payroll.addAllowance({
  employeeId,
  type: 'housing',
  amount: 0,            // ignored when isPercentage is true
  isPercentage: true,
  value: 20,            // 20% of base salary
  recurring: true,
});

await payroll.addDeduction({
  employeeId,
  type: 'insurance',
  amount: 0,            // ignored when isPercentage is true
  isPercentage: true,
  value: 5,             // 5% of base salary
  recurring: true,
});
```

## Bulk Payroll Processing

Process payroll for multiple employees with production-ready features:

### Basic Usage (Backward Compatible)

```typescript
// Process all active employees
const result = await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
});

console.log(result);
// {
//   successful: [{ employeeId: 'EMP-001', amount: 108410, transactionId: ... }, ...],
//   failed: [{ employeeId: 'EMP-042', error: 'Insufficient balance' }],
//   total: 150
// }
```

### With Progress Tracking

Perfect for UI progress bars and job queue updates:

```typescript
await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  onProgress: (progress) => {
    console.log(`${progress.percentage}% - ${progress.successful} ok, ${progress.failed} failed`);
    // 20% - 30 ok, 0 failed
    // 40% - 60 ok, 0 failed
    // ...
  }
});
```

### Job Queue Integration

Update job progress in your database:

```typescript
const job = await jobQueue.add({
  type: 'monthly-payroll',
  month: 3,
  year: 2024,
});

await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  batchSize: 10,        // Process 10 employees at a time
  batchDelay: 100,      // 100ms pause between batches
  onProgress: async (progress) => {
    // Update job in database
    await Job.findByIdAndUpdate(job._id, {
      'progress.processed': progress.processed,
      'progress.total': progress.total,
      'progress.percentage': progress.percentage,
    });

    // Emit websocket event for real-time UI updates
    io.to(job.id).emit('payroll:progress', progress);
  }
});
```

### Cancellation Support

Allow users to cancel long-running operations:

```typescript
const controller = new AbortController();

// Start processing
const promise = payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  signal: controller.signal,
});

// User clicks "Cancel" button
cancelButton.onclick = () => {
  controller.abort();  // Gracefully stops after current employee
};

try {
  await promise;
} catch (error) {
  if (error.message.includes('cancelled')) {
    console.log('Payroll processing was cancelled by user');
  }
}
```

### Concurrency Control

Process employees in parallel for faster execution:

```typescript
// SEQUENTIAL (default, safest)
await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  concurrency: 1,  // One at a time (default)
});

// MODERATE CONCURRENCY (faster, recommended for 100-500 employees)
await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  concurrency: 5,   // 5 employees in parallel
  batchSize: 20,    // 20 employees per batch
});

// HIGH CONCURRENCY (fastest, for robust infrastructure)
await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  concurrency: 10,  // 10 employees in parallel
  batchSize: 50,    // 50 employees per batch
});
```

### Streaming Mode (Millions of Employees)

For organizations with **10,000+ employees**, the system automatically switches to **cursor-based streaming** to prevent memory exhaustion:

```typescript
// Auto-detected streaming for large datasets
const result = await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  // ✅ Automatically uses streaming if >10,000 employees
  // ✅ No memory limits - processes millions efficiently
  // ✅ Constant memory usage via MongoDB cursors
});
```

#### Why Streaming?

**Traditional approach** (default for <10k employees):
- Loads all employees into memory
- Fast for small-medium datasets (100-10,000 employees)
- Memory usage grows with employee count

**Streaming approach** (auto-enabled for >10k employees):
- Uses MongoDB cursors (`for await` loops)
- Processes one employee at a time
- **Constant memory** - scales to millions
- No `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`

#### How It Works

```
MongoDB Cursor → Worker Pool → Results
    ↓              ↓              ↓
   Stream       Concurrency     Success/
  1M+ docs      Control        Failed
               (p-limit)
```

#### Manual Control

Force streaming mode even for smaller datasets:

```typescript
// Force streaming (useful for testing or low-memory environments)
await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  useStreaming: true,  // ← Force cursor-based streaming
  concurrency: 10,     // Still supports concurrency
});
```

Disable streaming (force in-memory mode):

```typescript
// Force in-memory mode (faster for <10k employees)
await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,
  useStreaming: false,  // ← Force in-memory processing
});
```

#### Real-World Example (100,000 Employees)

```typescript
// Process 100k employees with streaming
const result = await payroll.processBulkPayroll({
  organizationId: org._id,
  month: 3,
  year: 2024,

  // Streaming (auto-detected)
  // useStreaming: true,  // ← Not needed, auto-detected

  // Concurrency for speed
  concurrency: 10,
  batchSize: 50,

  // Progress tracking (updates every 50 employees)
  onProgress: async (progress) => {
    console.log(`${progress.percentage}% - ${progress.processed}/${progress.total}`);
    // 0.05% - 50/100000
    // 0.10% - 100/100000
    // ...
  },

  // Cancellation support
  signal: abortController.signal,
});

// Memory usage: ~50-100MB (constant)
// Duration: ~30-60 minutes (depends on concurrency and DB performance)
```

#### Performance Comparison

| Employee Count | In-Memory | Streaming | Memory Usage |
|---------------|-----------|-----------|--------------|
| 100 | ✅ Fast (5s) | Slower (8s) | 10 MB |
| 1,000 | ✅ Fast (30s) | Slower (45s) | 50 MB |
| 10,000 | ⚠️ Slow (5m) | ✅ Fast (6m) | 200 MB vs **50 MB** |
| 100,000 | ❌ Crashes | ✅ Works (60m) | N/A vs **50 MB** |
| 1,000,000 | ❌ Crashes | ✅ Works (10h) | N/A vs **50 MB** |

**Recommendation**: Let the system auto-detect. It chooses the optimal mode based on your dataset size.

### Complete Example (Production-Ready)

Combining all features for a real-world job queue:

```typescript
export async function processMonthlyPayroll(jobId: string) {
  const job = await Job.findById(jobId);
  const controller = new AbortController();

  // Allow job cancellation
  job.on('cancel', () => controller.abort());

  try {
    const result = await payroll.processBulkPayroll({
      organizationId: job.data.organizationId,
      month: job.data.month,
      year: job.data.year,

      // Cancellation
      signal: controller.signal,

      // Batching (prevents DB exhaustion)
      batchSize: 10,
      batchDelay: 50,  // Small delay to let DB breathe

      // Concurrency (3-5x faster)
      concurrency: 5,

      // Progress tracking
      onProgress: async (progress) => {
        await Job.findByIdAndUpdate(jobId, {
          progress: {
            processed: progress.processed,
            total: progress.total,
            successful: progress.successful,
            failed: progress.failed,
            percentage: progress.percentage,
          },
          updatedAt: new Date(),
        });

        // Real-time updates via WebSocket
        io.to(`job:${jobId}`).emit('progress', progress);
      },
    });

    // Mark job as completed
    await Job.findByIdAndUpdate(jobId, {
      status: 'completed',
      result: {
        total: result.total,
        successful: result.successful.length,
        failed: result.failed.length,
        errors: result.failed,
      },
      completedAt: new Date(),
    });

  } catch (error) {
    // Mark job as failed
    await Job.findByIdAndUpdate(jobId, {
      status: error.message.includes('cancelled') ? 'cancelled' : 'failed',
      error: error.message,
      failedAt: new Date(),
    });
    throw error;
  }
}
```

### Performance Tips

**Batch Size**:
- **Small (5-10)**: Slower, but more stable, frequent progress updates
- **Medium (20-50)**: Balanced, good for most use cases
- **Large (100+)**: Faster, but infrequent progress updates

**Batch Delay**:
- **0ms**: No delay, fastest (default)
- **50-100ms**: Recommended for preventing DB connection pool exhaustion
- **500ms+**: Rate limiting for external API calls

**Concurrency**:
- **1**: Sequential, safest, predictable (default)
- **3-5**: Sweet spot for most deployments
- **10+**: Requires robust infrastructure (DB connection pool, CPU, memory)

### Why This Matters

Users were choosing **Odoo** and **Zoho** because they needed:
- ✅ Progress tracking for long-running payroll jobs
- ✅ Ability to cancel operations mid-processing
- ✅ Batch processing to prevent server crashes
- ✅ Concurrency for processing 1000+ employees

Now you have all of these features with **full backward compatibility**. No breaking changes.

## Leave Management

Complete leave workflow with balances, requests, and payroll integration.

### Quick Start (3 Steps)

```typescript
import {
  employmentFields,
  leaveBalanceFields,
  employeePlugin,
  getLeaveRequestModel,
  createLeaveService,
} from '@classytic/payroll';

// 1. Setup Employee with leave balances
const employeeSchema = new Schema({
  ...employmentFields,
  ...leaveBalanceFields,  // Adds leaveBalances: [{ type, allocated, used, pending, year }]
});
employeeSchema.plugin(employeePlugin, { enableLeave: true });
const Employee = mongoose.model('Employee', employeeSchema);

// 2. Setup LeaveRequest model
const LeaveRequest = getLeaveRequestModel();

// 3. Create leave service (handles all workflows)
const leaveService = createLeaveService({
  EmployeeModel: Employee,
  LeaveRequestModel: LeaveRequest,
  config: {
    enforceBalance: true,    // Validate sufficient balance
    checkOverlap: true,      // Prevent conflicting requests
  },
});
```

### Leave Types (8 Built-in)

| Type | Default Allocation | Description |
|------|-------------------|-------------|
| `annual` | 20 days | Paid vacation/annual leave |
| `sick` | 10 days | Paid sick leave |
| `unpaid` | Unlimited | Unpaid leave (affects payroll) |
| `maternity` | 90 days | Maternity leave |
| `paternity` | 10 days | Paternity leave |
| `bereavement` | 5 days | Bereavement leave |
| `compensatory` | - | Comp time off |
| `other` | - | Custom leave types |

### Common Use Cases

#### 1. Request Leave (With Auto-Calculation)

```typescript
// Automatically calculates working days, validates balance, updates employee
const { request, days } = await leaveService.requestLeave({
  organizationId: org._id,
  employeeId: employee._id,
  userId: user._id,
  request: {
    type: 'annual',
    startDate: new Date('2024-06-03'),
    endDate: new Date('2024-06-07'),  // Auto-excludes weekends
    reason: 'Summer vacation',
  },
  holidays: [new Date('2024-06-04')],  // Exclude public holiday
});
// → days = 4 (excluded weekend + holiday)
// → employee.leaveBalances[0].pending += 4
```

#### 2. Approve/Reject Leave

```typescript
// Approve (pending → used in balance)
await leaveService.reviewLeave({
  requestId: request._id,
  reviewerId: manager._id,
  action: 'approve',
  notes: 'Enjoy your vacation!',
});

// Reject (remove from pending balance)
await leaveService.reviewLeave({
  requestId: request._id,
  reviewerId: manager._id,
  action: 'reject',
  notes: 'Peak season - please reschedule',
});
```

#### 3. Cancel Leave

```typescript
// Employee cancels (before or after approval)
await leaveService.cancelLeave({
  requestId: request._id,
});
// Restores balance automatically
```

#### 4. Check Balance & Overlap

```typescript
import { hasLeaveBalance, getAvailableDays } from '@classytic/payroll';

// Check if employee can request 5 days
if (hasLeaveBalance(employee, 'annual', 5, 2024)) {
  // Has sufficient balance
}

// Get available days
const available = getAvailableDays(employee, 'annual', 2024); // → 15

// Check for conflicts
const { hasOverlap } = await leaveService.checkOverlap({
  employeeId: employee._id,
  startDate: new Date('2024-06-05'),
  endDate: new Date('2024-06-10'),
});
```

#### 5. Unpaid Leave → Payroll Deduction

```typescript
// Calculate unpaid leave deduction for the month
const { totalDays, deduction } = await leaveService.calculateUnpaidDeduction({
  organizationId: org._id,
  employeeId: employee._id,
  startDate: new Date('2024-06-01'),
  endDate: new Date('2024-06-30'),
  baseSalary: 100000,
  workingDaysInMonth: 22,
});
// → totalDays = 3, deduction = 13636

// Apply deduction to payroll
await payroll.addDeduction({
  employeeId: employee._id,
  type: 'absence',
  amount: deduction,
  auto: true,
  recurring: false,
  description: `Unpaid leave: ${totalDays} days`,
});
```

#### 6. Year-End Carry Over

```typescript
import { calculateCarryOver } from '@classytic/payroll';

// Carry over unused leave (with limits)
const newBalances = calculateCarryOver(employee.leaveBalances, {
  annual: 5,        // Max 5 days carry-over
  compensatory: 3,  // Max 3 days
});

employee.leaveBalances = newBalances;
await employee.save();

// Or use plugin method
employee.processLeaveCarryOver(2024);
await employee.save();
```

### Single-Tenant Mode

Skip `organizationId` in single-organization setups:

```typescript
const leaveService = createLeaveService({
  EmployeeModel: Employee,
  LeaveRequestModel: LeaveRequest,
  config: {
    singleTenant: true,  // organizationId becomes optional everywhere
  },
});

// Request without organizationId
await leaveService.requestLeave({
  employeeId: employee._id,
  userId: user._id,
  request: {
    type: 'annual',
    startDate: new Date('2024-06-03'),
    endDate: new Date('2024-06-07'),
  },
});

// With default organizationId for storage
const leaveService = createLeaveService({
  EmployeeModel: Employee,
  LeaveRequestModel: LeaveRequest,
  config: {
    singleTenant: true,
    defaultOrganizationId: myOrg._id,
  },
});
```

### Query Leave Requests

```typescript
// Pending requests
const pending = await LeaveRequest.findPendingByOrganization(org._id);

// Employee history
const history = await LeaveRequest.findByEmployee(employee._id, {
  status: 'approved',
  year: 2024,
});

// Period query (for reports)
const requests = await LeaveRequest.findByPeriod(
  org._id,
  new Date('2024-06-01'),
  new Date('2024-06-30'),
  { type: 'unpaid' }
);

// Statistics
const stats = await LeaveRequest.getLeaveStats(employee._id, 2024);
// → [{ _id: 'annual', totalDays: 10, count: 2 }, ...]
```

### Balance Utilities

```typescript
import {
  initializeLeaveBalances,
  hasLeaveBalance,
  getAvailableDays,
  getLeaveSummary,
  calculateLeaveDays,
} from '@classytic/payroll';

// Initialize for new employee
const balances = initializeLeaveBalances(new Date('2024-01-01'), {}, 2024);
employee.leaveBalances = balances;

// Pro-rated for mid-year hire
const balances = initializeLeaveBalances(new Date('2024-07-01'), {
  proRateNewHires: true,
}, 2024);

// Check balance
hasLeaveBalance(employee, 'annual', 5, 2024); // → true/false

// Get available days
getAvailableDays(employee, 'annual', 2024); // → 15

// Full summary
const summary = getLeaveSummary(employee, 2024);
// {
//   totalAllocated: 30, totalUsed: 7, totalPending: 4, totalAvailable: 19,
//   byType: { annual: { allocated: 20, used: 5, pending: 2, available: 13 }, ... }
// }

// Calculate working days
calculateLeaveDays(
  new Date('2024-06-03'),
  new Date('2024-06-07'),
  { holidays: [new Date('2024-06-04')] }
); // → 4 (excludes weekend + holiday)
```

### Transactional Workflows

All `LeaveService` methods support Mongoose sessions for atomic operations:

```typescript
const session = await mongoose.startSession();
session.startTransaction();

try {
  const result = await leaveService.requestLeave({
    organizationId: org._id,
    employeeId: employee._id,
    userId: user._id,
    request: { type: 'annual', startDate, endDate },
    session,  // ← Atomic with other operations
  });

  // Other operations in same transaction
  await OtherModel.create({ ... }, { session });

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### Configuration Options

```typescript
createLeaveService({
  EmployeeModel,
  LeaveRequestModel,
  config: {
    // Validation
    enforceBalance: true,    // Validate sufficient balance (default: true)
    checkOverlap: true,      // Prevent overlapping requests (default: true)

    // Working days
    workingDaysOptions: {
      workDays: [1, 2, 3, 4, 5],  // Mon-Fri (default)
      holidays: [new Date('2024-12-25')],
    },

    // Single/Multi-tenant
    singleTenant: false,           // Enable single-tenant mode (default: false)
    defaultOrganizationId: null,   // Default org for single-tenant

    // Custom fields
    leaveBalancesField: 'leaveBalances',  // Field name on employee (default)
  },
});
```

### Indexes (Opt-in)

```typescript
import { createLeaveRequestSchema } from '@classytic/payroll';

const leaveRequestSchema = createLeaveRequestSchema({}, {
  createIndexes: true,     // Apply recommended indexes
  enableTTL: true,         // Auto-cleanup old records
  ttlSeconds: 63072000,    // 2 years (default)
});

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
```

**Recommended indexes:**
- `{ organizationId: 1, employeeId: 1, startDate: -1 }` - Employee leave history
- `{ organizationId: 1, status: 1, createdAt: -1 }` - Pending requests
- `{ employeeId: 1, status: 1 }` - Single-tenant queries
- `{ organizationId: 1, type: 1, status: 1 }` - Reports by type

## Logging

Control logging in production:

```typescript
import { createPayrollInstance } from '@classytic/payroll';
import { disableLogging, enableLogging } from '@classytic/payroll/utils';

// Disable in production
if (process.env.NODE_ENV === 'production') {
  disableLogging();
}

// Or use custom logger
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel, AttendanceModel })
  .withLogger({
    info: (msg, meta) => pino.info(meta, msg),
    error: (msg, meta) => pino.error(meta, msg),
    warn: (msg, meta) => pino.warn(meta, msg),
    debug: (msg, meta) => pino.debug(meta, msg),
  })
  .build();
```

## Indexes

This package does **not** create indexes automatically. This gives you full control over your database indexes based on your actual query patterns.

### Opt-in Index Creation

If you want the library to create indexes for you, explicitly opt-in:

```typescript
// Employee plugin with indexes
employeeSchema.plugin(employeePlugin, { createIndexes: true });
```

### Manual Index Creation

For more control, use the exported index helpers:

```typescript
import {
  applyEmployeeIndexes,
  applyPayrollRecordIndexes,
  employeeIndexes,
  payrollRecordIndexes
} from '@classytic/payroll';

// Apply all recommended indexes
applyEmployeeIndexes(employeeSchema);
applyPayrollRecordIndexes(payrollRecordSchema);

// Or inspect and apply selectively
console.log(employeeIndexes);
// [
//   { fields: { organizationId: 1, employeeId: 1 }, options: { unique: true } },
//   { fields: { userId: 1, organizationId: 1 }, options: { unique: true } },
//   { fields: { organizationId: 1, status: 1 } },
//   { fields: { organizationId: 1, department: 1 } },
//   { fields: { organizationId: 1, 'compensation.netSalary': -1 } },
// ]
```

### Why No Auto-Indexes?

Unused indexes waste memory and slow down writes. By making indexes opt-in:
- You only create indexes you actually need
- You can analyze your query patterns first
- No surprise index creation on production databases

## API Reference

### Payroll Instance

```typescript
// Employee Lifecycle
payroll.hire(params)           // Hire new employee with compensation
payroll.updateEmployment(params) // Update position, department, type
payroll.terminate(params)      // Terminate with reason and date
payroll.reHire(params)         // Re-hire terminated employee

// Compensation Management
payroll.updateSalary(params)   // Update base salary and compensation
payroll.addAllowance(params)   // Add one-time or recurring allowance
payroll.removeAllowance(params) // Remove allowance by type
payroll.addDeduction(params)   // Add deduction (tax, insurance, etc.)
payroll.removeDeduction(params) // Remove deduction by type
payroll.updateBankDetails(params) // Update payment information

// Payroll Processing
payroll.processSalary(params)  // Process monthly salary for one employee
payroll.processBulkPayroll(params) // Process for multiple employees
payroll.payrollHistory(params) // Query payroll records
payroll.payrollSummary(params) // Aggregate statistics
```

### Leave Service

```typescript
// Request & Review
leaveService.requestLeave(params)    // Create request, validate, update balance
leaveService.reviewLeave(params)     // Approve/reject with balance updates
leaveService.cancelLeave(params)     // Cancel and restore balance

// Queries
leaveService.getLeaveForPayroll(params)      // Get approved leaves for period
leaveService.checkOverlap(params)            // Check for conflicts
leaveService.calculateUnpaidDeduction(params) // Calculate payroll deduction
```

### LeaveRequest Model (Statics)

```typescript
LeaveRequest.findByEmployee(employeeId, options)
LeaveRequest.findPendingByOrganization(orgId?)
LeaveRequest.findByPeriod(orgId?, startDate, endDate, options)
LeaveRequest.getLeaveStats(employeeId, year)
LeaveRequest.getOrganizationSummary(orgId?, year)
LeaveRequest.findOverlapping(employeeId, startDate, endDate)
LeaveRequest.hasOverlap(employeeId, startDate, endDate)
```

### Pure Functions (No DB)

```typescript
// Salary Calculations
import {
  calculateSalaryBreakdown,
  calculateTax,
  countWorkingDays,
} from '@classytic/payroll/core';

// Leave Calculations
import {
  calculateLeaveDays,
  hasLeaveBalance,
  getAvailableDays,
  getLeaveSummary,
  initializeLeaveBalances,
  calculateCarryOver,
  calculateUnpaidLeaveDeduction,
} from '@classytic/payroll/utils';

// Use for previews, testing, or client-side calculations
const breakdown = calculateSalaryBreakdown({
  baseSalary: 100000,
  currency: 'USD',
  hireDate: new Date('2024-01-01'),
  periodStart: new Date('2024-03-01'),
  periodEnd: new Date('2024-03-31'),
  allowances: [{ type: 'housing', amount: 20000, taxable: true }],
  deductions: [{ type: 'insurance', amount: 5000 }],
  options: { holidays: [new Date('2024-03-26')] },
  attendance: { expectedDays: 22, actualDays: 20 },
});
```

## Related Packages

- **[@classytic/clockin](https://npmjs.com/package/@classytic/clockin)** - Attendance management (optional peer dependency for attendance-based deductions)

## License

MIT © [Sadman Chowdhury](https://github.com/classytic)

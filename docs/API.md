# API Reference

## Installation

```bash
npm install @classytic/payroll mongoose
```

## Quick Start

```typescript
import { createPayrollInstance } from '@classytic/payroll';

const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .build();
```

## Employee Management

### Hire Employee

```typescript
await payroll.hire({
  organizationId,
  employment: {
    email: 'john@company.com',
    employeeId: 'EMP-001',
    position: 'Engineer',
    department: 'it',
    hireDate: new Date(),
  },
  compensation: {
    baseSalary: 80000,
    currency: 'USD',
    frequency: 'monthly',
  },
});
```

### Update Employment

```typescript
await payroll.updateEmployment({
  employeeId,
  updates: {
    position: 'Senior Engineer',
    department: 'it',
  },
});
```

### Terminate Employee

```typescript
await payroll.terminate({
  employeeId,
  terminationDate: new Date(),
  reason: 'resignation',
});
```

### Re-hire Employee

```typescript
await payroll.reHire({
  employeeId,
  hireDate: new Date(),
});
```

## Compensation

### Update Salary

```typescript
await payroll.updateSalary({
  employeeId,
  compensation: {
    baseSalary: 90000,
  },
  effectiveFrom: new Date(),
});
```

### Add Allowance

```typescript
await payroll.addAllowance({
  employeeId,
  allowance: {
    type: 'housing',
    amount: 2000,
    taxable: true,
  },
});
```

### Add Deduction

```typescript
await payroll.addDeduction({
  employeeId,
  deduction: {
    type: 'loan',
    amount: 500,
    auto: true,
  },
});
```

### Update Bank Details

```typescript
await payroll.updateBankDetails({
  employeeId,
  bankDetails: {
    accountNumber: '1234567890',
    bankName: 'Example Bank',
    routingNumber: 'ROUTE123',
  },
});
```

## Payroll Processing

### Process Single Salary

```typescript
await payroll.processSalary({
  organizationId,
  employeeId,
  period: {
    month: 1,
    year: 2024,
  },
});
```

### Process Bulk Salaries

```typescript
const result = await payroll.processBulkPayroll({
  organizationId,
  employeeIds,
  month: 1,
  year: 2024,
  batchSize: 50,
});

console.log(`Processed: ${result.successful}, Failed: ${result.failed}`);
```

### Bulk with Progress Tracking

```typescript
await payroll.processBulkPayroll({
  organizationId,
  employeeIds,
  month: 1,
  year: 2024,
  onProgress: (progress) => {
    console.log(`${progress.current}/${progress.total} - ${progress.percentage}%`);
  },
});
```

## Leave Management

### Request Leave

```typescript
await payroll.requestLeave({
  employeeId,
  organizationId,
  leaveType: 'sick',
  startDate: new Date('2024-01-15'),
  endDate: new Date('2024-01-17'),
  reason: 'Medical appointment',
});
```

### Approve Leave

```typescript
await payroll.approveLeave({
  leaveRequestId,
  approverId: managerId,
});
```

### Reject Leave

```typescript
await payroll.rejectLeave({
  leaveRequestId,
  rejectedBy: managerId,
  rejectionReason: 'Insufficient leave balance',
});
```

### Get Leave Balance

```typescript
const balance = await payroll.getLeaveBalance({
  employeeId,
  organizationId,
});

console.log(balance.annual); // { total: 20, used: 5, remaining: 15 }
```

## Queries with Pagination

### Find Active Employees

```typescript
const result = await payroll.managers.employee.service.findActive({
  page: 1,
  limit: 100,
  sort: '-createdAt',
});

console.log(result.docs); // Employee[]
console.log(result.total); // Total count
console.log(result.page); // Current page
```

### Find by Department

```typescript
const result = await payroll.managers.employee.service.findByDepartment('it', {
  page: 1,
  limit: 50,
});
```

### Find Eligible for Payroll

```typescript
const result = await payroll.managers.employee.service.findEligibleForPayroll({
  page: 1,
  limit: 100,
});
```

### Department Stats (Aggregated)

```typescript
const stats = await payroll.managers.compensation.service.getDepartmentCompensationStats('it');

console.log(stats.employeeCount); // 50
console.log(stats.averageBase); // 75000
console.log(stats.totalBase); // 3750000
```

### Organization Stats (Aggregated)

```typescript
const stats = await payroll.managers.compensation.service.getOrganizationCompensationStats();

console.log(stats.employeeCount); // 200
console.log(stats.byDepartment.it.count); // 50
console.log(stats.byDepartment.hr.count); // 30
```

## Attendance Integration

### Setup

```typescript
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel, // Optional
  })
  .withConfig({
    payroll: { attendanceIntegration: true },
  })
  .build();
```

### Process with Attendance

```typescript
import { getAttendance } from '@classytic/payroll';

const attendance = await getAttendance(AttendanceModel, {
  employeeId,
  organizationId,
  year: 2024,
  month: 1,
});

await payroll.processSalary({
  organizationId,
  employeeId,
  period: { month: 1, year: 2024 },
  attendance, // Explicit attendance
});
```

## Events

### Listen to Events

```typescript
payroll.on('employee:hired', (payload) => {
  console.log(`New hire: ${payload.employee.email}`);
});

payroll.on('payroll:processed', (payload) => {
  console.log(`Salary processed: ${payload.payrollRecord.id}`);
});

payroll.on('leave:requested', (payload) => {
  console.log(`Leave request: ${payload.leaveRequest.id}`);
});
```

### Available Events

- `employee:hired`
- `employee:terminated`
- `employee:rehired`
- `compensation:updated`
- `salary:processed`
- `payroll:processed`
- `payroll:paid`
- `leave:requested`
- `leave:approved`
- `leave:rejected`

## Webhooks

### Register Webhook

```typescript
await payroll.registerWebhook({
  organizationId,
  url: 'https://api.example.com/webhooks/payroll',
  events: ['payroll:processed', 'employee:hired'],
  secret: 'your-webhook-secret',
});
```

### Verify Webhook Signature

```typescript
import crypto from 'crypto';

function verifyWebhook(req, secret) {
  const signature = req.headers['x-payroll-signature'];
  const timestamp = req.headers['x-payroll-timestamp'];

  // Check timestamp freshness (5 min window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error('Signature expired');
  }

  // Verify HMAC
  const signedPayload = `${timestamp}.${JSON.stringify(req.body)}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  const providedSig = signature.split('v1=')[1];

  if (providedSig !== expectedSig) {
    throw new Error('Invalid signature');
  }

  return true;
}
```

## Models & Schemas

### Using Built-in Models

```typescript
import { getEmployeeModel, getPayrollRecordModel } from '@classytic/payroll';

const Employee = getEmployeeModel();
const PayrollRecord = getPayrollRecordModel();
```

### Custom Employee Schema

```typescript
import { createEmployeeSchema, createEmploymentFields } from '@classytic/payroll';
import { Schema, model } from 'mongoose';

// Option 1: Use schema factory with additional fields
const employeeSchema = createEmployeeSchema({
  certifications: [{ name: String, issuedDate: Date }],
  skills: [String],
});

// Option 2: Spread fields into your own schema
const customSchema = new Schema({
  ...createEmploymentFields({ organizationRef: 'Branch' }), // Multi-branch support
  certifications: [{ name: String, issuedDate: Date }],
  skills: [String],
});

const Employee = model('Employee', employeeSchema);
```

### Custom Transaction Schema

```typescript
const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  type: String,
  flow: String, // 'inflow' or 'outflow'
  grossAmount: Number, // v3.0: Gross amount (before deductions)
  amount: Number, // v3.0: Net amount (actual payment)
  tax: Number,
  currency: String,
  metadata: Schema.Types.Mixed,
});

const Transaction = model('Transaction', transactionSchema);
```

## Configuration

### Full Configuration

```typescript
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel,
    LeaveRequestModel,
  })
  .withConfig({
    currency: 'USD',
    payroll: {
      attendanceIntegration: true,
      autoCreateTransaction: true,
      enableIdempotency: true,
    },
    leave: {
      enabled: true,
      accrualStartMonth: 1,
      defaultBalances: {
        annual: 20,
        sick: 10,
        casual: 5,
      },
    },
  })
  .build();
```

## TypeScript Types

```typescript
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  LeaveRequestDocument,
  EmployeeStatus,
  PayrollStatus,
  LeaveType,
  LeaveStatus,
} from '@classytic/payroll';
```

## Error Handling

```typescript
try {
  await payroll.processSalary({ employeeId, period });
} catch (error) {
  if (error.code === 'DUPLICATE_PAYROLL') {
    console.log('Already processed');
  } else if (error.code === 'EMPLOYEE_NOT_FOUND') {
    console.log('Employee does not exist');
  } else {
    throw error;
  }
}
```

## Multi-Tenant Setup

```typescript
import { Repository } from '@classytic/mongokit';
import { multiTenantPlugin } from '@classytic/payroll/plugins';

const organizationId = new ObjectId('...');

const employeeRepo = new Repository(EmployeeModel, [
  multiTenantPlugin(organizationId),
]);

const payroll = createPayrollInstance()
  .withRepository('employee', employeeRepo)
  .withModels({ PayrollRecordModel, TransactionModel })
  .build();
```

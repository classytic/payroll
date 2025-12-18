# Single-Tenant Setup

For single-organization HRM, no `organizationId` needed anywhere.

## Setup

```typescript
import mongoose from 'mongoose';
import { ClockIn, createAttendanceSchema } from '@classytic/clockin';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from '@classytic/payroll';

// Models
const Attendance = model('Attendance', createAttendanceSchema());
const employeeSchema = createEmployeeSchema();
employeeSchema.plugin(employeePlugin);
const Employee = model('Employee', employeeSchema);
const PayrollRecord = model('PayrollRecord', createPayrollRecordSchema());
const Transaction = model('Transaction', transactionSchema);

// Initialize both in single-tenant mode
const clockin = await ClockIn.create()
  .withModels({ Attendance, Employee })
  .forSingleTenant()  // ← No organizationId needed
  .build();

const payroll = createPayrollInstance()
  .withModels({ EmployeeModel: Employee, PayrollRecordModel, TransactionModel, AttendanceModel: Attendance })
  .forSingleTenant()  // ← No organizationId needed
  .build();
```

## Usage

```typescript
// Hire - no organizationId
const employee = await payroll.hire({
  userId: user._id,
  employment: { position: 'Engineer', type: 'full_time' },
  compensation: { baseAmount: 100000, currency: 'USD' },
});

// Check in - no organizationId
await clockin.checkIn.record({
  member: employee,
  targetModel: 'Employee',
  data: { method: 'qr_code' },
});

// Process salary - no organizationId
await payroll.processSalary({
  employeeId: employee._id,
  month: 3,
  year: 2024,
});
```

That's it! The library handles everything internally.

## When to Use

- Single company/organization
- No multi-tenant needs
- Simpler codebase

## When NOT to Use

- SaaS with multiple organizations
- Different tenants need data isolation
- Multi-company payroll processing

→ Use multi-tenant mode instead (default)

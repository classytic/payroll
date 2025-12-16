# @classytic/payroll

Enterprise-grade payroll for Mongoose. Simple, powerful, production-ready.

[![npm version](https://badge.fury.io/js/@classytic%2Fpayroll.svg)](https://www.npmjs.com/package/@classytic/payroll)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Package?

- 🎯 **One clear way to do things** - No confusion, no multiple paths
- ⚡ **Attendance built-in** - Uses `@classytic/clockin` natively
- 🏢 **Multi-tenant & Single-tenant** - Both supported out of the box
- 💰 **Smart calculations** - Pro-rating, tax, deductions, all automatic
- 🧪 **Pure functions** - Test easily, preview without DB
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
import { createAttendanceSchema } from '@classytic/clockin/schemas';
import { employeeSchema, employeePlugin, payrollRecordSchema, createHolidaySchema } from '@classytic/payroll';

// Attendance (from ClockIn - required for payroll)
const Attendance = mongoose.model('Attendance', createAttendanceSchema());

// Employee (with payroll plugin)
employeeSchema.plugin(employeePlugin);
const Employee = mongoose.model('Employee', employeeSchema);

// PayrollRecord
const PayrollRecord = mongoose.model('PayrollRecord', payrollRecordSchema);

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
//   baseSalary: 100000,
//   allowances: 20000,
//   deductions: 9090,  // ← Attendance deduction
//   tax: 2500,
//   gross: 120000,
//   net: 108410
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
const clockin = ClockIn.create()
  .withModels({ Attendance, Membership: Employee })
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

## Logging

Control logging in production:

```typescript
import { disableLogging, enableLogging } from '@classytic/payroll/utils';

// Disable in production
if (process.env.NODE_ENV === 'production') {
  disableLogging();
}

// Or use custom logger
payroll.initialize({
  ...models,
  logger: {
    info: (msg, meta) => pino.info(meta, msg),
    error: (msg, meta) => pino.error(meta, msg),
    warn: (msg, meta) => pino.warn(meta, msg),
    debug: (msg, meta) => pino.debug(meta, msg),
  },
});
```

## API

```typescript
// Employee lifecycle
payroll.hire({ ... })
payroll.updateEmployment({ ... })
payroll.terminate({ ... })
payroll.reHire({ ... })

// Compensation
payroll.updateSalary({ ... })
payroll.addAllowance({ ... })
payroll.addDeduction({ ... })

// Payroll processing
payroll.processSalary({ ... })
payroll.processBulkPayroll({ ... })
payroll.payrollHistory({ ... })
payroll.payrollSummary({ ... })

// Pure functions (for previews/testing)
import { calculateSalaryBreakdown, countWorkingDays, calculateTax } from '@classytic/payroll/core';
```

## Related Packages

- **[@classytic/clockin](https://npmjs.com/package/@classytic/clockin)** - Attendance management (required peer dependency)

## License

MIT © [Sadman Chowdhury](https://github.com/classytic)

# Complete HRM Setup Guide

Build a production-grade HR Management system. One clear path, no confusion.

## 🎯 Stack

```
@classytic/clockin  → Attendance (check-in/out, analytics)
@classytic/payroll  → Payroll (salary, compensation, processing)
mongoose            → Database
```

## 📦 Installation

```bash
npm install @classytic/clockin @classytic/payroll mongoose
```

## 🏗️ Setup (5 Models)

### 1. Organization

```typescript
// models/organization.ts
import { Schema, model } from 'mongoose';

const organizationSchema = new Schema({
  name: { type: String, required: true },
  
  settings: {
    currency: { type: String, default: 'USD' },
    country: { type: String, default: 'US' },
    workDays: { type: [Number], default: [1, 2, 3, 4, 5] }, // Mon-Fri
    hoursPerDay: { type: Number, default: 8 },
    payDay: { type: Number, default: 28 },
  },
}, { timestamps: true });

export const Organization = model('Organization', organizationSchema);
```

### 2. Attendance

```typescript
// models/attendance.ts
import { model } from 'mongoose';
import { createAttendanceSchema } from '@classytic/clockin/schemas';

export const Attendance = model('Attendance', createAttendanceSchema());
```

### 3. Employee

```typescript
// models/employee.ts
import { Schema, model } from 'mongoose';
import { commonAttendanceFields, applyAttendanceIndexes } from '@classytic/clockin/schemas';
import { employmentFields, employeePlugin } from '@classytic/payroll/schemas';

const employeeSchema = new Schema({
  // Core fields
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Payroll fields
  ...employmentFields,
  
  // Attendance fields
  ...commonAttendanceFields,
  
  // Your custom fields
  bio: String,
  avatar: String,
}, { timestamps: true });

// Apply both plugins
employeeSchema.plugin(employeePlugin);
applyAttendanceIndexes(employeeSchema, { tenantField: 'organizationId' });

export const Employee = model('Employee', employeeSchema);
```

### 4. PayrollRecord

```typescript
// models/payroll-record.ts
import { model } from 'mongoose';
import { payrollRecordSchema } from '@classytic/payroll/schemas';

export const PayrollRecord = model('PayrollRecord', payrollRecordSchema);
```

### 5. Holiday

```typescript
// models/holiday.ts
import { model } from 'mongoose';
import { createHolidaySchema } from '@classytic/payroll';

export const Holiday = model('Holiday', createHolidaySchema());
```

### 6. Transaction

```typescript
// models/transaction.ts
import { Schema, model } from 'mongoose';

const transactionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'bank' },
  status: { type: String, default: 'completed' },
  date: { type: Date, default: Date.now },
  referenceId: Schema.Types.ObjectId,
  referenceModel: String,
  handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

export const Transaction = model('Transaction', transactionSchema);
```

## ⚙️ Initialize

```typescript
// services/hrm.ts
import { ClockIn } from '@classytic/clockin';
import { createPayrollInstance } from '@classytic/payroll';
import { Attendance, Employee, PayrollRecord, Transaction, Holiday } from '../models';

// Initialize attendance
export const clockin = ClockIn.create()
  .withModels({ Attendance, Membership: Employee })
  .build();

// Initialize payroll
export const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel: Employee,
    PayrollRecordModel: PayrollRecord,
    TransactionModel: Transaction,
    AttendanceModel: Attendance,
  })
  .build();
```

## 💼 Complete HRM Service

```typescript
// services/hrm.service.ts
import { clockin, payroll } from './hrm';
import { getAttendance, getHolidays, countWorkingDays } from '@classytic/payroll';
import { Holiday } from '../models';

export class HRMService {
  /**
   * Hire employee
   */
  async hire(params: {
    userId: string;
    organizationId: string;
    position: string;
    department: string;
    baseSalary: number;
  }) {
    return payroll.hire({
      userId: params.userId,
      organizationId: params.organizationId,
      employment: {
        position: params.position,
        department: params.department,
        type: 'full_time',
      },
      compensation: {
        baseAmount: params.baseSalary,
        currency: 'USD',
      },
    });
  }

  /**
   * Process monthly payroll for organization
   */
  async processMonthlyPayroll(organizationId: string, month: number, year: number) {
    // Get period dates
    const period = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    // Get holidays from YOUR database
    const holidays = await getHolidays(Holiday, {
      organizationId,
      startDate: period,
      endDate: periodEnd,
    });

    // Count working days
    const workDays = countWorkingDays(period, periodEnd, {
      workDays: [1, 2, 3, 4, 5],
      holidays,
    });

    // Process all employees
    const result = await payroll.processBulkPayroll({
      organizationId,
      month,
      year,
      options: { holidays },
    });

    return {
      total: result.total,
      successful: result.successful.length,
      failed: result.failed.length,
      totalAmount: result.successful.reduce((sum, r) => sum + r.amount, 0),
    };
  }

  /**
   * Get employee dashboard
   */
  async getEmployeeDashboard(employeeId: string, organizationId: string) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [employee, attendance, payroll] = await Promise.all([
      Employee.findById(employeeId),
      getAttendance(Attendance, {
        organizationId,
        employeeId,
        month: currentMonth,
        year: currentYear,
        expectedDays: 22,
      }),
      PayrollRecord.findOne({
        organizationId,
        employeeId,
        'period.month': currentMonth,
        'period.year': currentYear,
      }),
    ]);

    return {
      employee: {
        name: employee?.userId?.name,
        position: employee?.position,
        department: employee?.department,
        salary: employee?.compensation?.baseAmount,
      },
      attendance: attendance ? {
        expected: attendance.expectedDays,
        actual: attendance.actualDays,
        percentage: (attendance.actualDays / attendance.expectedDays) * 100,
      } : null,
      payroll: payroll ? {
        gross: payroll.breakdown.grossSalary,
        net: payroll.breakdown.netSalary,
        status: payroll.status,
        paidAt: payroll.paidAt,
      } : null,
    };
  }

  /**
   * Add sudden holiday (e.g., emergency closure)
   */
  async addHoliday(organizationId: string, date: Date, name: string) {
    return Holiday.create({
      organizationId,
      date,
      name,
      type: 'company',
      paid: true,
    });
  }
}
```

## 🔥 Production Setup

### Logging

```typescript
import { disableLogging } from '@classytic/payroll/utils';

// Disable in production (or use custom logger)
if (process.env.NODE_ENV === 'production') {
  disableLogging();
}
```

### Transactions

```typescript
import mongoose from 'mongoose';

// Process with transaction
const session = await mongoose.startSession();
await session.startTransaction();

try {
  const result = await payroll.processSalary({
    employeeId,
    month,
    year,
    context: { session },
  });
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### Events

```typescript
// Monitor payroll events
payroll.on('salary:processed', ({ employee, payroll, transactionId }) => {
  console.log(`Salary processed for ${employee.employeeId}`);
  
  // Send email notification
  sendEmail(employee.email, {
    subject: 'Salary Processed',
    amount: payroll.netAmount,
  });
});

payroll.on('payroll:completed', ({ organizationId, summary }) => {
  console.log(`Bulk payroll completed: ${summary.successful}/${summary.total}`);
});
```

## 🌍 Country Configuration

Built-in support for multiple countries:

```typescript
import { COUNTRY_DEFAULTS } from '@classytic/payroll/core';

// Bangladesh (Sun-Thu work week)
COUNTRY_DEFAULTS.BD 
// { currency: 'BDT', workDays: [0,1,2,3,4], taxBrackets: [...] }

// India (Mon-Sat work week)
COUNTRY_DEFAULTS.IN 
// { currency: 'INR', workDays: [1,2,3,4,5,6], taxBrackets: [...] }

// Use in organization settings
await Organization.create({
  name: 'My Company BD',
  settings: {
    currency: 'BDT',
    country: 'BD',
    workDays: [0, 1, 2, 3, 4],
  },
});
```

## 📊 Pure Functions (Previews & Testing)

```typescript
import { 
  calculateSalaryBreakdown, 
  countWorkingDays,
  calculateProration,
  calculateTax,
} from '@classytic/payroll/core';

// Preview salary without saving
const preview = calculateSalaryBreakdown({
  baseSalary: 100000,
  currency: 'USD',
  hireDate: new Date('2024-01-01'),
  periodStart: new Date('2024-03-01'),
  periodEnd: new Date('2024-03-31'),
  allowances: [{ type: 'housing', amount: 20000, taxable: true }],
  attendance: { expectedDays: 22, actualDays: 20 },
});

console.log(preview);
// {
//   baseSalary: 100000,
//   proratedBase: 100000,
//   totalAllowances: 20000,
//   grossSalary: 120000,
//   taxAmount: 2500,
//   attendanceDeduction: 9090,
//   netSalary: 108410,
// }
```

## ⚡ Best Practices

### ✅ Do

- **Use ClockIn for attendance** - it's designed for this
- **Store holidays in Holiday model** - simple, works
- **Use `processBulkPayroll()` for batches** - efficient
- **Use pure functions for previews** - no DB overhead
- **Enable events for notifications** - decouple concerns

### ❌ Don't

- **Don't skip employee plugin** - you'll get runtime errors
- **Don't process without attendance** - deductions won't work
- **Don't ignore transactions** - use them for atomicity

## 📚 Full API Reference

See [docs/HRM_GUIDE.md](./docs/HRM_GUIDE.md) for complete documentation.

## License

MIT

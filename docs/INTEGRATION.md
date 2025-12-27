# Integration Guide

## Attendance Integration (Optional)

The `@classytic/payroll` library can optionally integrate with an Attendance system for automatic payroll deductions based on employee work days.

---

## Integration Contract

### Required Fields in AttendanceModel

If you want to enable attendance-based payroll calculations, your `AttendanceModel` **MUST** have these fields:

```typescript
interface AttendanceRecord {
  // Multi-tenancy
  tenantId: ObjectId;          // Organization ID (required)

  // Polymorphic target reference
  targetModel: string;         // Model name, must include 'Employee'
  targetId: ObjectId;          // Reference to Employee._id

  // Time period (one document per month)
  year: number;                // Year (e.g., 2024)
  month: number;               // Month (1-12)

  // Payroll calculation (MOST IMPORTANT!)
  totalWorkDays: number;       // Total days worked (including half days)
                               // Formula: fullDays + (halfDays × 0.5) + paidLeaveDays
}
```

---

## Setup with @classytic/payroll

### Installation

```bash
npm install @classytic/payroll mongoose
```

### Initialize with Attendance

```typescript
import { createPayrollInstance, createPayrollRecordSchema } from '@classytic/payroll';
import mongoose from 'mongoose';

// Your models
const EmployeeModel = mongoose.model('Employee', employeeSchema);
const PayrollRecordModel = mongoose.model('PayrollRecord', createPayrollRecordSchema());
const TransactionModel = mongoose.model('Transaction', transactionSchema);
const AttendanceModel = mongoose.model('Attendance', attendanceSchema);

// Initialize with attendance integration
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel,  // ✅ Enable integration
  })
  .withConfig({
    payroll: {
      attendanceIntegration: true,
    },
  })
  .build();
```

---

## How It Works

### Automatic Payroll Deductions

When `AttendanceModel` is provided and `attendanceIntegration` is enabled:

1. **Fetches attendance record** for the employee's pay period
2. **Reads `totalWorkDays`** from the attendance document
3. **Calculates absent days**: `expectedWorkingDays - totalWorkDays`
4. **Applies deduction**: `absentDays × dailyRate`

### Example

```typescript
// Employee with monthly salary of 50,000
// Pay period: March 2025 (expected working days: 22)
// Attendance record shows: totalWorkDays = 18.5 (18 full + 1 half day)

// Automatic calculation:
const absentDays = 22 - 18.5;     // 3.5 days
const dailyRate = 50000 / 22;     // ~2,272.73
const deduction = 3.5 * 2272.73;  // ~7,954.55

// Final payroll breakdown:
// Base: 50,000
// Attendance Deduction: -7,954.55
// Net: 42,045.45
```

---

## Custom Attendance System

If you're using your own attendance system, ensure your model includes:

### Minimal Schema

```typescript
import mongoose from 'mongoose';

const customAttendanceSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  targetModel: {
    type: String,
    required: true,
    enum: ['Employee', 'Membership', 'User'],  // Must include 'Employee'
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetModel',
  },
  year: {
    type: Number,
    required: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  totalWorkDays: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },

  // Optional but recommended:
  fullDaysCount: Number,
  halfDaysCount: Number,
  paidLeaveDaysCount: Number,
  overtimeDaysCount: Number,
});

// IMPORTANT: Unique index for efficient queries
customAttendanceSchema.index(
  { tenantId: 1, targetModel: 1, targetId: 1, year: 1, month: 1 },
  { unique: true }
);

export const CustomAttendance = mongoose.model('CustomAttendance', customAttendanceSchema);
```

**Note:** `expectedWorkingDays` comes from payroll's work schedule + holidays. When you pass manual attendance into `processSalary`, ensure `expectedDays` is the working‑days count (not calendar days).

---

## Disabling Attendance Integration

If you don't have an attendance system or don't want automatic deductions:

```typescript
// Option 1: Don't provide AttendanceModel
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    // AttendanceModel not provided
  })
  .build();

// Option 2: Disable via config
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel,
  })
  .withConfig({
    payroll: {
      attendanceIntegration: false,  // Disabled
    },
  })
  .build();
```

**Result:** Payroll will be calculated based on full base salary without attendance deductions.

---

## totalWorkDays Calculation Logic

The `totalWorkDays` field should use this formula:

```
totalWorkDays = fullDays + (halfDays × 0.5) + paidLeaveDays
```

### Examples

| Full Days | Half Days | Paid Leave | Total Work Days |
|-----------|-----------|------------|-----------------|
| 20        | 0         | 0          | 20.0            |
| 18        | 2         | 0          | 19.0            |
| 15        | 4         | 2          | 19.0            |
| 22        | 1         | 1          | 23.5            |

**Note:** Unpaid leave and overtime are **NOT** included in `totalWorkDays`.

---

## Query Pattern

The payroll library queries attendance like this:

```typescript
const attendance = await AttendanceModel.findOne({
  tenantId: organizationId,
  targetId: employeeId,
  targetModel: 'Employee',
  year: 2025,
  month: 3,
});

const workedDays = attendance?.totalWorkDays || 0;
```

**Make sure your indexes support this query pattern!**

---

## Compatibility Checklist

Before enabling attendance integration, verify:

- [ ] Model has `tenantId` field (ObjectId)
- [ ] Model has `targetModel` field (String, includes 'Employee')
- [ ] Model has `targetId` field (ObjectId)
- [ ] Model has `year` field (Number)
- [ ] Model has `month` field (Number, 1-12)
- [ ] Model has `totalWorkDays` field (Number, decimal)
- [ ] Compound index on `(tenantId, targetModel, targetId, year, month)`
- [ ] `totalWorkDays` is calculated correctly before payroll runs

---

## Framework Integration

### Fastify Plugin

```typescript
import fastify from 'fastify';
import { createPayrollInstance } from '@classytic/payroll';

const app = fastify();

app.register(async (instance) => {
  const payroll = createPayrollInstance()
    .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
    .build();

  instance.decorate('payroll', payroll);
});

// Use in routes
app.post('/employees', async (req, reply) => {
  const employee = await app.payroll.hire(req.body);
  return employee;
});
```

### Express Middleware

```typescript
import express from 'express';
import { createPayrollInstance } from '@classytic/payroll';

const app = express();

const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .build();

app.use((req, res, next) => {
  req.payroll = payroll;
  next();
});
```

### NestJS Provider

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Payroll, createPayrollInstance } from '@classytic/payroll';

@Injectable()
export class PayrollProvider implements OnModuleInit {
  private payroll: Payroll;

  constructor(
    @InjectModel('Employee') private employeeModel,
    @InjectModel('PayrollRecord') private payrollRecordModel,
    @InjectModel('Transaction') private transactionModel,
  ) {}

  onModuleInit() {
    this.payroll = createPayrollInstance()
      .withModels({
        EmployeeModel: this.employeeModel,
        PayrollRecordModel: this.payrollRecordModel,
        TransactionModel: this.transactionModel,
      })
      .build();
  }

  getPayroll() {
    return this.payroll;
  }
}
```

---

## Related Documentation

- [README.md](../README.md) - Main documentation
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide
- [NPM_GUIDE.md](../NPM_GUIDE.md) - Publishing workflow

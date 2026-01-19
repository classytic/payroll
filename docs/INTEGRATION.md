# Attendance Integration

Optional integration with attendance systems for payroll deductions.

## Required Attendance Fields

```typescript
interface AttendanceRecord {
  organizationId: ObjectId;
  targetModel: string; // Must include 'Employee'
  targetId: ObjectId; // Employee._id
  year: number;
  month: number;
  totalWorkDays: number; // fullDays + (halfDays × 0.5) + paidLeaveDays
}
```

## Setup

```typescript
import { createPayrollInstance } from '@classytic/payroll';

const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel, // Enable attendance integration
  })
  .withConfig({
    payroll: { attendanceIntegration: true },
  })
  .build();
```

## Usage

### Explicit Attendance (Recommended)

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

### Auto-Fetch (Fallback)

```typescript
// If AttendanceModel is provided and no attendance is passed,
// it will auto-fetch from the database
await payroll.processSalary({
  organizationId,
  employeeId,
  period: { month: 1, year: 2024 },
  // attendance auto-fetched
});
```

## Calculation

```
Pro-rated salary = baseAmount × (actualWorkDays / expectedWorkDays)
```

Example:
- Base salary: $5000/month
- Expected work days: 22
- Actual work days: 20
- Pro-rated salary: $5000 × (20/22) = $4545.45

## Integration with @classytic/clockin

```typescript
import { createAttendanceSchema } from '@classytic/clockin/schemas';

const Attendance = model('Attendance', createAttendanceSchema());

// Use with payroll
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel, Attendance })
  .withConfig({ payroll: { attendanceIntegration: true } })
  .build();
```

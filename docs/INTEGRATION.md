# Attendance Integration

Optional integration with attendance systems for automatic payroll deductions.

## Attendance Record Interface

Your attendance model must include these fields:

```typescript
interface AttendanceRecord {
  organizationId: ObjectId,
  targetModel: string,         // Must include 'Employee'
  targetId: ObjectId,          // Employee._id
  year: number,
  month: number,
  totalWorkDays: number,       // fullDays + (halfDays × 0.5) + paidLeaveDays
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
    AttendanceModel,         // Enable attendance integration
  })
  .withConfig({
    payroll: { attendanceIntegration: true },
  })
  .build();
```

## Usage Options

### Option 1: Explicit Attendance (Recommended)

Fetch attendance separately and pass it to salary processing:

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
  attendance,  // { expectedDays: 22, actualDays: 20 }
});
```

### Option 2: Auto-Fetch (Fallback)

If `AttendanceModel` is provided but no attendance data is passed, the system auto-fetches:

```typescript
await payroll.processSalary({
  organizationId,
  employeeId,
  period: { month: 1, year: 2024 },
  // attendance auto-fetched from AttendanceModel
});
```

### Option 3: Skip Attendance

```typescript
await payroll.processSalary({
  organizationId,
  employeeId,
  period: { month: 1, year: 2024 },
  options: { skipAttendance: true },
});
```

## Deduction Calculation

```
Deduction = (expectedDays - actualDays) × dailyRate
dailyRate = baseSalary / expectedDays
```

**Example:**
- Base salary: $5000/month
- Expected work days: 22
- Actual work days: 20
- Daily rate: $5000 / 22 = $227.27
- Deduction: 2 × $227.27 = $454.54
- Pro-rated salary: $5000 - $454.54 = $4545.46

## Batch Attendance Fetch

For bulk payroll processing:

```typescript
import { batchGetAttendance } from '@classytic/payroll';

const attendanceMap = await batchGetAttendance(AttendanceModel, {
  employeeIds: [emp1Id, emp2Id, emp3Id],
  organizationId,
  year: 2024,
  month: 1,
});

// Returns Map<string, { expectedDays, actualDays }>
```

## Integration with @classytic/clockin

If using the `@classytic/clockin` package:

```typescript
import { createAttendanceSchema } from '@classytic/clockin/schemas';

const AttendanceModel = mongoose.model('Attendance', createAttendanceSchema());

const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
    AttendanceModel,
  })
  .withConfig({
    payroll: { attendanceIntegration: true },
  })
  .build();
```

## Custom Attendance Logic

Use the pure calculator for custom implementations:

```typescript
import { calculateAttendanceDeduction, calculateDailyRate } from '@classytic/payroll/calculators';

const dailyRate = calculateDailyRate(baseSalary, expectedDays);

const result = calculateAttendanceDeduction({
  expectedWorkingDays: 22,
  actualWorkingDays: 20,
  dailyRate,
  maxDeductionPercent: 50,  // Cap at 50% of salary
});

// { hasDeduction: true, deductionAmount: 454.54, absentDays: 2 }
```

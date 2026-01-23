# @classytic/payroll

Enterprise HRM & Payroll for MongoDB. Clean architecture, multi-tenant, type-safe.

[![npm](https://img.shields.io/npm/v/@classytic/payroll)](https://www.npmjs.com/package/@classytic/payroll)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![MIT](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)

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

// Hire employee
await payroll.hire({
  organizationId,
  employment: { email: 'dev@example.com', position: 'Engineer' },
  compensation: { baseSalary: 80000, currency: 'USD' },
});

// Process salary
await payroll.processSalary({
  organizationId,
  employeeId,
  period: { month: 1, year: 2024 },
});
```

## Features

- **Employee Lifecycle**: Hire, update, terminate, re-hire
- **Compensation**: Salary, allowances, deductions
- **Bulk Processing**: Handle 10k+ employees with streaming
- **Multi-tenant**: Automatic organization isolation
- **Events & Webhooks**: React to payroll events
- **Type-safe**: Full TypeScript support

## Exports

| Entry Point | Description |
|-------------|-------------|
| `@classytic/payroll` | Main API (Payroll class, types, errors) |
| `@classytic/payroll/schemas` | Mongoose schemas for extending |
| `@classytic/payroll/utils` | Date, money, validation utilities |
| `@classytic/payroll/calculators` | Pure calculation functions (no DB) |

## Employee Management

```typescript
// Hire
await payroll.hire({ organizationId, employment, compensation });

// Get employee
const employee = await payroll.getEmployee({ employeeId, organizationId });

// Get by flexible identity (userId, employeeId, or email)
const emp = await payroll.getEmployeeByIdentity({
  identity: 'EMP-001',  // or userId or email
  organizationId,
  mode: 'employeeId',   // 'userId' | 'employeeId' | 'email' | 'any'
});

// Update
await payroll.updateEmployment({ employeeId, updates: { position: 'Lead' } });

// Terminate
await payroll.terminate({ employeeId, terminationDate, reason: 'resignation' });

// Re-hire
await payroll.reHire({ employeeId, hireDate: new Date() });
```

## Listing Employees

Employee listing/queries are done at app level using your models directly:

```typescript
// Use your EmployeeModel with mongokit or mongoose directly
const employees = await EmployeeModel.find({
  organizationId,
  'employment.status': 'active'
});

// Or with mongokit repository
const repo = createRepository(EmployeeModel);
const result = await repo.getAll({
  filters: { organizationId, 'employment.status': 'active' },
  page: 1,
  limit: 100,
});
```

## Compensation

```typescript
// Update salary
await payroll.updateSalary({ employeeId, compensation: { baseSalary: 90000 } });

// Add allowance
await payroll.addAllowance({ employeeId, allowance: { type: 'housing', amount: 2000 } });

// Add deduction
await payroll.addDeduction({ employeeId, deduction: { type: 'loan', amount: 500 } });
```

## Bulk Processing

```typescript
await payroll.processBulkPayroll({
  organizationId,
  period: { month: 1, year: 2024 },
  onProgress: ({ current, total }) => console.log(`${current}/${total}`),
});
```

## Leave Management

```typescript
// Request leave
await payroll.requestLeave({
  employeeId,
  organizationId,
  leaveType: 'annual',
  startDate: new Date('2024-01-15'),
  endDate: new Date('2024-01-17'),
});

// Approve
await payroll.approveLeave({ leaveRequestId, approverId });
```

## Void / Reverse / Restore

Payroll corrections with full state tracking:

```typescript
// Void unpaid payroll
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

// Restore voided payroll
await payroll.restorePayroll({
  organizationId,
  payrollRecordId,
  reason: 'Voided in error',
});
```

**State Flow:**
```
PENDING → PROCESSING → PAID → REVERSED
   ↓          ↓
   └──→ VOIDED ←── FAILED
         ↓
       PENDING (restore)
```

## Events

```typescript
payroll.on('employee:hired', (payload) => {
  console.log(`New hire: ${payload.employee.email}`);
});

payroll.on('payroll:processed', (payload) => {
  console.log(`Salary processed: ${payload.payrollRecord.id}`);
});
```

## Webhooks

```typescript
await payroll.registerWebhook({
  organizationId,
  url: 'https://api.example.com/webhooks',
  events: ['payroll:processed'],
  secret: 'your-secret',
});
```

## Tenant Modes

### Single-Tenant (Recommended for most apps)

For apps serving one organization:

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({ organizationId: YOUR_ORG_ID, autoInject: true })
  .build();

// No organizationId needed - auto-injected
await payroll.hire({
  employment: { email: 'dev@example.com', position: 'Engineer' },
  compensation: { baseSalary: 80000, currency: 'USD' },
});

await payroll.processSalary({
  employeeId,
  period: { month: 1, year: 2024 },
});

await payroll.getEmployee({ employeeId });
await payroll.updateEmployment({ employeeId, updates: { position: 'Lead' } });
await payroll.terminate({ employeeId, terminationDate, reason: 'resignation' });
```

### Multi-Tenant

For SaaS apps serving multiple organizations:

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .build();

// organizationId required on all operations
await payroll.hire({ organizationId, employment, compensation });
await payroll.processSalary({ organizationId, employeeId, period });
await payroll.getEmployee({ organizationId, employeeId });
```

## Pure Calculators

No database required - works in browser/serverless:

```typescript
import {
  calculateSalaryBreakdown,
  calculateProRating,
  calculateAttendanceDeduction
} from '@classytic/payroll/calculators';

// Calculate salary breakdown
const breakdown = calculateSalaryBreakdown({
  baseSalary: 5000,
  allowances: [{ type: 'housing', amount: 500 }],
  deductions: [{ type: 'tax', percentage: 10 }],
});

// Pro-rate for mid-month joins
const proRated = calculateProRating({
  amount: 5000,
  startDate: new Date('2024-01-15'),
  endDate: new Date('2024-01-31'),
  totalDays: 31,
});
```

## Shift Compliance

Late penalties, overtime bonuses, night differentials:

```typescript
import {
  calculateShiftCompliance,
  DEFAULT_ATTENDANCE_POLICY
} from '@classytic/payroll';

const result = calculateShiftCompliance({
  policy: DEFAULT_ATTENDANCE_POLICY,
  baseSalary: 5000,
  shiftData: {
    lateArrivals: [{ minutes: 15 }],
    overtime: [{ hours: 2, type: 'weekday' }],
  },
});

console.log(result.penalties);  // Late penalties
console.log(result.bonuses);    // Overtime bonuses
console.log(result.netAdjustment);
```

## Configuration

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .withConfig({
    currency: 'USD',
    payroll: {
      attendanceIntegration: true,
      autoCreateTransaction: true,
    },
    leave: {
      enabled: true,
      defaultBalances: { annual: 20, sick: 10 },
    },
  })
  .build();
```

## Timeline Audit

Integrate with `@classytic/mongoose-timeline-audit` for WHO/WHAT/WHEN tracking:

```typescript
import timelineAuditPlugin from '@classytic/mongoose-timeline-audit';
import { EMPLOYEE_TIMELINE_CONFIG, PAYROLL_EVENTS } from '@classytic/payroll';

employeeSchema.plugin(timelineAuditPlugin, EMPLOYEE_TIMELINE_CONFIG);

payroll.on('employee:hired', async ({ data }) => {
  const employee = await Employee.findById(data.employee.id);
  employee.addTimelineEvent(
    PAYROLL_EVENTS.EMPLOYEE.HIRED,
    `Hired as ${data.employee.position}`,
    request
  );
  await employee.save();
});
```

## TypeScript

```typescript
import type {
  EmployeeDocument,
  PayrollRecordDocument,
  LeaveRequestDocument,
  Compensation,
  PayrollBreakdown,
} from '@classytic/payroll';
```

## Security

- **Multi-tenant isolation**: All queries scoped by `organizationId`
- **Repository plugin**: Auto-injects tenant filter on all operations
- **Secure lookups**: `findEmployeeSecure()` enforces org boundaries
- **State machines**: Prevent invalid status transitions

## License

MIT

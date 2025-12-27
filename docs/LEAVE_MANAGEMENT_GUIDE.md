# Leave Management - Quick Reference Guide

## 🚀 Quick Start

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
  ...leaveBalanceFields,
});
employeeSchema.plugin(employeePlugin, { enableLeave: true });
const Employee = mongoose.model('Employee', employeeSchema);

// 2. Setup LeaveRequest model
const LeaveRequest = getLeaveRequestModel();

// 3. Create leave service
const leaveService = createLeaveService({
  EmployeeModel: Employee,
  LeaveRequestModel: LeaveRequest,
  config: {
    enforceBalance: true,
    checkOverlap: true,
  },
});
```

## 📋 Common Use Cases

### 1. Request Leave
```typescript
const { request, days } = await leaveService.requestLeave({
  organizationId: org._id,
  employeeId: employee._id,
  userId: user._id,
  request: {
    type: 'annual',
    startDate: new Date('2024-06-03'),
    endDate: new Date('2024-06-07'),
    reason: 'Summer vacation',
  },
  holidays: [new Date('2024-06-04')],
});
// Auto-calculates: days = 4 (excluded weekend + holiday)
// Auto-updates: employee.leaveBalances[0].pending += 4
```

### 2. Approve/Reject
```typescript
// Approve (pending → used)
await leaveService.reviewLeave({
  requestId: request._id,
  reviewerId: manager._id,
  action: 'approve',
  notes: 'Enjoy!',
});

// Reject (remove from pending)
await leaveService.reviewLeave({
  requestId: request._id,
  reviewerId: manager._id,
  action: 'reject',
  notes: 'Peak season',
});
```

### 3. Calculate Unpaid Leave Deduction
```typescript
const { totalDays, deduction } = await leaveService.calculateUnpaidDeduction({
  organizationId: org._id,
  employeeId: employee._id,
  startDate: new Date('2024-06-01'),
  endDate: new Date('2024-06-30'),
  baseSalary: 100000,
  workingDaysInMonth: 22,
});
// → deduction = (100000 / 22) * totalDays
```

## 🔧 Configuration

### Multi-Tenant (Default)
```typescript
const leaveService = createLeaveService({
  EmployeeModel,
  LeaveRequestModel,
  config: {
    enforceBalance: true,    // Validate balance (default: true)
    checkOverlap: true,      // Check conflicts (default: true)
    workingDaysOptions: {
      workDays: [1, 2, 3, 4, 5],  // Mon-Fri
      holidays: [new Date('2024-12-25')],
    },
  },
});
```

### Single-Tenant
```typescript
const leaveService = createLeaveService({
  EmployeeModel,
  LeaveRequestModel,
  config: {
    singleTenant: true,  // organizationId becomes optional
    defaultOrganizationId: myOrg._id,  // Optional default
  },
});

// No organizationId needed
await leaveService.requestLeave({
  employeeId: employee._id,
  userId: user._id,
  request: { type: 'annual', startDate, endDate },
});
```

## 📊 Leave Types

| Type | Default | Description |
|------|---------|-------------|
| `annual` | 20 days | Paid vacation |
| `sick` | 10 days | Paid sick leave |
| `unpaid` | Unlimited | Unpaid (payroll deduction) |
| `maternity` | 90 days | Maternity leave |
| `paternity` | 10 days | Paternity leave |
| `bereavement` | 5 days | Bereavement leave |
| `compensatory` | - | Comp time |
| `other` | - | Custom |

## 🔍 Querying

```typescript
// Pending requests
await LeaveRequest.findPendingByOrganization(org._id);

// Employee history
await LeaveRequest.findByEmployee(employee._id, {
  status: 'approved',
  year: 2024,
});

// Period (for reports)
await LeaveRequest.findByPeriod(
  org._id,
  new Date('2024-06-01'),
  new Date('2024-06-30'),
  { type: 'unpaid' }
);

// Statistics
await LeaveRequest.getLeaveStats(employee._id, 2024);
```

## 🛠️ Utility Functions

```typescript
import {
  hasLeaveBalance,
  getAvailableDays,
  getLeaveSummary,
  calculateLeaveDays,
  initializeLeaveBalances,
  calculateCarryOver,
} from '@classytic/payroll';

// Check balance
hasLeaveBalance(employee, 'annual', 5, 2024); // → true/false

// Get available days
getAvailableDays(employee, 'annual', 2024); // → 15

// Full summary
const summary = getLeaveSummary(employee, 2024);

// Calculate working days
calculateLeaveDays(startDate, endDate, { holidays });

// Year-end carry over
const newBalances = calculateCarryOver(employee.leaveBalances, {
  annual: 5,  // Max carry-over
});
```

## 🔐 Transactions

```typescript
const session = await mongoose.startSession();
session.startTransaction();

try {
  await leaveService.requestLeave({
    organizationId: org._id,
    employeeId: employee._id,
    userId: user._id,
    request: { type: 'annual', startDate, endDate },
    session,  // ← All operations atomic
  });

  await OtherModel.create({ ... }, { session });
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

## ⚠️ Important Notes

1. **Balance State Machine**: `pending → used → restored`
   - Request: adds to `pending`
   - Approve: `pending → used`
   - Reject: removes from `pending`
   - Cancel: restores from `used`

2. **Working Days Calculation**:
   - Excludes weekends by default (Sat/Sun)
   - Excludes holidays when provided
   - Supports custom work weeks

3. **Organization Validation**:
   - Multi-tenant: `organizationId` required, validates employee match
   - Single-tenant: `organizationId` optional, validates if both exist

4. **Unpaid Leave**:
   - Doesn't require balance allocation
   - Calculated for payroll deductions
   - Use `calculateUnpaidDeduction()` for salary processing

## 📚 TypeScript Types

All types are fully exported:

```typescript
import type {
  LeaveServiceConfig,
  RequestLeaveParams,
  ReviewLeaveParams,
  CancelLeaveParams,
  LeaveForPayrollParams,
  LeaveRequestResult,
  ReviewResult,
  OverlapCheckResult,
  LeaveType,
  LeaveRequestStatus,
  LeaveBalance,
} from '@classytic/payroll';
```

## 🧪 Testing

**165 tests** covering:
- ✅ Leave balance calculations
- ✅ Request/approve/reject/cancel workflows
- ✅ Overlap detection
- ✅ Working days calculation
- ✅ Payroll integration
- ✅ Single-tenant mode
- ✅ Multi-tenant validation
- ✅ Transaction support
- ✅ Year-end carry over
- ✅ Pro-rated allocations

---

**Production-Ready** ✅ | **Fully Tested** ✅ | **TypeScript** ✅ | **MIT License** ✅

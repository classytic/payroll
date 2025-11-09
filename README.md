# 🎯 HRM Library - Human Resource Management

Modern, flexible, production-ready HRM system following Stripe/Passport.js architecture patterns.

## 🌟 Key Features

### Multi-Tenant Support
- Same user can be employee in multiple organizations
- Complete data isolation per tenant
- Re-hiring support with full employment history

### Smart Payroll
- **Pro-rated calculations** (mid-month hires)
- **Attendance integration** (unpaid leave auto-deduction)
- **Automatic deductions** (loans, advances, tax)
- **Bulk payroll processing**
- **Transaction integration** (seamless with existing system)

### Data Retention
- **Auto-deletion**: PayrollRecords expire after 2 years (MongoDB TTL)
- **Export before deletion**: Required export for compliance
- **Configurable retention**: Adjust via `HRM_CONFIG`

### Flexible Architecture
- **Reusable schemas**: Merge with your custom fields
- **Plugin system**: Adds methods, virtuals, indexes
- **Clean DSL**: `hrm.hire()`, `hrm.processSalary()`, `hrm.terminate()`
- **Dependency injection**: Models injected at bootstrap

## 📁 Structure

```
lib/hrm/
├── index.js                    # Public exports
├── init.js                     # Bootstrap initialization
├── hrm.orchestrator.js         # Clean API (Stripe-like)
├── enums.js                    # Single source of truth
├── config.js                   # Configurable settings
│
├── models/
│   └── payroll-record.model.js # Universal payroll ledger
│
├── schemas/
│   └── employment.schema.js    # Reusable mongoose schemas
│
├── plugins/
│   └── employee.plugin.js      # Mongoose plugin (methods/virtuals)
│
├── core/                       # Domain business logic
│   ├── employment.manager.js   # Hire/terminate operations
│   ├── compensation.manager.js # Salary/allowance operations
│   └── payroll.manager.js      # Payroll processing
│
├── factories/                  # Clean object creation
│   ├── employee.factory.js     # Employee creation with defaults
│   ├── payroll.factory.js      # Payroll generation
│   └── compensation.factory.js # Compensation breakdown
│
├── services/                   # High-level operations
│   ├── employee.service.js     # Employee CRUD + queries
│   ├── payroll.service.js      # Batch payroll processing
│   └── compensation.service.js # Compensation calculations
│
└── utils/                      # Pure, reusable functions
    ├── date.utils.js           # Date calculations
    ├── calculation.utils.js    # Salary calculations
    ├── validation.utils.js     # Validators
    └── query-builders.js       # Fluent query API
```

## 🚀 Quick Start

### 1. Create Your Employee Model

```javascript
// modules/employee/employee.model.js
import mongoose from 'mongoose';
import { employmentFields, employeePlugin } from '#lib/hrm/index.js';

const employeeSchema = new mongoose.Schema({
  // Core HRM fields (required)
  ...employmentFields,

  // Your custom fields
  certifications: [{ name: String, issuedDate: Date }],
  specializations: [String],
  emergencyContact: { name: String, phone: String },
  // ... any other fields you need
});

// Apply HRM plugin (adds methods, virtuals, indexes)
employeeSchema.plugin(employeePlugin);

export default mongoose.model('Employee', employeeSchema);
```

### 2. Bootstrap Integration

```javascript
// bootstrap/hrm.js
import { initializeHRM } from '#lib/hrm/index.js';
import Employee from '../modules/employee/employee.model.js';
import PayrollRecord from '#lib/hrm/models/payroll-record.model.js';
import Transaction from '../modules/transaction/transaction.model.js';
import Attendance from '#lib/attendance/models/attendance.model.js';

export async function loadHRM() {
  initializeHRM({
    EmployeeModel: Employee,
    PayrollRecordModel: PayrollRecord,
    TransactionModel: Transaction,
    AttendanceModel: Attendance, // Optional
  });
}
```

### 3. Use the HRM API

```javascript
import { hrm } from '#lib/hrm/index.js';

// Hire employee
const employee = await hrm.hire({
  organizationId,
  userId,
  employment: {
    employeeId: 'EMP-001',
    type: 'full_time',
    department: 'training',
    position: 'Senior Trainer',
    hireDate: new Date(),
  },
  compensation: {
    baseAmount: 50000,
    frequency: 'monthly',
    allowances: [
      { type: 'housing', amount: 10000 },
      { type: 'transport', amount: 5000 }
    ]
  },
  bankDetails: {
    accountName: 'John Doe',
    accountNumber: '1234567890',
    bankName: 'Example Bank'
  },
  context: { userId: hrManagerId }
});

// Process salary (creates Transaction automatically)
const result = await hrm.processSalary({
  employeeId: employee._id,
  month: 11,
  year: 2025,
  paymentDate: new Date(),
  paymentMethod: 'bank',
  context: { userId: hrManagerId }
});

// Bulk payroll (all active employees)
const results = await hrm.processBulkPayroll({
  organizationId,
  month: 11,
  year: 2025,
  context: { userId: hrManagerId }
});
```


## 🎨 Complete API Reference

### Employment Lifecycle

```javascript
// Hire
await hrm.hire({ organizationId, userId, employment, compensation, bankDetails, context });

// Update employment details
await hrm.updateEmployment({ employeeId, updates: { department: 'management' }, context });

// Terminate
await hrm.terminate({ employeeId, terminationDate, reason: 'resignation', notes, context });

// Re-hire (same employee, new stint)
await hrm.reHire({ employeeId, hireDate, position, compensation, context });

// List employees
await hrm.listEmployees({
  organizationId,
  filters: { status: 'active', department: 'training', minSalary: 40000 },
  pagination: { page: 1, limit: 20 }
});

// Get single employee
await hrm.getEmployee({ employeeId, populateUser: true });
```

### Compensation Management

```javascript
// Update salary
await hrm.updateSalary({
  employeeId,
  compensation: { baseAmount: 60000 },
  effectiveFrom: new Date(),
  context
});

// Add allowance
await hrm.addAllowance({
  employeeId,
  type: 'meal',
  amount: 3000,
  taxable: true,
  recurring: true,
  context
});

// Remove allowance
await hrm.removeAllowance({ employeeId, type: 'meal', context });

// Add deduction
await hrm.addDeduction({
  employeeId,
  type: 'loan',
  amount: 5000,
  auto: true, // Auto-deduct from salary
  description: 'Personal loan repayment',
  context
});

// Remove deduction
await hrm.removeDeduction({ employeeId, type: 'loan', context });

// Update bank details
await hrm.updateBankDetails({
  employeeId,
  bankDetails: { accountNumber: '9876543210', bankName: 'New Bank' },
  context
});
```

### Payroll Processing

```javascript
// Process single salary
await hrm.processSalary({
  employeeId,
  month: 11,
  year: 2025,
  paymentDate: new Date(),
  paymentMethod: 'bank',
  context
});

// Bulk payroll
await hrm.processBulkPayroll({
  organizationId,
  month: 11,
  year: 2025,
  employeeIds: [], // Empty = all active employees
  paymentDate: new Date(),
  paymentMethod: 'bank',
  context
});

// Payroll history
await hrm.payrollHistory({
  employeeId,
  organizationId,
  month: 11,
  year: 2025,
  status: 'paid',
  pagination: { page: 1, limit: 20 }
});

// Payroll summary
await hrm.payrollSummary({
  organizationId,
  month: 11,
  year: 2025
});

// Export payroll data (before auto-deletion)
const records = await hrm.exportPayroll({
  organizationId,
  startDate: new Date('2023-01-01'),
  endDate: new Date('2023-12-31'),
  format: 'json'
});
```

## 📊 Data Models

### Employee (Your Model + HRM Fields)

```javascript
{
  // Identity & tenant
  userId: ObjectId,              // Links to User
  organizationId: ObjectId,      // Multi-tenant isolation
  employeeId: "EMP-001",         // Custom ID (unique per org)

  // Employment
  employmentType: "full_time",   // full_time, part_time, contract, intern
  status: "active",              // active, on_leave, suspended, terminated
  department: "training",
  position: "Senior Trainer",

  // Dates
  hireDate: Date,
  terminationDate: Date,
  probationEndDate: Date,

  // Employment history (re-hiring support)
  employmentHistory: [{
    hireDate: Date,
    terminationDate: Date,
    reason: String,
    finalSalary: Number
  }],

  // Compensation
  compensation: {
    baseAmount: 50000,
    frequency: "monthly",
    currency: "BDT",

    allowances: [
      { type: "housing", amount: 10000, taxable: true },
      { type: "transport", amount: 5000, taxable: false }
    ],

    deductions: [
      { type: "loan", amount: 2000, auto: true }
    ],

    grossSalary: 65000,    // Auto-calculated
    netSalary: 63000,      // Auto-calculated
  },

  // Bank details
  bankDetails: {
    accountName: String,
    accountNumber: String,
    bankName: String
  },

  // Payroll stats (pre-calculated)
  payrollStats: {
    totalPaid: 500000,
    lastPaymentDate: Date,
    nextPaymentDate: Date,
    paymentsThisYear: 10,
    averageMonthly: 50000
  },

  // YOUR CUSTOM FIELDS
  certifications: [...],
  specializations: [...],
  emergencyContact: {...}
}
```

### PayrollRecord (Universal Ledger)

```javascript
{
  organizationId: ObjectId,
  employeeId: ObjectId,
  userId: ObjectId,

  period: {
    month: 11,
    year: 2025,
    startDate: Date,
    endDate: Date,
    payDate: Date
  },

  breakdown: {
    baseAmount: 50000,
    allowances: [...],
    deductions: [...],
    grossSalary: 65000,
    netSalary: 63000,

    // Smart calculations
    workingDays: 30,
    actualDays: 25,           // If joined mid-month
    proRatedAmount: 41667,    // Pro-rated salary
    attendanceDeduction: 0,   // From attendance integration
    overtimeAmount: 0,
    bonusAmount: 0
  },

  transactionId: ObjectId,    // Links to Transaction
  status: "paid",
  paidAt: Date,

  // Export tracking
  exported: false,            // Must export before TTL deletion
  exportedAt: Date
}
```

## ⚙️ Configuration

```javascript
// lib/hrm/config.js
export const HRM_CONFIG = {
  dataRetention: {
    payrollRecordsTTL: 63072000,      // 2 years in seconds
    exportWarningDays: 30,            // Warn before deletion
    archiveBeforeDeletion: true,
  },

  payroll: {
    defaultCurrency: 'BDT',
    allowProRating: true,             // Mid-month hire calculations
    attendanceIntegration: true,      // Unpaid leave deductions
    autoDeductions: true,             // Auto-deduct loans/advances
  },

  employment: {
    defaultProbationMonths: 3,
    allowReHiring: true,              // Re-hire terminated employees
    trackEmploymentHistory: true,
  },

  validation: {
    requireBankDetails: false,
    allowMultiTenantEmployees: true,  // Same user in multiple orgs
  },
};
```

## 🔑 Key Concepts

### Multi-Tenant Architecture

Same user can work at multiple gyms:
```javascript
// User "john@example.com" (userId: 123)
// Works at Gym A
{ userId: 123, organizationId: "gymA", employeeId: "EMP-001", status: "active" }

// Also works at Gym B
{ userId: 123, organizationId: "gymB", employeeId: "STAFF-05", status: "active" }
```

Indexes ensure uniqueness:
- `{ userId: 1, organizationId: 1 }` unique
- `{ organizationId: 1, employeeId: 1 }` unique

### Re-Hiring Flow

```javascript
// Employee leaves
await hrm.terminate({
  employeeId,
  reason: 'resignation',
  terminationDate: new Date()
});
// status: 'terminated', data preserved

// Employee comes back
await hrm.reHire({
  employeeId,
  hireDate: new Date(),
  position: 'Manager', // Optional: new position
  compensation: { baseAmount: 60000 } // Optional: new salary
});
// status: 'active', previous stint added to employmentHistory[]
```

### Smart Payroll Calculations

**Pro-Rating (Mid-Month Hire)**:
```javascript
// Employee hired on Nov 15
// Working days: 15 out of 30
// Base salary: 60,000
// Pro-rated: 60,000 × (15/30) = 30,000
```

**Attendance Integration**:
```javascript
// Monthly salary: 60,000
// Working days: 30
// Attended days: 25
// Absent days: 5
// Daily rate: 60,000 / 30 = 2,000
// Deduction: 5 × 2,000 = 10,000
// Final: 60,000 - 10,000 = 50,000
```

**Auto Deductions**:
```javascript
compensation: {
  baseAmount: 60000,
  allowances: [{ type: 'housing', amount: 10000 }],
  deductions: [
    { type: 'loan', amount: 5000, auto: true },  // Auto-deduct
    { type: 'tax', amount: 3000, auto: true }
  ],
  grossSalary: 70000,
  netSalary: 62000  // 70000 - 5000 - 3000
}
```

### Transaction Integration

Every salary payment creates a Transaction:
```javascript
{
  organizationId,
  type: 'expense',
  category: 'salary',
  amount: 63000,
  method: 'bank',
  status: 'completed',
  referenceId: employeeId,
  referenceModel: 'Employee',
  metadata: {
    employeeId: 'EMP-001',
    payrollRecordId: ObjectId(...),
    period: { month: 11, year: 2025 },
    breakdown: { ... }
  }
}
```

### Data Retention & Export

PayrollRecords auto-delete after 2 years:
```javascript
// TTL index on PayrollRecord
payrollRecordSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 63072000,  // 2 years
    partialFilterExpression: { exported: true }  // Only if exported
  }
);

// Export before deletion
const records = await hrm.exportPayroll({
  organizationId,
  startDate: new Date('2023-01-01'),
  endDate: new Date('2023-12-31')
});
// Marks records as exported, making them eligible for deletion
```

## 🎯 Design Philosophy

- **Stripe/Passport.js inspired**: Clean DSL, dependency injection, reusable components
- **Lightweight**: Not a complex ERP, gym-focused features only
- **Multi-tenant**: Same user can work at multiple organizations
- **Smart defaults**: Pro-rating, attendance integration, automatic calculations
- **Production-ready**: Transaction integration, data retention, comprehensive error handling

## ✅ Next Steps

1. Test bootstrap initialization
2. Create Fastify routes in `modules/employee/`
3. Add API handlers
4. Migrate existing staff from organization module
5. Deploy and monitor

---

**Built with ❤️ following world-class architecture patterns**
**Ready for multi-tenant gym management**

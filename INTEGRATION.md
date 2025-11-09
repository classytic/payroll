# 🔗 HRM Library Integration Guide

## Attendance Integration (Optional)

The HRM library can optionally integrate with an Attendance system for automatic payroll deductions based on employee work days.

---

## 📋 **Integration Contract**

### **Required Fields in AttendanceModel**

If you want to enable attendance-based payroll calculations, your `AttendanceModel` **MUST** have these fields:

```javascript
{
  // Multi-tenancy
  tenantId: ObjectId,          // Organization ID (required)

  // Polymorphic target reference
  targetModel: String,         // Model name, must include 'Employee'
  targetId: ObjectId,          // Reference to Employee._id

  // Time period (one document per month)
  year: Number,                // Year (e.g., 2024)
  month: Number,               // Month (1-12)

  // Payroll calculation (MOST IMPORTANT!)
  totalWorkDays: Number,       // Total days worked (including half days)
                               // Formula: fullDays + (halfDays * 0.5) + paidLeaveDays
}
```

---

## ✅ **Using @classytic/payroll (Recommended)**

The `@classytic/payroll` library is **already compatible** and provides all required fields:

### **Installation**

```bash
npm install @classytic/payroll
```

### **Setup**

```javascript
// bootstrap/hrm.js
import { initializeHRM } from '@fitverse/hrm';
import { initializeAttendance } from '@classytic/payroll';
import Employee from './models/Employee.js';
import PayrollRecord from '@fitverse/hrm/models/payroll-record.model.js';
import Transaction from './models/Transaction.js';
import AttendanceModel from '@classytic/payroll/models/attendance.model.js';

// 1. Initialize Attendance library
initializeAttendance({ AttendanceModel });

// 2. Initialize HRM with attendance integration
initializeHRM({
  EmployeeModel: Employee,
  PayrollRecordModel: PayrollRecord,
  TransactionModel: Transaction,
  AttendanceModel: AttendanceModel  // ✅ Enable integration
});
```

---

## 🎯 **How It Works**

### **Automatic Payroll Deductions**

When `AttendanceModel` is provided, payroll processing **automatically**:

1. **Fetches attendance record** for the employee's pay period
2. **Reads `totalWorkDays`** from the attendance document
3. **Calculates absent days**: `totalDays - totalWorkDays`
4. **Applies deduction**: `absentDays × dailyRate`

### **Example**

```javascript
// Employee with monthly salary of 50,000
// Pay period: March 2024 (31 days)
// Attendance record shows: totalWorkDays = 28.5 (28 full days + 1 half day)

// Automatic calculation:
const absentDays = 31 - 28.5; // 2.5 days
const dailyRate = 50000 / 31; // ~1,612.90
const deduction = 2.5 × 1612.90; // ~4,032.25

// Final payroll: 50,000 - 4,032.25 = 45,967.75
```

---

## 🔧 **Custom Attendance System**

If you're using your **own attendance system**, ensure your model includes:

### **Minimal Schema**

```javascript
import mongoose from 'mongoose';

const customAttendanceSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  targetModel: {
    type: String,
    required: true,
    enum: ['Employee', 'Membership', 'User']  // Must include 'Employee'
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetModel'
  },
  year: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  totalWorkDays: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },

  // Optional but recommended:
  fullDaysCount: Number,
  halfDaysCount: Number,
  paidLeaveDaysCount: Number,
  overtimeDaysCount: Number,
});

// IMPORTANT: Unique index for efficient queries
customAttendanceSchema.index(
  { tenantId: 1, targetId: 1, year: 1, month: 1 },
  { unique: true }
);

export const CustomAttendance = mongoose.model('CustomAttendance', customAttendanceSchema);
```

---

## 🚫 **Disabling Attendance Integration**

If you don't have an attendance system or don't want automatic deductions:

```javascript
// Simply omit AttendanceModel
initializeHRM({
  EmployeeModel: Employee,
  PayrollRecordModel: PayrollRecord,
  TransactionModel: Transaction,
  // AttendanceModel: undefined  ← Not provided
});

// OR set config flag
import { HRM_CONFIG } from '@fitverse/hrm';

HRM_CONFIG.payroll.attendanceIntegration = false;
```

**Result:** Payroll will be calculated based on full base salary without attendance deductions.

---

## 📚 **totalWorkDays Calculation Logic**

The `totalWorkDays` field should use this formula:

```javascript
totalWorkDays = fullDays + (halfDays × 0.5) + paidLeaveDays
```

### **Examples**

| Full Days | Half Days | Paid Leave | Total Work Days |
|-----------|-----------|------------|-----------------|
| 20        | 0         | 0          | 20.0            |
| 18        | 2         | 0          | 19.0            |
| 15        | 4         | 2          | 19.0            |
| 22        | 1         | 1          | 23.5            |

**Note:** Unpaid leave and overtime are **NOT** included in `totalWorkDays` (overtime is counted separately).

---

## 🔍 **Query Example**

HRM library queries attendance like this:

```javascript
const attendance = await AttendanceModel.findOne({
  tenantId: organizationId,
  targetId: employeeId,
  targetModel: 'Employee',
  year: 2024,
  month: 3
});

const workedDays = attendance?.totalWorkDays || 0;
```

**Make sure your indexes support this query pattern!**

---

## ✅ **Compatibility Checklist**

Before enabling attendance integration, verify:

- [ ] Model has `tenantId` field (ObjectId)
- [ ] Model has `targetModel` field (String, includes 'Employee')
- [ ] Model has `targetId` field (ObjectId)
- [ ] Model has `year` field (Number)
- [ ] Model has `month` field (Number, 1-12)
- [ ] Model has `totalWorkDays` field (Number, decimal)
- [ ] Compound index on `(tenantId, targetId, year, month)`
- [ ] `totalWorkDays` is calculated correctly before payroll runs

---

## 🚀 **Best Practice**

Use **@classytic/payroll** library for:
- ✅ Pre-built attendance tracking
- ✅ Automatic `totalWorkDays` calculation
- ✅ Check-in/check-out management
- ✅ Work types (full day, half day, paid leave, etc.)
- ✅ Analytics and reporting
- ✅ Multi-tenant support
- ✅ **Zero integration work** - just plug and play!

---

## 📖 **Related Documentation**

- [@classytic/payroll README](../attendance/README.md)
- [Attendance Model Schema](../attendance/models/attendance.model.js)
- [Payroll Calculation Logic](./core/payroll.manager.js)
- [HRM Configuration](./config.js)

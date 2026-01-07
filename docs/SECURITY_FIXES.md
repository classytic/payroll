# Security & Architecture Fixes - Implementation Guide

## Overview

This document outlines the comprehensive security and architecture improvements for @classytic/payroll v2.3.0.

## Critical Security Issue: Multi-Tenant Isolation

### Current Problem

Many employee mutation operations use `findById(_id)` without `organizationId` check, allowing cross-tenant data access if an attacker has the ObjectId.

**Vulnerable Operations:**
- `processSalary()` - line 1042
- `terminateEmployee()` - line 740
- `updateEmployment()` - line 394
- Several employee.service.ts methods

### Solution

1. **Always include organizationId in queries**
2. **Never use findById() alone - always add org filter**
3. **Support dual lookup**: string employeeId OR ObjectId _id
4. **Clear error messages** when org not provided

## Implementation Strategy

### 1. Secure Lookup Helper (DONE ✅)

Created `src/utils/employee-lookup.ts` with:
- `findEmployeeSecure()` - Always enforces org isolation
- `employeeExistsSecure()` - Check existence with org check
- `findEmployeesSecure()` - Bulk queries with org filter
- `requireOrganizationId()` - Validation helper

### 2. Parameter Updates (IN PROGRESS)

**Add organizationId to all mutation params:**

```typescript
// Before (INSECURE)
export interface ProcessSalaryParams {
  employeeId: ObjectIdLike;
  month: number;
  year: number;
  context?: OperationContext;  // org hidden in context
}

// After (SECURE)
export interface ProcessSalaryParams {
  employeeId: ObjectIdLike;  // Can be _id (ObjectId) or employeeId (string)
  organizationId: ObjectIdLike;  // REQUIRED for multi-tenant safety
  month: number;
  year: number;
  context?: OperationContext;
}
```

**Backward Compatibility:**
- Support `context.organizationId` as fallback
- In single-tenant mode with autoInject, it's optional
- Throw clear error if missing in multi-tenant mode

### 3. Update All Mutation Operations

**Operations to Fix:**

| Method | File | Line | Current Issue |
|--------|------|------|---------------|
| `processSalary` | payroll.ts | 1042 | Uses findById without org |
| `terminateEmployee` | payroll.ts | 740 | Uses findById without org |
| `updateEmployment` | payroll.ts | 394 | Uses findById without org |
| `reHireEmployee` | payroll.ts | ~850 | Uses findById without org |
| `updateSalary` | payroll.ts | ~450 | Uses findById without org |
| `addAllowance` | payroll.ts | ~500 | Uses findById without org |
| `removeAllowance` | payroll.ts | ~550 | Uses findById without org |
| `addDeduction` | payroll.ts | ~600 | Uses findById without org |
| `removeDeduction` | payroll.ts | ~650 | Uses findById without org |
| `updateBankDetails` | payroll.ts | ~700 | Uses findById without org |

**Fix Pattern:**

```typescript
// Before (INSECURE)
const employee = await this.models.EmployeeModel.findById(toObjectId(employeeId));

// After (SECURE)
const employee = await findEmployeeSecure(this.models.EmployeeModel, {
  _id: employeeId,  // Supports both ObjectId and string employeeId
  organizationId: organizationId || context?.organizationId,
  session: context?.session,
  populate: 'userId'
});
```

### 4. Guest Employee Fix

**Current Problem:** Uses `collection.insertOne()` which bypasses:
- Mongoose validation
- Schema defaults
- Plugin hooks
- Middleware

**Solution:** Use `Model.create()` with proper optional field handling

```typescript
// Before (BYPASSES MONGOOSE)
await this.models.EmployeeModel.collection.insertOne(employeeData);

// After (USES MONGOOSE PROPERLY)
const employee = await this.models.EmployeeModel.create({
  ...employeeData,
  userId: undefined  // Explicitly undefined, schema handles it
}, {
  session,
  // Mongoose will run all validators, defaults, and hooks
});
```

### 5. Single-Tenant Mode

**How It Works:**

1. **Configuration:**
```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({
    organizationId: org._id,
    autoInject: true  // Auto-inject org ID into all operations
  })
  .build();
```

2. **Auto-Injection:**
- Container intercepts all operations
- Automatically adds organizationId if missing
- User doesn't need to pass it explicitly

3. **Usage:**
```typescript
// Multi-tenant (explicit org required)
await payroll.processSalary({
  employeeId: emp._id,
  organizationId: org._id,  // REQUIRED
  month: 3,
  year: 2024
});

// Single-tenant (auto-injected)
await payroll.processSalary({
  employeeId: emp._id,
  // organizationId auto-injected from config
  month: 3,
  year: 2024
});
```

### 6. API Design: String vs ObjectId

**Support Both:**

```typescript
// By ObjectId _id
await payroll.processSalary({
  employeeId: employee._id,  // ObjectId
  organizationId: org._id,
  month: 3,
  year: 2024
});

// By string employeeId
await payroll.processSalary({
  employeeId: "EMP-001",  // String
  organizationId: org._id,
  month: 3,
  year: 2024
});

// Internal helper detects type and queries appropriately
```

**Implementation:**
- `findEmployeeSecure()` accepts either format
- Auto-detects based on type
- Queries correct field (_id vs employeeId)

## Testing Strategy

### Security Tests

```typescript
describe('Multi-Tenant Security', () => {
  it('should prevent cross-tenant access via processSalary', async () => {
    const org1 = await Org.create({ name: 'Org 1' });
    const org2 = await Org.create({ name: 'Org 2' });

    const emp1 = await payroll.hire({
      organizationId: org1._id,
      employment: { position: 'Dev' },
      compensation: { baseAmount: 100000 }
    });

    // Try to process salary for emp1 using org2's ID (should fail)
    await expect(payroll.processSalary({
      employeeId: emp1._id,
      organizationId: org2._id,  // Wrong org!
      month: 3,
      year: 2024
    })).rejects.toThrow(EmployeeNotFoundError);
  });

  it('should work with correct organizationId', async () => {
    // Should succeed with matching org
    const result = await payroll.processSalary({
      employeeId: emp1._id,
      organizationId: org1._id,  // Correct org
      month: 3,
      year: 2024
    });
    expect(result).toBeDefined();
  });
});
```

### Single-Tenant Tests

```typescript
describe('Single-Tenant Mode', () => {
  it('should auto-inject organizationId', async () => {
    const payroll = createPayrollInstance()
      .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
      .forSingleTenant({ organizationId: org._id, autoInject: true })
      .build();

    const emp = await payroll.hire({
      // No organizationId needed - auto-injected
      employment: { position: 'Dev' },
      compensation: { baseAmount: 100000 }
    });

    expect(emp.organizationId).toEqual(org._id);

    // processSalary also auto-injects
    const result = await payroll.processSalary({
      employeeId: emp._id,
      // organizationId auto-injected
      month: 3,
      year: 2024
    });
    expect(result).toBeDefined();
  });
});
```

## Migration Guide for Users

### v2.2.1 → v2.3.0

**Breaking Change:** All mutation operations now require `organizationId`

**Before:**
```typescript
await payroll.processSalary({
  employeeId: emp._id,
  month: 3,
  year: 2024
});
```

**After (Multi-Tenant):**
```typescript
await payroll.processSalary({
  employeeId: emp._id,
  organizationId: org._id,  // NOW REQUIRED
  month: 3,
  year: 2024
});
```

**After (Single-Tenant - No Change):**
```typescript
// Configure once
const payroll = createPayrollInstance()
  .withModels({ ... })
  .forSingleTenant({ organizationId: org._id, autoInject: true })
  .build();

// Then use without organizationId (auto-injected)
await payroll.processSalary({
  employeeId: emp._id,
  month: 3,
  year: 2024
});
```

## Implementation Checklist

- [x] Create secure lookup utilities
- [x] Export from utils/index.ts
- [ ] Update all parameter types (add organizationId)
- [ ] Fix processSalary
- [ ] Fix terminateEmployee
- [ ] Fix updateEmployment
- [ ] Fix reHireEmployee
- [ ] Fix updateSalary
- [ ] Fix allowance operations
- [ ] Fix deduction operations
- [ ] Fix updateBankDetails
- [ ] Fix guest employee creation
- [ ] Add security tests
- [ ] Add single-tenant tests
- [ ] Update README with security notes
- [ ] Update README with single-tenant guide
- [ ] Build and verify
- [ ] Full test suite pass

## Release Plan

- **Version:** 2.3.0 (minor bump due to new required field)
- **Type:** Security fix + Feature enhancement
- **Timeline:** Immediate (critical security issue)
- **Communication:** Clear migration guide, changelog highlighting security fix

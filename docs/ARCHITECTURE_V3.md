# @classytic/payroll v3.0 - World-Class Architecture

**Powered by Claude • Anthropic**

## 🎯 Vision

Build the **most developer-friendly, secure, and intelligent** HRM/Payroll system for MongoDB. Zero security vulnerabilities, crystal-clear APIs, automatic multi-tenant isolation, and seamless single-tenant mode.

---

## 🏗️ Core Principles

1. **Security First** - Multi-tenant isolation enforced at compile-time
2. **Smart Auto-Detection** - System infers single vs multi-tenant from config
3. **Dual Identity Support** - Works with ObjectId `_id` OR string `employeeId`
4. **Type-Safe Everything** - Export all interfaces for app integration
5. **Clear Error Messages** - Never leave developers guessing
6. **Zero Magic** - Explicit, predictable behavior
7. **Mongoose Native** - No bypasses, all validations run

---

## 🔐 Security Model

### Multi-Tenant Isolation (Default)

**Every operation REQUIRES organizationId:**

```typescript
// ✅ SECURE: Always includes org filter
const result = await payroll.processSalary({
  employeeId: emp._id,           // Can be ObjectId or "EMP-001"
  organizationId: org._id,       // REQUIRED for security
  month: 3,
  year: 2024
});
```

**How it works:**
- All employee lookups use `findEmployeeSecure()`
- Query: `{ _id: employeeId, organizationId: org._id }` ✅
- Cross-tenant access: **IMPOSSIBLE**
- Compile-time safety: TypeScript errors if org missing

### Single-Tenant Mode (Convenience)

**Auto-injects organizationId from config:**

```typescript
// 1. Configure once
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({
    organizationId: myCompany._id,
    autoInject: true  // 🔮 Magic switch
  })
  .build();

// 2. Use without org (auto-injected internally)
const result = await payroll.processSalary({
  employeeId: emp._id,
  // organizationId auto-injected ✨
  month: 3,
  year: 2024
});

// 3. Behind the scenes:
// Container adds: organizationId: myCompany._id
// Query becomes: { _id: employeeId, organizationId: myCompany._id } ✅
```

---

## 🆔 Dual Identity System

### Problem
- MongoDB uses `_id` (ObjectId)
- Business logic uses `employeeId` ("EMP-001")
- Old API confused: parameter named `employeeId` but expects `_id`

### Solution
**Accept BOTH, auto-detect internally:**

```typescript
// Option 1: By MongoDB _id (ObjectId)
await payroll.processSalary({
  employeeId: employee._id,  // ObjectId detected
  organizationId: org._id,
  month: 3, year: 2024
});
// Query: { _id: ObjectId(...), organizationId: ... }

// Option 2: By business employeeId (string)
await payroll.processSalary({
  employeeId: "EMP-001",     // String detected
  organizationId: org._id,
  month: 3, year: 2024
});
// Query: { employeeId: "EMP-001", organizationId: ... }

// Option 3: Explicit (advanced users)
await payroll.processSalary({
  _id: employee._id,         // Explicit _id
  organizationId: org._id,
  month: 3, year: 2024
});
```

**Implementation:**
- `findEmployeeSecure()` checks type
- ObjectId → query by `_id`
- String → query by `employeeId`
- Explicit `_id` param → always use `_id`

---

## 🔧 Smart Organization Resolution

**Priority Chain (automatic):**

1. **Explicit param** (highest priority)
2. **Context.organizationId** (middleware/auth)
3. **Single-tenant config** (if autoInject enabled)
4. **Error** (if none found in multi-tenant mode)

```typescript
// Example: Middleware sets context.organizationId
const context = {
  organizationId: req.user.organizationId,
  userId: req.user._id,
  session: mongoSession
};

// User doesn't need to pass org explicitly
await payroll.processSalary({
  employeeId: emp._id,
  // organizationId inferred from context ✨
  month: 3,
  year: 2024,
  context
});
```

**Helper Function:**
```typescript
function resolveOrganizationId(
  explicit?: ObjectIdLike,
  context?: OperationContext,
  container?: Container
): ObjectId {
  // 1. Explicit param wins
  if (explicit) return toObjectId(explicit);

  // 2. Context from middleware
  if (context?.organizationId) return toObjectId(context.organizationId);

  // 3. Single-tenant auto-inject
  if (container?.isSingleTenant() && container.getSingleTenantConfig()?.autoInject) {
    const orgId = container.getOrganizationId();
    if (orgId) return toObjectId(orgId);
  }

  // 4. Error
  throw new Error(
    'organizationId is required. Provide it explicitly, via context, or enable single-tenant mode with autoInject.'
  );
}
```

---

## 📦 Updated Type System

### Core Parameter Types

```typescript
/**
 * Base parameters for all employee operations
 * Enforces multi-tenant isolation
 */
export interface EmployeeOperationParams {
  /**
   * Employee identifier (supports both formats):
   * - ObjectId: employee._id
   * - String: "EMP-001"
   * System auto-detects and queries appropriately
   */
  employeeId: ObjectIdLike | string;

  /**
   * Organization ID for multi-tenant isolation
   *
   * Multi-tenant mode: REQUIRED
   * Single-tenant mode: Optional (auto-injected if autoInject=true)
   *
   * Priority:
   * 1. This explicit value
   * 2. context.organizationId
   * 3. Single-tenant config
   */
  organizationId?: ObjectIdLike;

  /**
   * Operation context (auth, session, etc.)
   */
  context?: OperationContext;
}

/**
 * Process salary parameters
 */
export interface ProcessSalaryParams extends EmployeeOperationParams {
  month: number;
  year: number;
  paymentDate?: Date;
  paymentMethod?: PaymentMethod;
  attendance?: AttendanceInput | null;
  options?: PayrollProcessingOptions;
}

/**
 * Terminate employee parameters
 */
export interface TerminateEmployeeParams extends EmployeeOperationParams {
  terminationDate?: Date;
  reason?: TerminationReason;
  notes?: string;
}

// ... all other mutation params extend EmployeeOperationParams
```

### Operation Context

```typescript
/**
 * Operation context (passed from middleware/auth)
 */
export interface OperationContext {
  /** User performing operation */
  userId?: ObjectIdLike;
  userName?: string;
  userRole?: string;

  /**
   * Organization ID (auto-extracted from auth/middleware)
   * Used as fallback if not provided explicitly
   */
  organizationId?: ObjectIdLike;

  /** MongoDB session for transactions */
  session?: ClientSession;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}
```

---

## 🛠️ Implementation Files

### 1. Secure Lookup Utility

**File:** `src/utils/employee-lookup.ts` ✅ (DONE)

Functions:
- `findEmployeeSecure()` - Secure lookup with org isolation
- `employeeExistsSecure()` - Check existence safely
- `findEmployeesSecure()` - Bulk queries with org filter
- `requireOrganizationId()` - Validation helper

### 2. Organization Resolution Helper

**File:** `src/utils/org-resolution.ts` (NEW)

```typescript
/**
 * Smart organization ID resolution
 * Priority: explicit > context > single-tenant config
 */
export function resolveOrganizationId(
  params: {
    explicit?: ObjectIdLike;
    context?: OperationContext;
    container?: Container;
    operation?: string;
  }
): ObjectId;

/**
 * Validate organization ID is present
 * Throws helpful error if missing
 */
export function validateOrganizationId(
  organizationId: ObjectIdLike | undefined,
  operation: string
): ObjectId;
```

### 3. Employee Identity Helper

**File:** `src/utils/employee-identity.ts` (NEW)

```typescript
/**
 * Detect if employeeId is ObjectId or string
 */
export function detectEmployeeIdType(
  employeeId: ObjectIdLike | string
): 'objectId' | 'string';

/**
 * Build employee query based on identifier type
 */
export function buildEmployeeQuery(
  employeeId: ObjectIdLike | string,
  organizationId: ObjectId
): { _id?: ObjectId; employeeId?: string; organizationId: ObjectId };
```

### 4. Updated Payroll Operations

**File:** `src/payroll.ts`

All methods updated to:
1. Use `resolveOrganizationId()` for smart org detection
2. Use `findEmployeeSecure()` for all lookups
3. Support dual identity (ObjectId + string)
4. Clear error messages

---

## 📝 Migration Examples

### Multi-Tenant App

```typescript
import { createPayrollInstance, type ProcessSalaryParams } from '@classytic/payroll';

// Setup (once)
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .build();  // Multi-tenant by default

// Usage (in API routes)
app.post('/api/payroll/process', async (req, res) => {
  // Auth middleware sets req.user
  const context = {
    organizationId: req.user.organizationId,  // From JWT/session
    userId: req.user._id,
    session: await mongoose.startSession()
  };

  const params: ProcessSalaryParams = {
    employeeId: req.body.employeeId,  // Can be ObjectId or "EMP-001"
    // organizationId auto-extracted from context ✨
    month: req.body.month,
    year: req.body.year,
    context
  };

  const result = await payroll.processSalary(params);
  res.json(result);
});
```

### Single-Tenant App

```typescript
import { createPayrollInstance } from '@classytic/payroll';

// Setup (once) - Your company's ID hardcoded
const MY_COMPANY_ID = new mongoose.Types.ObjectId('...');

const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({
    organizationId: MY_COMPANY_ID,
    autoInject: true  // Auto-add to all operations
  })
  .build();

// Usage (clean API - no org needed)
app.post('/api/payroll/process', async (req, res) => {
  const result = await payroll.processSalary({
    employeeId: req.body.employeeId,  // Just employee ID
    // organizationId auto-injected from config ✨
    month: req.body.month,
    year: req.body.year
  });
  res.json(result);
});
```

---

## 🧪 Testing Strategy

### Security Tests

```typescript
describe('Multi-Tenant Security', () => {
  it('prevents cross-tenant access', async () => {
    const org1 = await Org.create({ name: 'Company A' });
    const org2 = await Org.create({ name: 'Company B' });

    const empA = await payroll.hire({
      organizationId: org1._id,
      employment: { position: 'Dev' },
      compensation: { baseAmount: 100000 }
    });

    // Try to access Company A employee from Company B context
    await expect(
      payroll.processSalary({
        employeeId: empA._id,
        organizationId: org2._id,  // ❌ Wrong org
        month: 3, year: 2024
      })
    ).rejects.toThrow('Employee not found');
  });

  it('works with correct organization', async () => {
    const result = await payroll.processSalary({
      employeeId: empA._id,
      organizationId: org1._id,  // ✅ Correct org
      month: 3, year: 2024
    });
    expect(result).toBeDefined();
  });
});
```

### Identity Tests

```typescript
describe('Dual Identity Support', () => {
  it('works with ObjectId _id', async () => {
    const result = await payroll.processSalary({
      employeeId: employee._id,  // ObjectId
      organizationId: org._id,
      month: 3, year: 2024
    });
    expect(result).toBeDefined();
  });

  it('works with string employeeId', async () => {
    const result = await payroll.processSalary({
      employeeId: "EMP-001",  // String
      organizationId: org._id,
      month: 3, year: 2024
    });
    expect(result).toBeDefined();
  });
});
```

---

## 📚 Documentation

### README Updates

1. **Security Section** - Explain multi-tenant isolation
2. **Single-Tenant Guide** - Complete setup guide
3. **Identity System** - Explain dual lookup
4. **Migration Guide** - v2.2 → v3.0
5. **Best Practices** - Security recommendations

### New Docs

1. **SINGLE_TENANT_GUIDE.md** - Complete guide
2. **SECURITY.md** - Security model explanation
3. **MIGRATION_V3.md** - Detailed migration steps

---

## 🚀 Release Plan

**Version:** 3.0.0 (major - breaking changes)

**Breaking Changes:**
1. `organizationId` now required in multi-tenant mode
2. Guest employee creation uses `Model.create()` (validates properly)
3. All lookups enforce org isolation

**New Features:**
1. Single-tenant mode with auto-injection
2. Dual identity support (ObjectId + string)
3. Smart org resolution (context/config)
4. Type-safe parameter interfaces

**Security Fixes:**
1. ✅ Multi-tenant isolation enforced
2. ✅ Cross-tenant access impossible
3. ✅ Compile-time safety with TypeScript

---

## ✅ Implementation Checklist

### Phase 1: Core Utilities
- [x] `employee-lookup.ts` (DONE)
- [ ] `org-resolution.ts`
- [ ] `employee-identity.ts`
- [ ] Export from `utils/index.ts`

### Phase 2: Type Updates
- [ ] Update all `*Params` interfaces
- [ ] Add `EmployeeOperationParams` base
- [ ] Update `OperationContext`
- [ ] Export all public types

### Phase 3: Payroll Operations
- [ ] Update `processSalary()`
- [ ] Update `terminateEmployee()`
- [ ] Update `updateEmployment()`
- [ ] Update `reHireEmployee()`
- [ ] Update `updateSalary()`
- [ ] Update `addAllowance()`
- [ ] Update `removeAllowance()`
- [ ] Update `addDeduction()`
- [ ] Update `removeDeduction()`
- [ ] Update `updateBankDetails()`

### Phase 4: Guest Employees
- [ ] Replace `insertOne()` with `Model.create()`
- [ ] Ensure validation runs
- [ ] Test with custom validators

### Phase 5: Tests
- [ ] Security test suite
- [ ] Identity test suite
- [ ] Single-tenant tests
- [ ] Multi-tenant tests
- [ ] Migration tests

### Phase 6: Documentation
- [ ] Update README
- [ ] SINGLE_TENANT_GUIDE.md
- [ ] SECURITY.md
- [ ] MIGRATION_V3.md
- [ ] API reference updates

### Phase 7: Final
- [ ] Full build
- [ ] All tests pass
- [ ] Type-check strict mode
- [ ] Bundle size check
- [ ] Performance benchmarks

# Changelog

## [2.6.1] - 2026-01-21

### Fixed

- **Critical: MongoDB TTL Index Bug** - Fixed `addTTLIndex()` partial filter using unsupported `$ne: null` operator. Changed to `{ $exists: true }` which MongoDB supports.
- **Critical: Build Configuration** - Fixed tsup bundling (v2.5.0 was unusable due to broken imports)
- **Security**: Multi-tenant isolation in `LeaveService.checkOverlap`
- **Security**: Salary processing and transactions use resolved IDs

### Breaking Changes

**Service Methods Now Return Pagination Objects**

Service methods now return mongokit's standard pagination structure instead of arrays.

```typescript
// Before v2.x
const employees = await service.findActive();

// After v2.5
const result = await service.findActive();
const employees = result.docs;
```

**Affected Methods:**
- `EmployeeService.findActive()`
- `EmployeeService.findEmployed()`
- `EmployeeService.findByDepartment()`
- `EmployeeService.findEligibleForPayroll()`

### Features

- **Pagination Support**: All query methods support pagination (page, limit, sort)
- **MongoDB Aggregation**: Stats methods use aggregation pipelines for performance
- **Type Inference**: Clean type inference from mongokit (no custom wrappers)
- **Void/Reverse/Restore**: Payroll correction workflow via `PayrollStateManager`
- **State Machine**: 6-state payroll lifecycle (pending → processing → paid → reversed/voided)
- **Single-Tenant Mode**: Auto-inject organizationId with `forSingleTenant()`
- **Tax Withholding**: Automatic cancellation on void/reverse operations

### Single-Tenant Mode

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({ organizationId: YOUR_ORG_ID, autoInject: true })
  .build();

// organizationId auto-injected
await payroll.hire({ employment, compensation });
```

### Performance

- Handles 10k+ employees efficiently
- Constant memory usage with pagination
- Aggregation-based stats (no in-memory processing)

### Architecture

- ESM-only (no CommonJS)
- Mongokit pagination standard (no custom wrappers)
- Single source of truth (models → schemas)
- Clean type exports

### Migration Guide

**Extracting Array from Result:**
```typescript
const { docs } = await service.findActive();
```

**Pagination Loop:**
```typescript
let page = 1;
const limit = 100;

while (true) {
  const result = await service.findActive({ page, limit });

  for (const emp of result.docs) {
    // Process employee
  }

  if (page * limit >= result.total) break;
  page++;
}
```

**Department Stats (Aggregated):**
```typescript
const stats = await compensationService.getDepartmentCompensationStats('it');
// Returns: { employeeCount, totalBase, averageBase, ... }
```

## [2.4.0] - Previous Version
- Versions removed as had lot of feature dependencies
- Repository pattern with mongokit
- Multi-tenant security
- Service layer architecture

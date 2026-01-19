# Pagination

Service methods now return paginated results for large datasets.

## Breaking Change (v3.0.0)

Service methods now return paginated results instead of arrays.

### Migration

```typescript
// Before v2.x
const employees: EmployeeDocument[] = await service.findActive();

// After v3.0.0
const result = await service.findActive({ page: 1, limit: 100 });
const employees = result.docs; // EmployeeDocument[]
```

## Paginated Methods

### EmployeeService

```typescript
// Find active employees
await service.findActive({ page: 1, limit: 100, sort: '-createdAt' });

// Find employed (exclude terminated)
await service.findEmployed({ page: 1, limit: 100 });

// Find by department
await service.findByDepartment('it', { page: 1, limit: 50 });

// Find eligible for payroll
await service.findEligibleForPayroll({ page: 1, limit: 100 });
```

### CompensationService (Aggregated)

```typescript
// Department stats (MongoDB aggregation)
const stats = await service.getDepartmentCompensationStats('it');
// Returns: { employeeCount, totalBase, averageBase, ... }

// Organization stats (MongoDB aggregation with $facet)
const stats = await service.getOrganizationCompensationStats();
// Returns: { employeeCount, totalBase, byDepartment: { ... } }
```

## Pagination Loop

```typescript
let page = 1;
const limit = 100;
let hasMore = true;

while (hasMore) {
  const result = await service.findActive({ page, limit });

  for (const emp of result.docs) {
    // Process employee
  }

  hasMore = page * limit < result.total;
  page++;
}
```

## Default Limits

| Method | Default Limit |
|--------|---------------|
| `findActive` | 100 |
| `findEmployed` | 100 |
| `findByDepartment` | 100 |
| `findEligibleForPayroll` | 100 |

## Types

```typescript
interface OffsetPaginationResult<T> {
  docs: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface KeysetPaginationResult<T> {
  docs: T[];
  hasMore: boolean;
  cursor?: string;
}
```

## Performance

- Uses `@classytic/mongokit` Repository pagination
- Handles 10k+ employees without memory issues
- Stats methods use MongoDB aggregation ($group, $facet)

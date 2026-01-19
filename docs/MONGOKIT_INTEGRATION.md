# MongoKit Integration

Package uses `@classytic/mongokit` Repository for data access.

## Repository Pattern

```typescript
import { Repository } from '@classytic/mongokit';

const employeeRepo = new Repository(EmployeeModel);

// Pagination
const result = await employeeRepo.getAll({
  filters: { status: 'active' },
  page: 1,
  limit: 100,
  sort: '-createdAt',
});

// Aggregation
const stats = await employeeRepo.aggregate([
  { $match: { department: 'it' } },
  { $group: { _id: null, count: { $sum: 1 } } },
]);
```

## Multi-Tenant Plugin

```typescript
import { multiTenantPlugin } from '@classytic/payroll/plugins';

const organizationId = new ObjectId('...');

const employeeRepo = new Repository(EmployeeModel, [
  multiTenantPlugin(organizationId),
]);

// All queries auto-scoped to organizationId
await employeeRepo.getAll({ filters: { status: 'active' } });
// Automatically adds: { organizationId, status: 'active' }
```

## Custom Repositories

```typescript
const payroll = createPayrollInstance()
  .withRepository('employee', customEmployeeRepo)
  .withRepository('payroll', customPayrollRepo)
  .withModels({ TransactionModel })
  .build();
```

## Service Layer

Services use repositories internally:

```typescript
// EmployeeService
class EmployeeService {
  constructor(private employeeRepo: Repository<EmployeeDocument>) {}

  async findActive(options) {
    return this.employeeRepo.getAll({
      filters: { status: 'active' },
      ...options,
    });
  }
}
```

Access via managers:

```typescript
const result = await payroll.managers.employee.service.findActive({
  page: 1,
  limit: 100,
});
```

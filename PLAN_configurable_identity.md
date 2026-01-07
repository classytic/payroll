# Implementation Plan: Configurable Employee Identity

## Executive Summary

Add flexible identity configuration to support guest employees (no userId required) and multiple identity lookup modes (userId, employeeId, email). This enables use cases like driver/contractor management where creating user accounts isn't necessary.

## Current State Analysis

### Identity System (userId-centric)

**Schema Definition** (`src/schemas/index.ts:166-170`)
```typescript
userId: {
  type: Schema.Types.ObjectId,
  ref: 'User',
  required: true,  // ← BLOCKS guest employees
}
```

**Unique Indexes** (`src/schemas/index.ts:294`, `src/plugins/employee.plugin.ts:619`)
```typescript
{ fields: { userId: 1, organizationId: 1 }, options: { unique: true } }
// ← Currently prevents multiple guest employees (all have userId: null)
```

**Validation** (`src/payroll.ts:870-872`)
```typescript
if (!userIdValue) {
  throw new ValidationError('Employee is missing userId');
}
```

**Lookup Patterns**
- Primary: `findByUserId(userId, organizationId)`
- Query builder: `.forUser(userId)`
- Population: `.populate('userId', 'name email phone')`

### Configuration System

**Location**: `src/config.ts:55-60`, `src/types.ts:234-243`

```typescript
validation: {
  requireBankDetails: boolean;
  requireEmployeeId: boolean;
  uniqueEmployeeIdPerOrg: boolean;
  allowMultiTenantEmployees: boolean;
  // ← Need to add identity config here
}
```

**Pattern**: Config options affect runtime validation and schema behavior

---

## Proposed Changes

### 1. New Types & Config

#### Add Identity Types (`src/types.ts`)

```typescript
/** Identity mode - how employees are identified */
export type EmployeeIdentityMode = 'userId' | 'employeeId' | 'email' | 'any';

/** Identity query input */
export interface EmployeeIdentityQuery {
  /** Identity value (userId ObjectId, employeeId string, or email string) */
  identity: ObjectIdLike | string;
  /** Organization ID */
  organizationId: ObjectIdLike;
  /** Identity mode (overrides config default) */
  mode?: EmployeeIdentityMode;
}
```

#### Update ValidationConfig (`src/types.ts:234-243`)

```typescript
export interface ValidationConfig {
  requireBankDetails: boolean;
  requireEmployeeId: boolean;
  uniqueEmployeeIdPerOrg: boolean;
  allowMultiTenantEmployees: boolean;

  // NEW identity configuration
  /** Require userId for all employees (default: true) */
  requireUserId: boolean;
  /** Primary identity mode for lookups (default: 'userId') */
  identityMode: EmployeeIdentityMode;
  /** Fallback modes if primary fails (default: []) */
  identityFallbacks: EmployeeIdentityMode[];
}
```

#### Update HRM_CONFIG Default (`src/config.ts:55-60`)

```typescript
validation: {
  requireBankDetails: false,
  requireEmployeeId: true,
  uniqueEmployeeIdPerOrg: true,
  allowMultiTenantEmployees: true,

  // NEW defaults (backward compatible)
  requireUserId: true,        // Keep existing behavior
  identityMode: 'userId',     // Default to current pattern
  identityFallbacks: [],      // No fallbacks by default
}
```

---

### 2. Schema Changes

#### Make userId Optional (`src/schemas/index.ts:166-170`)

```typescript
userId: {
  type: Schema.Types.ObjectId,
  ref: 'User',
  required: false,  // ← Changed: Allow guest employees
}
```

#### Update TypeScript Types (`src/types.ts:432`)

```typescript
export interface EmployeeDocument extends Document {
  userId?: ObjectId | UserReference;  // ← Make optional
  employeeId: string;
  organizationId: ObjectId;
  // ... rest
}
```

#### Update PayrollRecord Schema (`src/models/payroll-record.model.ts:75-78`)

```typescript
userId: {
  type: Schema.Types.ObjectId,
  required: false,  // ← Changed: Support guest employees
  ref: 'User',
}
```

#### Update LeaveRequest Schema (`src/models/leave-request.model.ts:36-39`)

```typescript
userId: {
  type: Schema.Types.ObjectId,
  required: false,  // ← Changed: Support guest employees
  ref: 'User',
}
```

---

### 3. Index Changes (Critical for Guest Employees)

#### Update employeeIndexes (`src/schemas/index.ts:294`)

```typescript
export const employeeIndexes = [
  { fields: { organizationId: 1, employeeId: 1 }, options: { unique: true } },

  // CHANGED: sparse index - only enforces uniqueness when userId exists
  {
    fields: { userId: 1, organizationId: 1 },
    options: { unique: true, sparse: true }  // ← Added sparse
  },

  { fields: { organizationId: 1, status: 1 } },
  { fields: { organizationId: 1, department: 1 } },
  { fields: { organizationId: 1, 'compensation.netSalary': -1 } },

  // NEW: Support email-based lookup
  {
    fields: { email: 1, organizationId: 1 },
    options: { sparse: true }  // Only index when email exists
  },
];
```

**Why sparse?**
- Without sparse: Multiple null userId values violate unique constraint
- With sparse: Unique constraint only applies when userId is not null
- Allows: Many guest employees (userId=null) per organization

#### Update Plugin Index (`src/plugins/employee.plugin.ts:619`)

```typescript
if (options.createIndexes) {
  schema.index({ organizationId: 1, employeeId: 1 }, { unique: true });

  // CHANGED: sparse index
  schema.index({ userId: 1, organizationId: 1 }, { unique: true, sparse: true });

  schema.index({ organizationId: 1, status: 1 });
  schema.index({ organizationId: 1, department: 1 });
  schema.index({ organizationId: 1, 'compensation.netSalary': -1 });

  // NEW: Email lookup
  schema.index({ email: 1, organizationId: 1 }, { sparse: true });
}
```

---

### 4. Add email Field (for email-based identity)

#### Add to employmentFields (`src/schemas/index.ts:166-230`)

```typescript
export const employmentFields = {
  userId: { ... },
  employeeId: { ... },

  // NEW: Optional email for guest employees
  email: {
    type: String,
    trim: true,
    lowercase: true,
    // Not unique globally - same email can exist in different orgs
  },

  organizationId: { ... },
  // ... rest
};
```

#### Add to Types (`src/types.ts:432-500`)

```typescript
export interface EmployeeDocument extends Document {
  userId?: ObjectId | UserReference;
  employeeId: string;
  email?: string;  // NEW: Optional email
  organizationId: ObjectId;
  // ... rest
}
```

**Email Source Logic:**
- If employee has userId: Get email from populated User document
- If employee is guest: Use employee.email field directly
- Allows guest employees to have contact email without user account

---

### 5. New Identity Lookup Method

#### Add to Payroll Class (`src/payroll.ts`)

```typescript
/**
 * Get employee by flexible identity (userId, employeeId, or email)
 *
 * @example
 * // By userId (existing pattern)
 * const emp = await payroll.getEmployeeByIdentity({
 *   identity: userId,
 *   organizationId,
 *   mode: 'userId'
 * });
 *
 * // By employeeId (human-readable)
 * const emp = await payroll.getEmployeeByIdentity({
 *   identity: 'EMP-001',
 *   organizationId,
 *   mode: 'employeeId'
 * });
 *
 * // By email
 * const emp = await payroll.getEmployeeByIdentity({
 *   identity: 'john@example.com',
 *   organizationId,
 *   mode: 'email'
 * });
 *
 * // Auto-detect with fallbacks (uses config.identityMode + fallbacks)
 * const emp = await payroll.getEmployeeByIdentity({
 *   identity: 'EMP-001',
 *   organizationId
 * });
 */
async getEmployeeByIdentity(params: {
  identity: ObjectIdLike | string;
  organizationId: ObjectIdLike;
  mode?: EmployeeIdentityMode;
  populateUser?: boolean;
  session?: ClientSession;
}): Promise<TEmployee> {
  this.ensureInitialized();

  const {
    identity,
    organizationId,
    mode = this.config.validation.identityMode,
    populateUser = true,
    session
  } = params;

  const orgId = toObjectId(organizationId);
  const modes: EmployeeIdentityMode[] = [
    mode,
    ...this.config.validation.identityFallbacks
  ];

  for (const currentMode of modes) {
    let employee: TEmployee | null = null;

    switch (currentMode) {
      case 'userId': {
        // Lookup by userId (existing pattern)
        try {
          const userId = toObjectId(identity);
          let query = this.models.EmployeeModel.findOne({
            userId,
            organizationId: orgId
          });
          if (session) query = query.session(session);
          if (populateUser) query = query.populate('userId', 'name email phone');
          employee = await query as TEmployee | null;
        } catch {
          // Invalid ObjectId, skip
        }
        break;
      }

      case 'employeeId': {
        // Lookup by employeeId (string)
        let query = this.models.EmployeeModel.findOne({
          employeeId: identity.toString(),
          organizationId: orgId
        });
        if (session) query = query.session(session);
        if (populateUser) query = query.populate('userId', 'name email phone');
        employee = await query as TEmployee | null;
        break;
      }

      case 'email': {
        // Lookup by email (from User or guest employee email field)
        const email = identity.toString().toLowerCase().trim();

        // First, try direct email field (guest employees)
        let query = this.models.EmployeeModel.findOne({
          email,
          organizationId: orgId
        });
        if (session) query = query.session(session);
        if (populateUser) query = query.populate('userId', 'name email phone');
        employee = await query as TEmployee | null;

        // If not found, try looking up by User.email (requires population)
        if (!employee) {
          // This requires a more complex query - may need to use aggregation
          // or populate all users and filter by email
          // For now, skip this complexity (can be added if needed)
        }
        break;
      }

      case 'any': {
        // Try all modes in order: userId → employeeId → email
        const anyModes: EmployeeIdentityMode[] = ['userId', 'employeeId', 'email'];
        for (const tryMode of anyModes) {
          const result = await this.getEmployeeByIdentity({
            identity,
            organizationId,
            mode: tryMode,
            populateUser,
            session
          }).catch(() => null);

          if (result) return result;
        }
        break;
      }
    }

    if (employee) {
      return employee;
    }
  }

  throw new EmployeeNotFoundError(
    `Employee not found with identity: ${identity} (tried modes: ${modes.join(', ')})`
  );
}
```

---

### 6. Update Validation Logic

#### Remove userId Required Check (`src/payroll.ts:870-872`)

```typescript
// REMOVE this check (or make conditional based on config)
// if (!userIdValue) {
//   throw new ValidationError('Employee is missing userId');
// }

// REPLACE with config-based validation
if (this.config.validation.requireUserId && !userIdValue) {
  throw new ValidationError(
    'Employee is missing userId (required by configuration)',
    { field: 'userId' }
  );
}
```

#### Update HireEmployeeParams (`src/types.ts:533-561`)

```typescript
export interface HireEmployeeParams {
  userId?: ObjectIdLike;  // ← Make optional
  organizationId?: ObjectIdLike;
  employment: {
    employeeId?: string;
    email?: string;  // NEW: For guest employees
    type?: EmploymentType;
    department?: Department | string;
    position: string;
    hireDate?: Date;
    probationMonths?: number;
    workSchedule?: WorkSchedule;
  };
  compensation: { ... };
  bankDetails?: BankDetails;
  context?: OperationContext;
}
```

#### Add Validation in hire() (`src/payroll.ts:255-316`)

```typescript
async hire(params: HireEmployeeParams): Promise<TEmployee> {
  this.ensureInitialized();

  const { userId, employment, compensation, bankDetails, context } = params;
  const session = context?.session;
  const organizationId = this.resolveOrganizationId(params.organizationId, context);

  // NEW: Validate identity based on config
  if (this.config.validation.requireUserId && !userId) {
    throw new ValidationError(
      'userId is required (set validation.requireUserId: false to allow guest employees)',
      { field: 'userId' }
    );
  }

  // NEW: Ensure at least one identity field
  if (!userId && !employment.email && !employment.employeeId) {
    throw new ValidationError(
      'At least one identity field required: userId, email, or employeeId'
    );
  }

  // Check for existing employee
  if (userId) {
    const existingQuery = employeeQuery()
      .forUser(userId)
      .forOrganization(organizationId)
      .employed()
      .build();

    const existing = await this.models.EmployeeModel.findOne(existingQuery).session(session);

    if (existing) {
      throw new Error('User is already an active employee in this organization');
    }
  }

  // Rest of hire logic...
}
```

---

### 7. Update EmployeeFactory

#### Update create() (`src/factories/employee.factory.ts:80-150`)

```typescript
export function create(params: CreateEmployeeParams): EmployeeData {
  const {
    userId,  // ← Now optional
    organizationId,
    employment,
    compensation,
    bankDetails,
    options = {},
  } = params;

  // Generate employeeId if not provided
  const employeeId = employment.employeeId ||
    `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  return {
    userId: userId ? toObjectId(userId) : undefined,  // ← Handle optional
    employeeId,
    email: employment.email,  // NEW: Store guest employee email
    organizationId: toObjectId(organizationId),
    position: employment.position,
    department: employment.department || ('general' as Department),
    type: employment.type || 'full_time',
    status: 'active',
    hireDate: employment.hireDate || new Date(),
    probationMonths: employment.probationMonths || 3,
    workSchedule: employment.workSchedule || {
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
    },
    compensation: {
      baseSalary: compensation.baseSalary,
      currency: compensation.currency || 'BDT',
      // ... rest
    },
    bankDetails,
    employmentHistory: [],
    stats: { ... },
  };
}
```

---

### 8. Update Query Builders

#### Add new query methods (`src/utils/query-builders.ts:191-193`)

```typescript
export class EmployeeQueryBuilder {
  // Existing
  forUser(userId: ObjectIdLike): this {
    return this.where('userId', toObjectId(userId));
  }

  // NEW: Query by employeeId
  forEmployeeId(employeeId: string): this {
    return this.where('employeeId', employeeId);
  }

  // NEW: Query by email
  forEmail(email: string): this {
    return this.where('email', email.toLowerCase().trim());
  }

  // NEW: Query guest employees (no userId)
  guestEmployees(): this {
    return this.where('userId', null);
  }

  // NEW: Query user-linked employees (has userId)
  userLinkedEmployees(): this {
    return this.where('userId', { $ne: null });
  }
}
```

---

### 9. Update Service Layer

#### Add to EmployeeService (`src/services/employee.service.ts`)

```typescript
/**
 * Find employee by employeeId (human-readable ID)
 */
async findByEmployeeId(
  employeeId: string,
  organizationId: ObjectIdLike,
  options: { session?: ClientSession } = {}
): Promise<EmployeeDocument | null> {
  const query = employeeQuery()
    .forEmployeeId(employeeId)
    .forOrganization(organizationId)
    .build();

  let mongooseQuery = this.EmployeeModel.findOne(query);

  if (options.session) {
    mongooseQuery = mongooseQuery.session(options.session);
  }

  return mongooseQuery.exec();
}

/**
 * Find employee by email
 */
async findByEmail(
  email: string,
  organizationId: ObjectIdLike,
  options: { session?: ClientSession } = {}
): Promise<EmployeeDocument | null> {
  const query = employeeQuery()
    .forEmail(email)
    .forOrganization(organizationId)
    .build();

  let mongooseQuery = this.EmployeeModel.findOne(query);

  if (options.session) {
    mongooseQuery = mongooseQuery.session(options.session);
  }

  return mongooseQuery.exec();
}

/**
 * Find all guest employees (no userId)
 */
async findGuestEmployees(
  organizationId: ObjectIdLike,
  options: { session?: ClientSession } = {}
): Promise<EmployeeDocument[]> {
  const query = employeeQuery()
    .forOrganization(organizationId)
    .guestEmployees()
    .build();

  let mongooseQuery = this.EmployeeModel.find(query);

  if (options.session) {
    mongooseQuery = mongooseQuery.session(options.session);
  }

  return mongooseQuery.exec();
}
```

---

### 10. Documentation Updates

#### Update README.md

Add new section after existing configuration:

```markdown
### Flexible Employee Identity

By default, employees require a `userId` linking to a user account. For use cases like guest workers, drivers, or contractors, you can enable guest employees:

```typescript
const payroll = new PayrollBuilder()
  .withModels(models)
  .withConfig({
    validation: {
      requireUserId: false,        // Allow employees without user accounts
      identityMode: 'employeeId',  // Primary lookup by employeeId
      identityFallbacks: ['email', 'userId'],  // Try email, then userId if not found
    }
  })
  .build();
```

**Hire guest employee:**

```typescript
const driver = await payroll.hire({
  // No userId - guest employee
  employment: {
    employeeId: 'DRV-001',
    email: 'driver@example.com',  // For notifications
    position: 'Delivery Driver',
    department: 'logistics',
  },
  compensation: {
    baseSalary: 25000,
    currency: 'BDT',
  }
});
```

**Flexible lookups:**

```typescript
// By employeeId (works for both guest and user-linked employees)
const emp = await payroll.getEmployeeByIdentity({
  identity: 'DRV-001',
  organizationId,
  mode: 'employeeId'
});

// By email
const emp = await payroll.getEmployeeByIdentity({
  identity: 'driver@example.com',
  organizationId,
  mode: 'email'
});

// Auto-detect based on config
const emp = await payroll.getEmployeeByIdentity({
  identity: 'DRV-001',  // Uses identityMode + fallbacks from config
  organizationId
});
```

**Identity Modes:**

- `'userId'` - Lookup by user account ID (default, existing behavior)
- `'employeeId'` - Lookup by human-readable employee ID
- `'email'` - Lookup by email address
- `'any'` - Try all modes until found

**Use Cases:**

- **Guest employees**: Drivers, contractors, temporary workers without user accounts
- **Email-based flows**: HR systems that work with email addresses
- **Human-readable IDs**: Systems using `EMP-001` style identifiers
- **Migration**: Support both old (userId) and new (employeeId) patterns during transition
```

---

## Implementation Checklist

### Phase 1: Types & Config (No Breaking Changes)
- [ ] Add `EmployeeIdentityMode` type to `src/types.ts`
- [ ] Add `EmployeeIdentityQuery` interface to `src/types.ts`
- [ ] Extend `ValidationConfig` with identity fields
- [ ] Update `HRM_CONFIG` defaults (backward compatible)

### Phase 2: Schema Changes (Breaking for indexes)
- [ ] Make `userId` optional in `employmentFields` (`src/schemas/index.ts`)
- [ ] Make `userId` optional in `EmployeeDocument` type
- [ ] Make `userId` optional in PayrollRecord schema
- [ ] Make `userId` optional in LeaveRequest schema
- [ ] Add `email` field to `employmentFields`
- [ ] Add `email` to `EmployeeDocument` type

### Phase 3: Index Updates (Requires Migration)
- [ ] Add `sparse: true` to userId index in `employeeIndexes`
- [ ] Add `sparse: true` to userId index in employee plugin
- [ ] Add email index (sparse) to `employeeIndexes`
- [ ] Add email index (sparse) to employee plugin
- [ ] **Create migration script** for existing databases

### Phase 4: Core Logic
- [ ] Update `EmployeeFactory.create()` to handle optional userId
- [ ] Add validation in `hire()` based on `requireUserId` config
- [ ] Update `HireEmployeeParams` to make userId optional
- [ ] Remove/conditional userId validation in payroll processing
- [ ] Handle optional userId in population logic

### Phase 5: New Identity API
- [ ] Add `getEmployeeByIdentity()` method to Payroll class
- [ ] Add `forEmployeeId()` to query builder
- [ ] Add `forEmail()` to query builder
- [ ] Add `guestEmployees()` to query builder
- [ ] Add `userLinkedEmployees()` to query builder
- [ ] Add `findByEmployeeId()` to EmployeeService
- [ ] Add `findByEmail()` to EmployeeService
- [ ] Add `findGuestEmployees()` to EmployeeService

### Phase 6: Testing
- [ ] Unit tests: Guest employee creation
- [ ] Unit tests: Identity lookup modes
- [ ] Unit tests: Sparse index behavior
- [ ] Unit tests: Config validation
- [ ] Integration tests: Guest employee payroll processing
- [ ] Integration tests: Mixed guest + user-linked employees
- [ ] Integration tests: Identity fallback chain

### Phase 7: Documentation
- [ ] Update README with guest employee examples
- [ ] Add identity configuration section
- [ ] Document migration path
- [ ] Add JSDoc comments to new methods
- [ ] Update TypeScript types exports

---

## Migration Strategy

### For Existing Databases

Users need to rebuild indexes with sparse option:

**Migration Script** (`scripts/migrate-identity-indexes.ts`):

```typescript
import mongoose from 'mongoose';

async function migrateIdentityIndexes(EmployeeModel: mongoose.Model<any>) {
  console.log('Migrating employee identity indexes...');

  // Drop old non-sparse userId index
  try {
    await EmployeeModel.collection.dropIndex('userId_1_organizationId_1');
    console.log('✓ Dropped old userId index');
  } catch (err) {
    console.log('! Old index not found (may already be migrated)');
  }

  // Create new sparse userId index
  await EmployeeModel.collection.createIndex(
    { userId: 1, organizationId: 1 },
    { unique: true, sparse: true }
  );
  console.log('✓ Created sparse userId index');

  // Create email index
  await EmployeeModel.collection.createIndex(
    { email: 1, organizationId: 1 },
    { sparse: true }
  );
  console.log('✓ Created email index');

  console.log('Migration complete!');
}

// Usage in your app
// await migrateIdentityIndexes(payroll.models.EmployeeModel);
```

**Documentation in README:**

```markdown
## Upgrading to v2.3.0

Version 2.3.0 introduces flexible employee identity. If you have existing data:

1. Run index migration:
   ```typescript
   await payroll.models.EmployeeModel.collection.dropIndex('userId_1_organizationId_1');
   await payroll.models.EmployeeModel.collection.createIndex(
     { userId: 1, organizationId: 1 },
     { unique: true, sparse: true }
   );
   ```

2. (Optional) Enable guest employees in config:
   ```typescript
   validation: { requireUserId: false }
   ```

Existing code continues to work - this is backward compatible.
```

---

## Testing Strategy

### Unit Tests

**File: `tests/identity-configuration.test.ts`**

```typescript
describe('Employee Identity Configuration', () => {
  describe('Guest Employees (requireUserId: false)', () => {
    it('should allow hiring employee without userId', async () => {
      const payroll = createPayrollWithConfig({
        validation: { requireUserId: false }
      });

      const employee = await payroll.hire({
        employment: {
          employeeId: 'GUEST-001',
          email: 'guest@example.com',
          position: 'Driver'
        },
        compensation: { baseSalary: 30000 }
      });

      expect(employee.userId).toBeUndefined();
      expect(employee.email).toBe('guest@example.com');
    });

    it('should allow multiple guest employees', async () => {
      // Test sparse index - multiple null userId values allowed
      const emp1 = await payroll.hire({ /* no userId */ });
      const emp2 = await payroll.hire({ /* no userId */ });

      expect(emp1._id).not.toEqual(emp2._id);
    });

    it('should reject when requireUserId=true and userId missing', async () => {
      const payroll = createPayrollWithConfig({
        validation: { requireUserId: true }
      });

      await expect(
        payroll.hire({ /* no userId */ })
      ).rejects.toThrow('userId is required');
    });
  });

  describe('Identity Lookup', () => {
    it('should find employee by userId', async () => {
      const emp = await payroll.getEmployeeByIdentity({
        identity: userId,
        organizationId,
        mode: 'userId'
      });

      expect(emp.userId).toEqual(userId);
    });

    it('should find employee by employeeId', async () => {
      const emp = await payroll.getEmployeeByIdentity({
        identity: 'EMP-001',
        organizationId,
        mode: 'employeeId'
      });

      expect(emp.employeeId).toBe('EMP-001');
    });

    it('should find guest employee by email', async () => {
      const emp = await payroll.getEmployeeByIdentity({
        identity: 'guest@example.com',
        organizationId,
        mode: 'email'
      });

      expect(emp.email).toBe('guest@example.com');
    });

    it('should use identity fallbacks', async () => {
      const payroll = createPayrollWithConfig({
        validation: {
          identityMode: 'userId',
          identityFallbacks: ['employeeId', 'email']
        }
      });

      // Pass employeeId but config primary is userId
      // Should fall back to employeeId mode
      const emp = await payroll.getEmployeeByIdentity({
        identity: 'EMP-001',
        organizationId
      });

      expect(emp).toBeDefined();
    });

    it('should throw when identity not found', async () => {
      await expect(
        payroll.getEmployeeByIdentity({
          identity: 'NONEXISTENT',
          organizationId,
          mode: 'employeeId'
        })
      ).rejects.toThrow(EmployeeNotFoundError);
    });
  });
});
```

### Integration Tests

**File: `tests/guest-employee-payroll.test.ts`**

```typescript
describe('Guest Employee Payroll Processing', () => {
  it('should process payroll for guest employee', async () => {
    // Hire guest employee
    const driver = await payroll.hire({
      employment: {
        employeeId: 'DRV-001',
        email: 'driver@example.com',
        position: 'Driver',
      },
      compensation: { baseSalary: 30000 },
    });

    // Process salary
    const result = await payroll.processSalary({
      employeeId: driver._id,
      month: 3,
      year: 2024,
    });

    expect(result.netSalary).toBeGreaterThan(0);
    expect(result.status).toBe('completed');
  });

  it('should handle mixed guest and user-linked employees', async () => {
    // Regular employee with user account
    const regular = await payroll.hire({
      userId: regularUserId,
      employment: { position: 'Manager' },
      compensation: { baseSalary: 50000 },
    });

    // Guest employee
    const guest = await payroll.hire({
      employment: {
        employeeId: 'GUEST-001',
        position: 'Driver',
      },
      compensation: { baseSalary: 30000 },
    });

    // Process bulk payroll
    const results = await payroll.processBulkPayroll({
      organizationId,
      month: 3,
      year: 2024,
    });

    expect(results.successful).toHaveLength(2);
  });
});
```

---

## Backward Compatibility

### Guaranteed

✅ **Existing code continues to work unchanged**
- Default config: `requireUserId: true` (same as current behavior)
- Default identity mode: `'userId'` (existing lookup pattern)
- Existing `getEmployee()` method unchanged
- All existing hire/terminate/payroll flows work as-is

### Opt-In

Users must explicitly opt into new features:

```typescript
// Enable guest employees
validation: { requireUserId: false }

// Use new identity lookup
payroll.getEmployeeByIdentity({ identity, organizationId })
```

### Migration Path

1. **Update package** - Indexes auto-migrate on schema initialization
2. **(Optional) Run manual index migration** - For production safety
3. **(Optional) Enable new features** - Guest employees, identity modes

---

## Edge Cases & Considerations

### 1. Email Conflicts

**Scenario**: Same email in User table and employee.email (guest)

**Solution**:
- `mode: 'email'` first checks employee.email (guest employees)
- Falls back to User.email lookup (via population/aggregation)
- Document precedence in README

### 2. Population with Optional userId

**Current**:
```typescript
query.populate('userId', 'name email phone')
```

**Problem**: Fails when userId is null/undefined

**Solution**: Conditional population
```typescript
if (employee.userId) {
  await employee.populate('userId', 'name email phone');
}
```

### 3. PayrollRecord without userId

**Impact**: Reports and queries that filter by userId

**Solution**: Add methods for guest employee queries
```typescript
// Find payroll records for guest employees
employeeQuery().guestEmployees().build()

// Find payroll records for user-linked employees
employeeQuery().userLinkedEmployees().build()
```

### 4. Leave Requests for Guest Employees

**Consideration**: Guest employees may not have user login

**Solution**:
- Leave requests work via employeeId
- Approval flows use employee record, not user account
- Notifications can use employee.email field

---

## Performance Impact

### Index Changes

**Before**: 2 indexes per employee
- `{ organizationId, employeeId }` unique
- `{ userId, organizationId }` unique

**After**: 3 indexes per employee
- `{ organizationId, employeeId }` unique
- `{ userId, organizationId }` unique sparse (same, but sparse)
- `{ email, organizationId }` sparse (new)

**Impact**: Minimal - sparse indexes only index non-null values

### Query Performance

- `forUser(userId)`: Same (uses sparse userId index)
- `forEmployeeId()`: Same (uses existing employeeId index)
- `forEmail()`: New index improves email lookups
- `getEmployeeByIdentity()`: May try multiple modes (fallback chain)

**Optimization**: Cache results or use specific mode when known

---

## API Surface Changes

### New Public Methods

```typescript
// Main Payroll class
payroll.getEmployeeByIdentity(params: EmployeeIdentityQuery): Promise<Employee>

// EmployeeService
service.findByEmployeeId(employeeId, organizationId): Promise<Employee | null>
service.findByEmail(email, organizationId): Promise<Employee | null>
service.findGuestEmployees(organizationId): Promise<Employee[]>

// Query Builder
builder.forEmployeeId(employeeId: string): this
builder.forEmail(email: string): this
builder.guestEmployees(): this
builder.userLinkedEmployees(): this
```

### Modified Interfaces

```typescript
// Optional userId
interface HireEmployeeParams {
  userId?: ObjectIdLike;  // Was: required
  employment: {
    email?: string;  // New
    // ...
  }
}

interface EmployeeDocument {
  userId?: ObjectId;  // Was: required
  email?: string;  // New
}

// Extended config
interface ValidationConfig {
  requireUserId: boolean;  // New
  identityMode: EmployeeIdentityMode;  // New
  identityFallbacks: EmployeeIdentityMode[];  // New
}
```

---

## Security Considerations

### 1. Guest Employee Access Control

**Risk**: Guest employees have employee records but no user accounts

**Mitigation**:
- Document that apps should check `employee.userId` exists before granting user-level permissions
- Leave/attendance features work via employeeId (no login required)
- Payroll processing restricted to managers (not affected)

### 2. Email-Based Lookup

**Risk**: Email enumeration attacks

**Mitigation**:
- Require organizationId in all email lookups (prevents cross-org enumeration)
- Rate limit identity lookup endpoints at application level
- Document best practices in README

### 3. employeeId Guessing

**Risk**: Sequential employeeIds (EMP-001, EMP-002) are guessable

**Mitigation**:
- Default factory generates random IDs: `EMP-{timestamp}-{random}`
- Apps can override with their own ID scheme
- Always require organizationId in queries (scope to tenant)

---

## Open Questions for User

1. **Email lookup via User.email**: Should we support looking up employees by their linked User's email (not just employee.email)? This requires aggregation/complex query.

2. **Identity validation**: Should we validate email format when provided? Or leave it to app layer?

3. **Migration timing**: Should we auto-migrate indexes on schema init, or require manual migration script?

4. **Fallback performance**: If `identityFallbacks: ['employeeId', 'email']` causes multiple DB queries, should we cache or optimize?

---

## Summary

This plan adds **guest employee support** and **flexible identity lookup** without breaking existing code. The implementation is:

- ✅ **Backward compatible** - Default config matches current behavior
- ✅ **Opt-in** - Users choose to enable new features
- ✅ **Type-safe** - Full TypeScript support
- ✅ **Well-tested** - Comprehensive test coverage
- ✅ **Documented** - Clear migration path and examples

**Estimated Implementation**: 2-3 days for core + tests + docs

**Risk Level**: Low (backward compatible, sparse indexes are standard)

**User Value**: Enables guest employees, flexible lookups, multi-identity systems

# Security & Data Protection

## Multi-Tenant Isolation

Enforced at 4 levels - cannot be bypassed.

```typescript
// Level 1: Repository plugin (automatic)
import { Repository, multiTenantPlugin } from '@classytic/mongokit';

const PayrollRecordRepo = new Repository(PayrollRecordModel, [
  multiTenantPlugin(organizationId)  // All queries scoped automatically
]);

// Level 2: Single-tenant mode (optional)
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .forSingleTenant({ organizationId: YOUR_ORG_ID, autoInject: true })
  .build();
```

## Audit Logging via Events

Subscribe to events for audit trails:

```typescript
const payroll = createPayrollInstance()
  .withModels({ EmployeeModel, PayrollRecordModel, TransactionModel })
  .build();

// All available events
payroll.on('employee:hired', async (payload) => {
  await AuditLog.create({ action: 'EMPLOYEE_HIRED', ...payload });
});

payroll.on('employee:terminated', async (payload) => { /* ... */ });
payroll.on('salary:processed', async ({ employee, payrollRecord, organizationId }) => { /* ... */ });
payroll.on('salary:failed', async (payload) => { /* ... */ });
payroll.on('payroll:completed', async (payload) => { /* ... */ });
payroll.on('payroll:exported', async (payload) => { /* ... */ });
payroll.on('compensation:changed', async (payload) => { /* ... */ });
```

## RBAC Implementation

Use repository hooks for access control:

```typescript
function rbacPlugin(currentUser: { role: string; department?: string }) {
  return {
    apply(repo: Repository) {
      repo.on('before:update', async (ctx) => {
        if (!['admin', 'hr'].includes(currentUser.role)) {
          throw new ForbiddenError('Insufficient permissions');
        }
      });

      repo.on('before:getAll', async (ctx) => {
        // Managers see only their department
        if (currentUser.role === 'manager') {
          ctx.filters.department = currentUser.department;
        }
      });
    }
  };
}

// Stack with multi-tenant plugin
const repos = {
  employee: new Repository(EmployeeModel, [
    multiTenantPlugin(organizationId),
    rbacPlugin(currentUser)
  ])
};
```

## PII Encryption

Implement at schema level:

```typescript
import { createEmployeeSchema } from '@classytic/payroll/schemas';
import { encrypt, decrypt } from './your-encryption-lib';

const employeeSchema = createEmployeeSchema({
  // Add encrypted fields
  ssn: { type: String, select: false },  // Never load by default
  taxId: { type: String }
});

// Encrypt before save
employeeSchema.pre('save', async function() {
  if (this.isModified('ssn')) {
    this.ssn = await encrypt(this.ssn);
  }
});

// Decrypt on access
employeeSchema.methods.getSSN = async function() {
  return decrypt(this.ssn);
};
```

## Webhooks for External Audit

```typescript
payroll.registerWebhook({
  url: 'https://audit.example.com/webhooks',
  events: ['salary:processed', 'employee:hired'],
  secret: 'your-webhook-secret',
  retries: 3
});

// Verify webhook signature in your handler
const signature = req.headers['x-payroll-signature'];
const timestamp = req.headers['x-payroll-timestamp'];
const signedPayload = `${timestamp}.${JSON.stringify(req.body)}`;
const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
```

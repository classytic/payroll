/**
 * @file Guest Employee Identity System Tests
 *
 * Comprehensive test coverage for guest employee functionality:
 * - Guest employee creation (no userId)
 * - Identity lookup modes (userId, employeeId, email, any)
 * - Identity fallback chain
 * - Sparse index behavior
 * - Mixed guest and user-linked employees
 * - Payroll processing for guest employees
 * - Transaction handling
 * - Edge cases and validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose, { Schema, model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createPayrollInstance,
  createEmployeeSchema,
  createPayrollRecordSchema,
  employeePlugin,
  type Payroll,
  type EmployeeDocument,
  type PayrollRecordDocument,
  EmployeeNotFoundError,
  ValidationError,
} from '../src/index.js';
import { disableLogging } from '../src/utils/logger.js';

// ============================================================================
// Test Setup
// ============================================================================

let mongoServer: MongoMemoryServer;
let payroll: Payroll;
let Employee: any;
let PayrollRecord: any;
let Transaction: any;
let User: any;

/**
 * Initialize MongoDB and create models ONCE
 * This ensures sparse indexes work correctly across all tests
 */
beforeAll(async () => {
  // 1. Start MongoDB in-memory server
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  disableLogging();

  // MongoMemoryServer doesn't support transactions
  const mockSession = { startTransaction: () => { throw new Error("Transaction numbers are only allowed on a replica set member"); }, commitTransaction: async () => {}, abortTransaction: async () => {}, endSession: () => {}, inTransaction: () => false }; mongoose.startSession = (async () => mockSession) as any;

  // 2. Define schemas
  const userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
  });

  const employeeSchema = createEmployeeSchema();
  const payrollRecordSchema = createPayrollRecordSchema();
  const transactionSchema = new Schema({
    organizationId: Schema.Types.ObjectId,
    userId: Schema.Types.ObjectId,
    employeeId: Schema.Types.ObjectId,
    type: String,
    category: String,
    grossAmount: Number,  // v3.0: gross amount before deductions
    amount: Number,       // v3.0: net amount (actual payment)
    currency: String,
    method: String,
    status: String,
    date: Date,
    flow: String,
    sourceId: Schema.Types.ObjectId,
    sourceModel: String,
    handledBy: Schema.Types.ObjectId,
    notes: String,
    metadata: Schema.Types.Mixed,
    breakdown: Schema.Types.Mixed,
  }, { timestamps: true });

  // Apply employee plugin for methods like terminate()
  employeeSchema.plugin(employeePlugin);

  // 3. Create models (once for all tests)
  User = model('User', userSchema);
  Employee = model('Employee', employeeSchema);
  PayrollRecord = model('PayrollRecord', payrollRecordSchema);
  Transaction = model('Transaction', transactionSchema);

  // 4. Ensure indexes are built (critical for sparse unique indexes)
  await Employee.init();
  await PayrollRecord.init();

  // 5. Initialize payroll instance (reused across tests)
  payroll = createPayrollInstance()
    .withModels({
      EmployeeModel: Employee,
      PayrollRecordModel: PayrollRecord,
      TransactionModel: Transaction,
    })
    .withConfig({
      validation: {
        requireUserId: false,           // Allow guest employees
        identityMode: 'employeeId',     // Primary lookup mode
        identityFallbacks: ['email', 'userId'], // Smart fallback chain
      },
    })
    .build();
});

/**
 * Cleanup: Clear data between tests (NOT models/indexes)
 */
beforeEach(async () => {
  // Only clear data, keep models and indexes intact
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

/**
 * Teardown: Disconnect and stop MongoDB
 */
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ============================================================================
// Helper Functions
// ============================================================================

const ORG_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();
const USER_ID_2 = new mongoose.Types.ObjectId();

async function createGuestEmployee(params: {
  employeeId?: string;
  email: string;
  name: string;
  baseSalary: number;
}) {
  return payroll.hire({
    organizationId: ORG_ID,
    employment: {
      employeeId: params.employeeId || `EMP-${Date.now()}`,
      email: params.email,
      name: params.name,
      position: 'Driver',
      department: 'operations',
      type: 'contract',
      hireDate: new Date('2024-01-01'),  // Fixed: was joinDate
    },
    compensation: {
      baseAmount: params.baseSalary,
      currency: 'USD',
      frequency: 'monthly',
    },
  });
}

async function createUserLinkedEmployee(params: {
  userId: mongoose.Types.ObjectId;
  employeeId?: string;
  email?: string;
  name: string;
  baseSalary: number;
}) {
  return payroll.hire({
    userId: params.userId,
    organizationId: ORG_ID,
    employment: {
      employeeId: params.employeeId || `EMP-${Date.now()}`,
      ...(params.email ? { email: params.email } : {}),  // Only include if provided
      name: params.name,
      position: 'Manager',
      department: 'management',
      type: 'full_time',
      hireDate: new Date('2024-01-01'),  // Fixed: was joinDate
    },
    compensation: {
      baseAmount: params.baseSalary,
      currency: 'USD',
      frequency: 'monthly',
    },
  });
}

// ============================================================================
// Guest Employee Creation Tests
// ============================================================================

describe('Guest Employee Creation', () => {
  it('should create guest employee without userId', async () => {
    const employee = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    expect(employee.userId).toBeUndefined();
    expect(employee.email).toBe('driver1@company.com');
    expect(employee.employeeId).toBe('DRIVER-001');
    expect(employee.position).toBe('Driver');
  });

  it('should create multiple guest employees with same organizationId', async () => {
    const driver1 = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const driver2 = await createGuestEmployee({
      employeeId: 'DRIVER-002',
      email: 'driver2@company.com',
      name: 'Jane Driver',
      baseSalary: 3200,
    });

    expect(driver1.userId).toBeUndefined();
    expect(driver2.userId).toBeUndefined();
    expect(driver1.email).not.toBe(driver2.email);
    expect(driver1.employeeId).not.toBe(driver2.employeeId);
  });

  it('should require at least one identity field', async () => {
    await expect(
      payroll.hire({
        organizationId: ORG_ID,
        employment: {
          // No userId, no email, no employeeId
          name: 'Invalid Employee',
          position: 'Worker',
          department: 'operations',
          type: 'contract',
          joinDate: new Date(),
        },
        compensation: {
          baseAmount: 3000,
          currency: 'USD',
          frequency: 'monthly',
        },
      })
    ).rejects.toThrow(ValidationError);
  });

  it('should enforce unique employeeId per organization', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Attempt to create another with same employeeId
    await expect(
      createGuestEmployee({
        employeeId: 'DRIVER-001', // Duplicate
        email: 'driver2@company.com',
        name: 'Jane Driver',
        baseSalary: 3200,
      })
    ).rejects.toThrow();
  });

  it('should allow guest employee with employeeId only (no email)', async () => {
    const employee = await payroll.hire({
      organizationId: ORG_ID,
      employment: {
        employeeId: 'WORKER-001',
        name: 'Temporary Worker',
        position: 'Worker',
        department: 'operations',
        type: 'contract',
        joinDate: new Date(),
      },
      compensation: {
        baseAmount: 2500,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    expect(employee.userId).toBeUndefined();
    expect(employee.email).toBeUndefined();
    expect(employee.employeeId).toBe('WORKER-001');
  });
});

// ============================================================================
// Identity Lookup Mode Tests
// ============================================================================

describe('Identity Lookup Modes', () => {
  it('should lookup by employeeId (primary mode)', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const found = await payroll.getEmployeeByIdentity({
      identity: 'DRIVER-001',
      organizationId: ORG_ID,
      mode: 'employeeId',
    });

    expect(found.employeeId).toBe('DRIVER-001');
  });

  it('should lookup by email for guest employees', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const found = await payroll.getEmployeeByIdentity({
      identity: 'driver1@company.com',
      organizationId: ORG_ID,
      mode: 'email',
    });

    expect(found.email).toBe('driver1@company.com');
  });

  it('should lookup by userId for user-linked employees', async () => {
    await createUserLinkedEmployee({
      userId: USER_ID,
      employeeId: 'MGR-001',
      name: 'Jane Manager',
      baseSalary: 8000,
    });

    const found = await payroll.getEmployeeByIdentity({
      identity: USER_ID,
      organizationId: ORG_ID,
      mode: 'userId',
      populateUser: false, // Don't populate to get raw ObjectId
    });

    expect(found.userId).toBeDefined();
    // Convert both to strings for comparison since one might be an ObjectId
    const foundUserId = found.userId?.toString ? found.userId.toString() : String(found.userId);
    expect(foundUserId).toBe(USER_ID.toString());
  });

  it('should use "any" mode to try all lookup methods', async () => {
    const guest = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Should find by employeeId
    const found1 = await payroll.getEmployeeByIdentity({
      identity: 'DRIVER-001',
      organizationId: ORG_ID,
      mode: 'any',
    });
    expect(found1._id.toString()).toBe(guest._id.toString());

    // Should find by email
    const found2 = await payroll.getEmployeeByIdentity({
      identity: 'driver1@company.com',
      organizationId: ORG_ID,
      mode: 'any',
    });
    expect(found2._id.toString()).toBe(guest._id.toString());
  });

  it('should throw EmployeeNotFoundError when identity not found', async () => {
    await expect(
      payroll.getEmployeeByIdentity({
        identity: 'NON-EXISTENT',
        organizationId: ORG_ID,
        mode: 'employeeId',
      })
    ).rejects.toThrow(EmployeeNotFoundError);
  });
});

// ============================================================================
// Identity Fallback Chain Tests
// ============================================================================

describe('Identity Fallback Chain', () => {
  it('should use fallback chain when primary lookup fails', async () => {
    // Create guest employee
    const guest = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Primary mode is employeeId, but we search by email
    // Should fallback to email mode
    const found = await payroll.getEmployeeByIdentity({
      identity: 'driver1@company.com',
      organizationId: ORG_ID,
      // Uses default mode + fallbacks from config
    });

    expect(found._id.toString()).toBe(guest._id.toString());
  });

  it('should try all modes in fallback chain', async () => {
    // Create user-linked employee
    const user = await createUserLinkedEmployee({
      userId: USER_ID,
      employeeId: 'MGR-001',
      email: 'manager@company.com',
      name: 'Jane Manager',
      baseSalary: 8000,
    });

    // Search by userId (should be in fallback chain)
    const found = await payroll.getEmployeeByIdentity({
      identity: USER_ID,
      organizationId: ORG_ID,
    });

    expect(found._id.toString()).toBe(user._id.toString());
  });

  it('should handle invalid ObjectId in userId mode gracefully', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Pass invalid ObjectId string - should skip userId mode and try employeeId
    const found = await payroll.getEmployeeByIdentity({
      identity: 'DRIVER-001', // Not a valid ObjectId
      organizationId: ORG_ID,
    });

    expect(found.employeeId).toBe('DRIVER-001');
  });
});

// ============================================================================
// Sparse Index Behavior Tests
// ============================================================================

describe('Sparse Index Behavior', () => {
  it('should allow multiple employees with null userId in same org', async () => {
    const driver1 = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const driver2 = await createGuestEmployee({
      employeeId: 'DRIVER-002',
      email: 'driver2@company.com',
      name: 'Jane Driver',
      baseSalary: 3200,
    });

    const driver3 = await createGuestEmployee({
      employeeId: 'DRIVER-003',
      email: 'driver3@company.com',
      name: 'Bob Driver',
      baseSalary: 3100,
    });

    expect(driver1.userId).toBeUndefined();
    expect(driver2.userId).toBeUndefined();
    expect(driver3.userId).toBeUndefined();
  });

  it('should enforce unique userId per organization', async () => {
    await createUserLinkedEmployee({
      userId: USER_ID,
      employeeId: 'MGR-001',
      name: 'Jane Manager',
      baseSalary: 8000,
    });

    // Attempt to create another employee with same userId in same org
    await expect(
      createUserLinkedEmployee({
        userId: USER_ID, // Duplicate
        employeeId: 'MGR-002',
        name: 'John Manager',
        baseSalary: 8500,
      })
    ).rejects.toThrow();
  });

  it('should allow same userId in different organizations', async () => {
    const org1 = new mongoose.Types.ObjectId();
    const org2 = new mongoose.Types.ObjectId();

    const emp1 = await payroll.hire({
      userId: USER_ID,
      organizationId: org1,
      employment: {
        employeeId: 'EMP-001',
        name: 'John Doe',
        position: 'Manager',
        department: 'management',
        type: 'full_time',
        joinDate: new Date(),
      },
      compensation: {
        baseAmount: 8000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    const emp2 = await payroll.hire({
      userId: USER_ID, // Same userId, different org
      organizationId: org2,
      employment: {
        employeeId: 'EMP-001',
        name: 'John Doe',
        position: 'Manager',
        department: 'management',
        type: 'full_time',
        joinDate: new Date(),
      },
      compensation: {
        baseAmount: 8000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    expect(emp1.userId?.toString()).toBe(USER_ID.toString());
    expect(emp2.userId?.toString()).toBe(USER_ID.toString());
    expect(emp1.organizationId.toString()).not.toBe(emp2.organizationId.toString());
  });
});

// ============================================================================
// Mixed Employee Types Tests
// ============================================================================

describe('Mixed Guest and User-Linked Employees', () => {
  it('should handle organization with both guest and user-linked employees', async () => {
    // Create User documents first (required for population to work)
    await User.create([
      { _id: USER_ID, name: 'Jane Manager', email: 'jane@company.com' },
      { _id: USER_ID_2, name: 'Bob Staff', email: 'bob@company.com' },
    ]);

    // Create user-linked employees
    const manager = await createUserLinkedEmployee({
      userId: USER_ID,
      employeeId: 'MGR-001',
      name: 'Jane Manager',
      baseSalary: 8000,
    });

    const staff = await createUserLinkedEmployee({
      userId: USER_ID_2,
      employeeId: 'STAFF-001',
      name: 'Bob Staff',
      baseSalary: 5000,
    });

    // Create guest employees
    const driver1 = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const driver2 = await createGuestEmployee({
      employeeId: 'DRIVER-002',
      email: 'driver2@company.com',
      name: 'Jane Driver',
      baseSalary: 3200,
    });

    // Verify counts using Model.find() directly (users should use Repository for CRUD)
    const docs = await Employee.find({ organizationId: ORG_ID });

    expect(docs.length).toBe(4);

    const guestCount = docs.filter((e: any) => !e.userId).length;
    const userLinkedCount = docs.filter((e: any) => e.userId).length;

    expect(guestCount).toBe(2);
    expect(userLinkedCount).toBe(2);
  });

  it('should find guest employees separately', async () => {
    await createUserLinkedEmployee({
      userId: USER_ID,
      employeeId: 'MGR-001',
      name: 'Jane Manager',
      baseSalary: 8000,
    });

    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    await createGuestEmployee({
      employeeId: 'DRIVER-002',
      email: 'driver2@company.com',
      name: 'Jane Driver',
      baseSalary: 3200,
    });

    // Find guest employees using query builder
    const EmployeeModel = payroll.models.EmployeeModel;
    const guestEmployees = await EmployeeModel.find({
      organizationId: ORG_ID,
      userId: { $exists: false },  // Query for documents without userId field
    });

    expect(guestEmployees.length).toBe(2);
    guestEmployees.forEach(emp => {
      expect(emp.userId).toBeUndefined();
      expect(emp.email).toBeDefined();
    });
  });
});

// ============================================================================
// Payroll Processing Tests
// ============================================================================

describe('Payroll Processing for Guest Employees', () => {
  it('should process salary for guest employee', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const result = await payroll.processSalary({
      employeeId: driver._id,
      organizationId: ORG_ID,
      month: 3,
      year: 2024,
    });

    expect(result.payrollRecord).toBeDefined();
    expect(result.payrollRecord.employeeId.toString()).toBe(driver._id.toString());
    expect(result.payrollRecord.userId).toBeUndefined();
    expect(result.payrollRecord.breakdown.netSalary).toBeGreaterThan(0);
  });

  it('should process bulk payroll with mixed employee types', async () => {
    // Create mixed employees
    await createUserLinkedEmployee({
      userId: USER_ID,
      employeeId: 'MGR-001',
      name: 'Jane Manager',
      baseSalary: 8000,
    });

    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    await createGuestEmployee({
      employeeId: 'DRIVER-002',
      email: 'driver2@company.com',
      name: 'Jane Driver',
      baseSalary: 3200,
    });

    const result = await payroll.processBulkPayroll({
      organizationId: ORG_ID,
      month: 3,
      year: 2024,
    });

    expect(result.total).toBe(3);
    expect(result.successful.length).toBe(3);
    expect(result.failed.length).toBe(0);
  });

  it('should create transaction for guest employee salary', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const result = await payroll.processSalary({
      employeeId: driver._id,
      organizationId: ORG_ID,
      month: 3,
      year: 2024,
    });

    // Verify transaction was created
    expect(result.transaction).toBeDefined();
    if (result.transaction) {
      expect(result.transaction.amount).toBeGreaterThan(0);
      expect(result.transaction.type).toBe('salary');  // type is 'salary', not 'expense'
      expect(result.transaction.flow).toBe('outflow'); // payroll is an outflow
      expect(result.transaction.organizationId.toString()).toBe(ORG_ID.toString());

      // Transaction should have sourceId and sourceModel
      expect(result.transaction.sourceId).toBeDefined();
      expect(result.transaction.sourceModel).toBe('PayrollRecord');
      expect(result.transaction.sourceId?.toString()).toBe(result.payrollRecord._id.toString());

      // For guest employees, userId in transaction should be undefined
      expect(result.transaction.userId).toBeUndefined();

      // Should have employee reference
      expect(result.transaction.employeeId).toBeDefined();
      expect(result.transaction.employeeId?.toString()).toBe(driver._id.toString());
    }
  });

  it('should include employee identity in transaction metadata', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const result = await payroll.processSalary({
      employeeId: driver._id,
      organizationId: ORG_ID,
      month: 3,
      year: 2024,
    });

    if (result.transaction) {
      expect(result.transaction.metadata).toBeDefined();
      expect(result.transaction.metadata?.employeeId).toBe('DRIVER-001');
      expect(result.transaction.metadata?.email).toBe('driver1@company.com');
      // Note: employeeName not stored for guest employees (name is only in employment.name during hire)
      // For complete employee info, query the employee document
    }
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle email case insensitivity', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'Driver1@Company.COM',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Search with different case
    const found = await payroll.getEmployeeByIdentity({
      identity: 'driver1@company.com',
      organizationId: ORG_ID,
      mode: 'email',
    });

    expect(found.email).toBe('driver1@company.com'); // Stored as lowercase
  });

  it('should handle whitespace in email', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: '  driver1@company.com  ',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const found = await payroll.getEmployeeByIdentity({
      identity: 'driver1@company.com',
      organizationId: ORG_ID,
      mode: 'email',
    });

    expect(found.email).toBe('driver1@company.com'); // Trimmed
  });

  it('should prevent duplicate emails per organization', async () => {
    await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Attempt to create another with same email
    // Should throw duplicate key error from MongoDB unique index
    await expect(
      createGuestEmployee({
        employeeId: 'DRIVER-002',
        email: 'driver@company.com', // Duplicate email
        name: 'Jane Driver',
        baseSalary: 3200,
      })
    ).rejects.toThrow(/duplicate|E11000/i);
  });

  it('should allow same email in different organizations', async () => {
    const org1 = new mongoose.Types.ObjectId();
    const org2 = new mongoose.Types.ObjectId();

    const emp1 = await payroll.hire({
      organizationId: org1,
      employment: {
        employeeId: 'DRIVER-001',
        email: 'driver@company.com',
        name: 'John Driver',
        position: 'Driver',
        department: 'operations',
        type: 'contract',
        joinDate: new Date(),
      },
      compensation: {
        baseAmount: 3000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    const emp2 = await payroll.hire({
      organizationId: org2,
      employment: {
        employeeId: 'DRIVER-001',
        email: 'driver@company.com', // Same email, different org
        name: 'John Driver',
        position: 'Driver',
        department: 'operations',
        type: 'contract',
        joinDate: new Date(),
      },
      compensation: {
        baseAmount: 3000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    expect(emp1.email).toBe('driver@company.com');
    expect(emp2.email).toBe('driver@company.com');
    expect(emp1.organizationId.toString()).not.toBe(emp2.organizationId.toString());
  });

  it('should handle guest employee termination', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    // Terminate guest employee
    const terminated = await payroll.terminate({
      employeeId: driver._id,
      organizationId: ORG_ID,
      terminationDate: new Date('2024-03-31'),
      reason: 'contract_end',  // Valid enum value
    });

    expect(terminated.status).toBe('terminated');
    expect(terminated.userId).toBeUndefined();
    expect(terminated.email).toBe('driver1@company.com');
  });

  it('should handle guest employee rehire with new employeeId', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    await payroll.terminate({
      employeeId: driver._id,
      organizationId: ORG_ID,
      terminationDate: new Date('2024-03-31'),
      reason: 'contract_end',  // Valid enum value
    });

    // Rehire with new employeeId (since old one is taken)
    const rehired = await createGuestEmployee({
      employeeId: 'DRIVER-001-R', // New employeeId
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3200,
    });

    expect(rehired.employeeId).toBe('DRIVER-001-R');
    expect(rehired.email).toBe('driver1@company.com');
    expect(rehired._id.toString()).not.toBe(driver._id.toString());
  });

  it('should update guest employee compensation', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    await payroll.updateSalary({
      employeeId: driver._id,
      organizationId: ORG_ID,
      compensation: {
        baseAmount: 3500,
        effectiveFrom: new Date('2024-04-01'),
      },
    });

    const updated = await payroll.getEmployee({
      employeeId: driver._id,
      organizationId: ORG_ID,
    });

    expect(updated.compensation.baseAmount).toBe(3500);
  });

  it('should handle populateUser option for guest employees', async () => {
    const driver = await createGuestEmployee({
      employeeId: 'DRIVER-001',
      email: 'driver1@company.com',
      name: 'John Driver',
      baseSalary: 3000,
    });

    const found = await payroll.getEmployeeByIdentity({
      identity: 'DRIVER-001',
      organizationId: ORG_ID,
      populateUser: true, // Should not fail even though userId is undefined
    });

    expect(found._id.toString()).toBe(driver._id.toString());
    expect(found.userId).toBeUndefined();
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Identity Configuration', () => {
  it('should respect requireUserId config when set to true', async () => {
    // Create new payroll instance with requireUserId: true
    const strictPayroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
      })
      .withConfig({
        validation: {
          requireUserId: true, // Require userId
        },
      })
      .build();

    // Attempt to create guest employee should fail
    await expect(
      strictPayroll.hire({
        organizationId: ORG_ID,
        employment: {
          employeeId: 'DRIVER-001',
          email: 'driver1@company.com',
          name: 'John Driver',
          position: 'Driver',
          department: 'operations',
          type: 'contract',
          joinDate: new Date(),
        },
        compensation: {
          baseAmount: 3000,
          currency: 'USD',
          frequency: 'monthly',
        },
      })
    ).rejects.toThrow(ValidationError);
  });

  it('should use custom identity mode', async () => {
    // Create payroll with email as primary mode
    const emailPayroll = createPayrollInstance()
      .withModels({
        EmployeeModel: Employee,
        PayrollRecordModel: PayrollRecord,
        TransactionModel: Transaction,
      })
      .withConfig({
        validation: {
          requireUserId: false,
          identityMode: 'email', // Email as primary
          identityFallbacks: ['employeeId', 'userId'],
        },
      })
      .build();

    const driver = await emailPayroll.hire({
      organizationId: ORG_ID,
      employment: {
        employeeId: 'DRIVER-001',
        email: 'driver1@company.com',
        name: 'John Driver',
        position: 'Driver',
        department: 'operations',
        type: 'contract',
        joinDate: new Date(),
      },
      compensation: {
        baseAmount: 3000,
        currency: 'USD',
        frequency: 'monthly',
      },
    });

    // Should find by email as primary mode
    const found = await emailPayroll.getEmployeeByIdentity({
      identity: 'driver1@company.com',
      organizationId: ORG_ID,
    });

    expect(found._id.toString()).toBe(driver._id.toString());
  });
});

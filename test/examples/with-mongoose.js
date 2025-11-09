/**
 * Example with Mongoose Integration
 *
 * This shows how to use the library schemas with Mongoose models
 * NOTE: Requires mongoose to be installed
 *
 * Run: node test/examples/with-mongoose.js
 */

import mongoose from 'mongoose';
import {
  employmentFields,
  allowanceSchema,
  deductionSchema,
  compensationSchema,
  workScheduleSchema,
  bankDetailsSchema,
  employmentHistorySchema,
  payrollStatsSchema,
  employeePlugin,
  EMPLOYMENT_TYPE,
  EMPLOYEE_STATUS,
  DEPARTMENT,
} from '../../src/index.js';

console.log('🔗 Testing Mongoose Integration...\n');

// Example 1: Create Employee model with employment fields and plugin
const EmployeeSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },

  // Employment fields from the library
  ...employmentFields,

  // Additional custom fields
  customField: String,
});

// Apply the employee plugin for additional functionality
EmployeeSchema.plugin(employeePlugin);

console.log('✅ Employee schema created with employment fields\n');

// Example 2: Show schema structure
console.log('📋 Employment Fields Structure:');
console.log('- Employment Type:', employmentFields.employmentType?.enum);
console.log('- Status:', employmentFields.status?.enum);
console.log('- Department:', employmentFields.department?.enum);

console.log('\n📋 Available Schemas:');
console.log('- allowanceSchema:', typeof allowanceSchema);
console.log('- deductionSchema:', typeof deductionSchema);
console.log('- compensationSchema:', typeof compensationSchema);
console.log('- workScheduleSchema:', typeof workScheduleSchema);
console.log('- bankDetailsSchema:', typeof bankDetailsSchema);
console.log('- employmentHistorySchema:', typeof employmentHistorySchema);
console.log('- payrollStatsSchema:', typeof payrollStatsSchema);

// Example 3: Show how to use nested schemas
console.log('\n📝 Example usage in your model:');
console.log(`
const EmployeeSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: 'User', required: true },
  organizationId: { type: ObjectId, ref: 'Organization', required: true },

  // Add all employment fields
  ...employmentFields,

  // Or use individual nested schemas
  compensation: compensationSchema,
  bankDetails: bankDetailsSchema,
  workSchedule: workScheduleSchema,
  employmentHistory: [employmentHistorySchema],
  payrollStats: payrollStatsSchema,
});

// Apply the plugin for additional methods
EmployeeSchema.plugin(employeePlugin);

const Employee = mongoose.model('Employee', EmployeeSchema);
`);

console.log('\n💡 To test with real database:');
console.log(`
import { initializeHRM, employeePlugin } from '@classytic/payroll';

// 1. Create your models
const Employee = mongoose.model('Employee', EmployeeSchema);
const PayrollRecord = mongoose.model('PayrollRecord', PayrollRecordSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// 2. Connect to MongoDB
await mongoose.connect('mongodb://localhost:27017/your-db');

// 3. Initialize HRM with your models
initializeHRM({
  EmployeeModel: Employee,
  PayrollRecordModel: PayrollRecord,
  TransactionModel: Transaction,
});

// 4. Create an employee
const employee = await Employee.create({
  userId: someUserId,
  organizationId: someOrgId,
  employmentType: EMPLOYMENT_TYPE.FULL_TIME,
  status: EMPLOYEE_STATUS.ACTIVE,
  department: DEPARTMENT.TRAINING,
  joinDate: new Date(),
  compensation: {
    baseSalary: 50000,
    currency: 'BDT',
    paymentFrequency: PAYMENT_FREQUENCY.MONTHLY,
    allowances: [
      { type: 'housing', amount: 5000, isFixed: true }
    ]
  }
});

console.log('Employee created:', employee);
`);

console.log('\n🎉 Schema test completed!');

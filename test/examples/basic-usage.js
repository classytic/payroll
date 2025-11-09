/**
 * Basic Usage Example for @classytic/payroll
 *
 * This example demonstrates how to import and use the HRM/Payroll library
 * Run this file: node test/examples/basic-usage.js
 */

// Import enums and utilities
import {
  EMPLOYMENT_TYPE,
  EMPLOYEE_STATUS,
  DEPARTMENT,
  PAYMENT_FREQUENCY,
  ALLOWANCE_TYPE,
  DEDUCTION_TYPE,
} from '../../src/index.js';

// Import utilities
import {
  calculateGross,
  calculateNet,
  sumAllowances,
  sumDeductions,
  calculateProbationEnd,
  canReceiveSalary,
} from '../../src/index.js';

console.log('✅ @classytic/payroll library loaded successfully!\n');

// Example 1: Check enums
console.log('📋 Employment Types:');
console.log('- Full Time:', EMPLOYMENT_TYPE.FULL_TIME);
console.log('- Part Time:', EMPLOYMENT_TYPE.PART_TIME);
console.log('- Contract:', EMPLOYMENT_TYPE.CONTRACT);

console.log('\n👤 Employee Status:');
console.log('- Active:', EMPLOYEE_STATUS.ACTIVE);
console.log('- On Leave:', EMPLOYEE_STATUS.ON_LEAVE);
console.log('- Terminated:', EMPLOYEE_STATUS.TERMINATED);

console.log('\n🏢 Departments:');
console.log('- Management:', DEPARTMENT.MANAGEMENT);
console.log('- Training:', DEPARTMENT.TRAINING);
console.log('- Sales:', DEPARTMENT.SALES);

console.log('\n💰 Payment Frequency:');
console.log('- Monthly:', PAYMENT_FREQUENCY.MONTHLY);
console.log('- Bi-Weekly:', PAYMENT_FREQUENCY.BI_WEEKLY);
console.log('- Weekly:', PAYMENT_FREQUENCY.WEEKLY);

// Example 2: Test utility functions
console.log('\n🧮 Calculation Utilities:');

const allowances = [
  { type: ALLOWANCE_TYPE.HOUSING, amount: 5000 },
  { type: ALLOWANCE_TYPE.TRANSPORT, amount: 2000 },
  { type: ALLOWANCE_TYPE.MEAL, amount: 1500 },
];

const deductions = [
  { type: DEDUCTION_TYPE.TAX, amount: 3000 },
  { type: DEDUCTION_TYPE.PROVIDENT_FUND, amount: 1000 },
];

const baseSalary = 50000;
const totalAllowances = sumAllowances(allowances);
const totalDeductions = sumDeductions(deductions);
const grossSalary = calculateGross(baseSalary, allowances);
const netSalary = calculateNet(grossSalary, deductions);

console.log('- Base Salary:', baseSalary, 'BDT');
console.log('- Total Allowances:', totalAllowances, 'BDT');
console.log('- Total Deductions:', totalDeductions, 'BDT');
console.log('- Gross Salary:', grossSalary, 'BDT');
console.log('- Net Salary:', netSalary, 'BDT');

// Example 3: Date utilities
console.log('\n📅 Date Utilities:');
const joinDate = new Date('2024-01-01');
const probationEnd = calculateProbationEnd(joinDate, 3); // 3 months probation
console.log('- Join Date:', joinDate.toDateString());
console.log('- Probation End:', probationEnd.toDateString());

// Example 4: Validation utilities
console.log('\n✅ Validation Utilities:');
const activeEmployee = { status: EMPLOYEE_STATUS.ACTIVE };
const terminatedEmployee = { status: EMPLOYEE_STATUS.TERMINATED };
console.log('- Active employee can receive salary:', canReceiveSalary(activeEmployee));
console.log('- Terminated employee can receive salary:', canReceiveSalary(terminatedEmployee));

console.log('\n✨ Library is working! You can now use these in your app.\n');

// Example 5: Import examples
console.log('📝 How to use in your project:');
console.log(`
// 1. Install the package
npm install @classytic/payroll

// 2. Import what you need
import {
  initializeHRM,
  EMPLOYMENT_TYPE,
  EMPLOYEE_STATUS,
  createEmployee,
  calculateGross,
  EmployeeService,
  PayrollService,
} from '@classytic/payroll';

// 3. Initialize with your models
initializeHRM({
  EmployeeModel: Employee,      // Your mongoose Employee model
  PayrollRecordModel: PayrollRecord,
  TransactionModel: Transaction,
  AttendanceModel: Attendance,  // Optional
});

// 4. Use the services
const employeeService = createEmployeeService();
const payrollService = createPayrollService();
`);

console.log('🎉 Test completed successfully!');

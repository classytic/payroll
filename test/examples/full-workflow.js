/**
 * Full HRM Workflow Example
 *
 * This demonstrates a complete workflow:
 * - Creating employee data
 * - Calculating compensation
 * - Generating payroll
 * - Using query builders
 *
 * Run: node test/examples/full-workflow.js
 */

import {
  // Enums
  EMPLOYMENT_TYPE,
  DEPARTMENT,
  ALLOWANCE_TYPE,
  DEDUCTION_TYPE,

  // Factories
  EmployeeBuilder,
  CompensationBuilder,
  PayrollBuilder,

  // Utilities
  sumAllowances,
  sumDeductions,

  // Query Builders
  EmployeeQueryBuilder,
  PayrollQueryBuilder,
  CompensationFactory,
} from '../../src/index.js';

console.log('🚀 Full HRM Workflow Example\n');

// ============================================
// STEP 1: Create Employee Data
// ============================================
console.log('👤 Step 1: Building Employee Data');

const employeeData = new EmployeeBuilder()
  .forUser('user123')
  .inOrganization('org456')
  .withEmployeeId('EMP-001')
  .asDepartment(DEPARTMENT.TRAINING)
  .asPosition('Senior Trainer')
  .withEmploymentType(EMPLOYMENT_TYPE.FULL_TIME)
  .hiredOn(new Date('2024-01-01'))
  .withProbation(3)
  .withBaseSalary(50000, 'monthly', 'BDT')
  .addAllowance(ALLOWANCE_TYPE.HOUSING, 10000, 'Housing Allowance')
  .addAllowance(ALLOWANCE_TYPE.TRANSPORT, 5000, 'Transport Allowance')
  .addAllowance(ALLOWANCE_TYPE.MEAL, 3000, 'Meal Allowance')
  .addDeduction(DEDUCTION_TYPE.TAX, 5000, 'Income Tax')
  .addDeduction(DEDUCTION_TYPE.PROVIDENT_FUND, 2500, 'Provident Fund')
  .build();

console.log('✅ Employee created:', {
  employeeId: employeeData.employeeId,
  department: employeeData.department,
  position: employeeData.position,
  employmentType: employeeData.employmentType,
  status: employeeData.status,
});

console.log(`📅 Hire Date: ${employeeData.hireDate.toDateString()}`);
console.log(`📅 Probation ends: ${employeeData.probationEndDate.toDateString()}`);
console.log(`✅ Status: ${employeeData.status}\n`);

// ============================================
// STEP 2: Build Compensation Package
// ============================================
console.log('💼 Step 2: Building Compensation Package');

const compensation = new CompensationBuilder()
  .withBase(50000, 'monthly', 'BDT')
  .addAllowance(ALLOWANCE_TYPE.HOUSING, 10000, false, 'Housing Allowance')
  .addAllowance(ALLOWANCE_TYPE.TRANSPORT, 5000, false, 'Transport Allowance')
  .addAllowance(ALLOWANCE_TYPE.MEAL, 3000, false, 'Meal Allowance')
  .addDeduction(DEDUCTION_TYPE.TAX, 5000, false, 'Income Tax')
  .addDeduction(DEDUCTION_TYPE.PROVIDENT_FUND, 2500, false, 'Provident Fund')
  .build();

console.log('✅ Compensation package created:');
console.log('- Base Salary:', compensation.baseAmount, compensation.currency);
console.log('- Allowances:', compensation.allowances.length);
compensation.allowances.forEach(a => {
  console.log(`  • ${a.name}: ${a.value} ${compensation.currency}`);
});
console.log('- Deductions:', compensation.deductions.length);
compensation.deductions.forEach(d => {
  console.log(`  • ${d.name}: ${d.value} ${compensation.currency}`);
});

// ============================================
// STEP 3: Calculate Salary Breakdown
// ============================================
console.log('\n💰 Step 3: Calculating Salary Breakdown');

const breakdown = CompensationFactory.calculateBreakdown(compensation);

console.log('📊 Salary Breakdown:');
console.log('- Base Amount:', breakdown.baseAmount.toLocaleString(), 'BDT');
console.log('- Total Allowances:', sumAllowances(breakdown.allowances).toLocaleString(), 'BDT');
console.log('- Gross Salary:', breakdown.grossAmount.toLocaleString(), 'BDT');
console.log('- Total Deductions:', sumDeductions(breakdown.deductions).toLocaleString(), 'BDT');
console.log('- Net Salary:', breakdown.netAmount.toLocaleString(), 'BDT');

// ============================================
// STEP 4: Generate Payroll Record
// ============================================
console.log('\n📋 Step 4: Generating Payroll Record');

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

const payrollData = new PayrollBuilder()
  .forEmployee('employee123')
  .inOrganization('org456')
  .withBaseAmount(50000)
  .forPeriod(currentMonth, currentYear)
  .addAllowance(ALLOWANCE_TYPE.HOUSING, 10000, false, 'Housing Allowance')
  .addAllowance(ALLOWANCE_TYPE.TRANSPORT, 5000, false, 'Transport Allowance')
  .addAllowance(ALLOWANCE_TYPE.MEAL, 3000, false, 'Meal Allowance')
  .addDeduction(DEDUCTION_TYPE.TAX, 5000, false, 'Income Tax')
  .addDeduction(DEDUCTION_TYPE.PROVIDENT_FUND, 2500, false, 'Provident Fund')
  .withCurrency('BDT')
  .withPaymentMethod('bank_transfer')
  .withNotes('Regular monthly salary for ' + currentMonth + '/' + currentYear)
  .build();

console.log('✅ Payroll record generated:');
console.log('- Period:', payrollData.period.month + '/' + payrollData.period.year);
console.log('- Period Start:', payrollData.period.startDate.toDateString());
console.log('- Period End:', payrollData.period.endDate.toDateString());
console.log('- Gross:', payrollData.breakdown.grossSalary.toLocaleString(), 'BDT');
console.log('- Net:', payrollData.breakdown.netSalary.toLocaleString(), 'BDT');
console.log('- Status:', payrollData.status);

// ============================================
// STEP 5: Query Builder Examples
// ============================================
console.log('\n🔍 Step 5: Query Builder Examples');

console.log('📝 Example employee queries:');
const activeEmployeesQuery = new EmployeeQueryBuilder()
  .active()
  .inDepartment(DEPARTMENT.TRAINING)
  .build();

console.log('- Active training department employees:', JSON.stringify(activeEmployeesQuery, null, 2));

const fullTimeQuery = new EmployeeQueryBuilder()
  .withEmploymentType(EMPLOYMENT_TYPE.FULL_TIME)
  .hiredAfter(new Date('2024-01-01'))
  .build();

console.log('- Full-time employees hired in 2024:', JSON.stringify(fullTimeQuery, null, 2));

console.log('\n📝 Example payroll queries:');
const pendingPayrollQuery = new PayrollQueryBuilder()
  .forPeriod(currentMonth, currentYear)
  .pending()
  .build();

console.log('- Pending payroll for current period:', JSON.stringify(pendingPayrollQuery, null, 2));

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📊 WORKFLOW SUMMARY');
console.log('='.repeat(60));
console.log('✅ Employee data created');
console.log('✅ Compensation package configured');
console.log('✅ Salary calculations completed');
console.log('✅ Payroll record generated');
console.log('✅ Query builders demonstrated');
console.log('='.repeat(60));

console.log('\n💡 Next Steps:');
console.log(`
1. Initialize HRM with your Mongoose models
2. Use the services to interact with database:
   - employeeService.create(employeeData)
   - payrollService.generatePayroll(...)
3. Apply the employeePlugin to your Employee model
4. Use query builders for complex searches
`);

console.log('🎉 Workflow example completed!\n');

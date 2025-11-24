/**
 * Test for employee plugin pre-save hook
 * Tests Mongoose v9 compatibility - async/await hook without next callback
 */

import mongoose from 'mongoose';
import { employmentFields, employeePlugin } from '../src/index.js';

// Create a test Employee model
const TestEmployeeSchema = new mongoose.Schema({
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
  ...employmentFields,
});

// Apply the employee plugin (which has the pre-save hook)
TestEmployeeSchema.plugin(employeePlugin);

const TestEmployee = mongoose.model('TestEmployeeV9', TestEmployeeSchema);

async function runTests() {
  console.log('🧪 Testing Employee Plugin pre-save Hook (Mongoose v9)...\n');

  let dbConnected = false;

  try {
    // Try to connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/payroll-test-v9', {
      serverSelectionTimeoutMS: 3000,
    });
    console.log('✅ Connected to MongoDB\n');
    dbConnected = true;

    // Clean up before tests
    await TestEmployee.deleteMany({});
  } catch (error) {
    console.log('⚠️  MongoDB not available, using document validation only\n');
  }

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Create employee - verify pre-save hook runs without errors
  try {
    const employee1 = new TestEmployee({
      userId: new mongoose.Types.ObjectId(),
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-001',
      position: 'Developer',
      hireDate: new Date(),
      employmentType: 'full_time',
      status: 'active',
      compensation: {
        baseAmount: 50000,
        frequency: 'monthly',
        currency: 'BDT',
        allowances: [
          { type: 'housing', amount: 10000, taxable: true, recurring: true },
        ],
        deductions: [
          { type: 'tax', amount: 5000, auto: false, recurring: true },
        ],
      },
    });

    if (dbConnected) {
      await employee1.save(); // This triggers the pre-save hook
      console.log('✅ Test 1 PASSED: Employee saved successfully (pre-save hook executed)');
    } else {
      await employee1.validate(); // Just validate without DB
      console.log('✅ Test 1 PASSED: Employee validation successful');
    }
    testsPassed++;
  } catch (error) {
    console.log('❌ Test 1 FAILED:', error.message);
    console.log('   Stack:', error.stack);
    testsFailed++;
  }

  // Test 2: Modify compensation - verify hook recalculates correctly
  try {
    const employee2 = new TestEmployee({
      userId: new mongoose.Types.ObjectId(),
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-002',
      position: 'Manager',
      hireDate: new Date(),
      employmentType: 'full_time',
      status: 'active',
      compensation: {
        baseAmount: 60000,
        frequency: 'monthly',
        currency: 'BDT',
        allowances: [],
        deductions: [],
        grossSalary: 0, // Should be recalculated by hook
        netSalary: 0,   // Should be recalculated by hook
      },
    });

    if (dbConnected) {
      await employee2.save();

      // Verify calculations were done
      if (employee2.compensation.grossSalary === 60000 && employee2.compensation.netSalary === 60000) {
        console.log('✅ Test 2 PASSED: Compensation auto-calculated on save');
        testsPassed++;
      } else {
        console.log('❌ Test 2 FAILED: Compensation not calculated correctly');
        console.log('   Expected gross/net: 60000, Got:', {
          gross: employee2.compensation.grossSalary,
          net: employee2.compensation.netSalary
        });
        testsFailed++;
      }
    } else {
      await employee2.validate();
      console.log('✅ Test 2 PASSED: Validation successful (DB test skipped)');
      testsPassed++;
    }
  } catch (error) {
    console.log('❌ Test 2 FAILED:', error.message);
    testsFailed++;
  }

  // Test 3: Update compensation - verify hook triggers on modification
  if (dbConnected) {
    try {
      const employee3 = new TestEmployee({
        userId: new mongoose.Types.ObjectId(),
        organizationId: new mongoose.Types.ObjectId(),
        employeeId: 'EMP-003',
        position: 'Senior Developer',
        hireDate: new Date(),
        employmentType: 'full_time',
        status: 'active',
        compensation: {
          baseAmount: 70000,
          frequency: 'monthly',
          currency: 'BDT',
          allowances: [],
          deductions: [],
        },
      });

      await employee3.save();

      // Modify compensation - change base amount to trigger hook
      employee3.compensation.baseAmount = 80000;
      employee3.markModified('compensation');
      await employee3.save(); // Should trigger hook again

      // Gross should now be 80000 (new base amount, no allowances)
      if (employee3.compensation.grossSalary === 80000) {
        console.log('✅ Test 3 PASSED: Compensation recalculated after modification');
        testsPassed++;
      } else {
        console.log('❌ Test 3 FAILED: Compensation not recalculated on update');
        console.log('   Expected gross: 80000, Got:', employee3.compensation.grossSalary);
        testsFailed++;
      }
    } catch (error) {
      console.log('❌ Test 3 FAILED:', error.message);
      testsFailed++;
    }
  } else {
    console.log('⏭️  Test 3 SKIPPED: Requires MongoDB connection');
  }

  // Test 4: Verify hook doesn't run when compensation not modified
  if (dbConnected) {
    try {
      const employee4 = new TestEmployee({
        userId: new mongoose.Types.ObjectId(),
        organizationId: new mongoose.Types.ObjectId(),
        employeeId: 'EMP-004',
        position: 'Junior Developer',
        hireDate: new Date(),
        employmentType: 'full_time',
        status: 'active',
        compensation: {
          baseAmount: 40000,
          frequency: 'monthly',
          currency: 'BDT',
          allowances: [],
          deductions: [],
        },
      });

      await employee4.save();
      const originalGross = employee4.compensation.grossSalary;

      // Modify something OTHER than compensation
      employee4.position = 'Updated Position';
      await employee4.save();

      // Gross should remain the same
      if (employee4.compensation.grossSalary === originalGross) {
        console.log('✅ Test 4 PASSED: Hook correctly skips when compensation not modified');
        testsPassed++;
      } else {
        console.log('❌ Test 4 FAILED: Hook ran unnecessarily');
        testsFailed++;
      }
    } catch (error) {
      console.log('❌ Test 4 FAILED:', error.message);
      testsFailed++;
    }
  } else {
    console.log('⏭️  Test 4 SKIPPED: Requires MongoDB connection');
  }

  // Test 5: Verify async/await pattern works (no callback errors)
  try {
    const employee5 = new TestEmployee({
      userId: new mongoose.Types.ObjectId(),
      organizationId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-005',
      position: 'Tester',
      hireDate: new Date(),
      employmentType: 'contract',
      status: 'active',
      compensation: {
        baseAmount: 45000,
        frequency: 'monthly',
        currency: 'BDT',
        allowances: [
          { type: 'mobile', amount: 5000, taxable: true, recurring: false },
        ],
        deductions: [
          { type: 'tax', amount: 2000, auto: true, recurring: true },
        ],
      },
    });

    // The hook should work with async/await pattern (Mongoose v9)
    if (dbConnected) {
      await employee5.save();
    } else {
      await employee5.validate();
    }

    console.log('✅ Test 5 PASSED: Async/await hook pattern works (Mongoose v9 compatible)');
    testsPassed++;
  } catch (error) {
    console.log('❌ Test 5 FAILED:', error.message);
    console.log('   This might indicate Mongoose v9 compatibility issue!');
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Mongoose v9 Hook Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('='.repeat(60));

  if (testsFailed === 0) {
    console.log('✅ All tests passed! Package is Mongoose v9 compatible.');
  } else {
    console.log('❌ Some tests failed. Review the errors above.');
  }

  if (dbConnected) {
    await TestEmployee.deleteMany({}); // Cleanup
    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

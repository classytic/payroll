import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema, employeePlugin } from './dist/index.js';

const { model } = mongoose;

async function testHook() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  
  const employeeSchema = createEmployeeSchema();
  employeeSchema.plugin(employeePlugin);
  const Employee = model('Employee', employeeSchema);
  const PayrollRecord = model('PayrollRecord', createPayrollRecordSchema());
  const Transaction = model('Transaction', new mongoose.Schema({ amount: Number }));
  
  await Employee.init();
  
  const payroll = createPayrollInstance()
    .withModels({ EmployeeModel: Employee, PayrollRecordModel: PayrollRecord, TransactionModel: Transaction })
    .withConfig({ validation: { requireUserId: false } })
    .build();
  
  // Create guest employee
  const emp = await payroll.hire({
    organizationId: new mongoose.Types.ObjectId(),
    employment: {
      employeeId: 'TEST-001',
      email: 'test@test.com',
      name: 'Test',
      position: 'Driver',
      department: 'operations',
      type: 'contract',
      hireDate: new Date(),
    },
    compensation: { baseAmount: 3000, currency: 'USD', frequency: 'monthly' },
  });
  
  // Check raw document
  const raw = await Employee.collection.findOne({ _id: emp._id });
  console.log('Raw document from MongoDB:');
  console.log('userId' in raw ? `userId: ${raw.userId}` : 'userId: [field missing]');
  console.log('email' in raw ? `email: ${raw.email}` : 'email: [field missing]');
  
  await mongoose.disconnect();
  await mongoServer.stop();
}

testHook().catch(console.error);

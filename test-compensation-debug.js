import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createEmployeeSchema, createPayrollRecordSchema, employeePlugin, createPayrollInstance } from './dist/index.js';

const { Schema, model } = mongoose;

async function test() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  
  const employeeSchema = createEmployeeSchema();
  employeeSchema.plugin(employeePlugin);
  const Employee = model('Employee', employeeSchema);
  const PayrollRecord = model('PayrollRecord', createPayrollRecordSchema());
  const Transaction = model('Transaction', new Schema({ amount: Number }, { strict: false }));
  
  const payroll = createPayrollInstance()
    .withModels({ 
      EmployeeModel: Employee,
      PayrollRecordModel: PayrollRecord,
      TransactionModel: Transaction,
    })
    .withConfig({ validation: { requireUserId: false } })
    .build();
  
  const emp = await payroll.hire({
    organizationId: new mongoose.Types.ObjectId(),
    employment: {
      employeeId: 'TEST-001',
      email: 'test@test.com',
      name: 'Test Driver',
      position: 'Driver',
      department: 'operations',
      type: 'contract',
      joinDate: new Date(),
    },
    compensation: {
      baseAmount: 5000,
      currency: 'USD',
      frequency: 'monthly',
    },
  });
  
  console.log('Base Amount from created:', emp.compensation?.baseAmount);
  
  const retrieved = await Employee.findById(emp._id);
  console.log('Base Amount from retrieved:', retrieved?.compensation?.baseAmount);
  
  await mongoose.disconnect();
  await mongoServer.stop();
  process.exit(0);
}

test().catch((err) => { console.error(err); process.exit(1); });

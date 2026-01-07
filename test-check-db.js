import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPayrollInstance, createEmployeeSchema, createPayrollRecordSchema } from './dist/index.js';

const { Schema } = mongoose;

const mongoServer = await MongoMemoryServer.create();
const uri = mongoServer.getUri();
await mongoose.connect(uri);

const employeeSchema = createEmployeeSchema();
const Employee = mongoose.model('Employee', employeeSchema);

const transactionSchema = new Schema({
  organizationId: Schema.Types.ObjectId,
  userId: Schema.Types.ObjectId,
  employeeId: Schema.Types.ObjectId,
  type: String,
  category: String,
  amount: Number,
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

await Employee.init(); // Build indexes

const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel: Employee,
    PayrollRecordModel: mongoose.model('PayrollRecord', createPayrollRecordSchema()),
    TransactionModel: mongoose.model('Transaction', transactionSchema),
  })
  .withConfig({
    validation: {
      requireUserId: false,
      identityMode: 'employeeId',
    },
  })
  .build();

const orgId = new mongoose.Types.ObjectId();

console.log('\n=== Creating first guest employee ===');
const emp1 = await payroll.hire({
  organizationId: orgId,
  employment: {
    employeeId: 'DRIVER-001',
    email: 'driver1@company.com',
    name: 'John Driver',
    position: 'Driver',
    department: 'operations',
    type: 'contract',
  },
  compensation: {
    baseAmount: 3000,
    currency: 'USD',
    frequency: 'monthly',
  },
});

console.log('\n=== Checking raw MongoDB document ===');
const rawDoc1 = await Employee.collection.findOne({ _id: emp1._id });
console.log('Raw doc keys:', Object.keys(rawDoc1));
console.log('Has userId:', 'userId' in rawDoc1);
console.log('userId value:', rawDoc1.userId);

console.log('\n=== Checking all documents in collection ===');
const allDocs = await Employee.collection.find({}).toArray();
console.log('Total documents:', allDocs.length);
allDocs.forEach((doc, i) => {
  console.log(`\nDoc ${i}:`);
  console.log('  _id:', doc._id);
  console.log('  employeeId:', doc.employeeId);
  console.log('  has userId:', 'userId' in doc);
  console.log('  userId value:', doc.userId);
  console.log('  email:', doc.email);
});

console.log('\n=== Trying to create second guest employee ===');
try {
  const emp2 = await payroll.hire({
    organizationId: orgId,
    employment: {
      employeeId: 'DRIVER-002',
      email: 'driver2@company.com',
      name: 'Jane Driver',
      position: 'Driver',
      department: 'operations',
      type: 'contract',
    },
    compensation: {
      baseAmount: 3200,
      currency: 'USD',
      frequency: 'monthly',
    },
  });
  console.log('SUCCESS: Created second employee:', emp2.employeeId);
} catch (err) {
  console.log('ERROR:', err.message);
}

await mongoose.connection.close();
await mongoServer.stop();

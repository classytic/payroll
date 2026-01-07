import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createEmployeeSchema, employeePlugin } from './dist/index.js';

const { model } = mongoose;

async function checkIndexes() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  
  const employeeSchema = createEmployeeSchema();
  employeeSchema.plugin(employeePlugin);
  const Employee = model('Employee', employeeSchema);
  
  // Initialize to create indexes
  await Employee.init();
  
  // List all indexes
  const indexes = await Employee.collection.getIndexes();
  console.log('Indexes created:');
  console.log(JSON.stringify(indexes, null, 2));
  
  await mongoose.disconnect();
  await mongoServer.stop();
}

checkIndexes().catch(console.error);

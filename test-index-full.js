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
  
  await Employee.init();
  
  const indexes = await Employee.collection.listIndexes().toArray();
  console.log('Full index details:');
  indexes.forEach(idx => {
    if (idx.name.includes('userId') || idx.name.includes('email')) {
      console.log(JSON.stringify(idx, null, 2));
    }
  });
  
  await mongoose.disconnect();
  await mongoServer.stop();
}

checkIndexes().catch(console.error);

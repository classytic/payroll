import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createEmployeeSchema } from './dist/index.js';

const mongoServer = await MongoMemoryServer.create();
const uri = mongoServer.getUri();
await mongoose.connect(uri);

const employeeSchema = createEmployeeSchema();
const Employee = mongoose.model('Employee', employeeSchema);

console.log('=== Building indexes ===');
await Employee.init();

console.log('\n=== Checking indexes via Mongoose ===');
const indexes = await Employee.listIndexes();
console.log(JSON.stringify(indexes, null, 2));

console.log('\n=== Checking indexes via MongoDB driver ===');
const mongoIndexes = await Employee.collection.indexes();
console.log(JSON.stringify(mongoIndexes, null, 2));

console.log('\n=== Looking for userId index ===');
const userIdIndex = mongoIndexes.find(idx => idx.name && idx.name.includes('userId'));
if (userIdIndex) {
  console.log('userId index:', JSON.stringify(userIdIndex, null, 2));
  console.log('Is sparse?', userIdIndex.sparse);
  console.log('Is unique?', userIdIndex.unique);
} else {
  console.log('No userId index found!');
}

await mongoose.connection.close();
await mongoServer.stop();

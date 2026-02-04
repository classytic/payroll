/**
 * MongoDB Test Helpers
 *
 * Supports both MongoMemoryServer (default) and localhost MongoDB
 * Set TEST_MONGODB_URI env var to use localhost (e.g., mongodb://localhost:27017/test)
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** Check if using localhost MongoDB */
export const USE_LOCALHOST = !!process.env.TEST_MONGODB_URI;
export const LOCALHOST_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/payroll_test';

/**
 * Create and connect to test database
 *
 * Uses localhost MongoDB if TEST_MONGODB_URI is set, otherwise MongoMemoryServer
 *
 * @param options - Database options
 * @returns MongoDB Memory Server instance (null if using localhost) and connection URI
 */
export async function createTestDatabase(options?: {
  /** Explicit MongoDB version for MMS (default: 7.0.0) */
  version?: string;
  /** Force localhost even without env var */
  forceLocalhost?: boolean;
}): Promise<{ mongoServer: MongoMemoryServer | null; uri: string }> {
  const useLocalhost = options?.forceLocalhost || USE_LOCALHOST;

  if (useLocalhost) {
    // Use localhost MongoDB (supports real transactions with replica set)
    const uri = LOCALHOST_URI;
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      bufferCommands: false,
    });
    return { mongoServer: null, uri };
  }

  // Create MongoDB Memory Server with explicit version to avoid re-downloads
  const mongoServer = await MongoMemoryServer.create({
    binary: {
      version: options?.version || '7.0.0',
    },
  });

  const uri = mongoServer.getUri();

  // Connect with increased timeouts for test environment
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000, // 30s for server selection
    socketTimeoutMS: 45000,           // 45s for socket operations
    connectTimeoutMS: 30000,          // 30s for initial connection
    bufferCommands: false,            // Fail fast instead of buffering
  });

  return { mongoServer, uri };
}

/**
 * Disconnect and cleanup test database
 *
 * @param mongoServer - MongoDB Memory Server instance (null if using localhost)
 */
export async function closeTestDatabase(mongoServer: MongoMemoryServer | null): Promise<void> {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Clear all collections in the current database
 */
export async function clearDatabase(): Promise<void> {
  const collections = mongoose.connection.collections;

  await Promise.all(
    Object.values(collections).map(collection => collection.deleteMany({}))
  );
}

/**
 * Mock mongoose.startSession for tests (MongoMemoryServer only)
 *
 * MongoMemoryServer doesn't support transactions (requires replica set).
 * This mock triggers mongokit's withTransaction fallback to non-transactional mode.
 *
 * NOTE: Does NOT mock when using localhost MongoDB (to test real transactions)
 */
export function mockMongooseSession(): void {
  // Don't mock if using localhost - allow real transaction testing
  if (USE_LOCALHOST) {
    return;
  }

  const mockSession = {
    startTransaction: () => {
      throw new Error('Transaction numbers are only allowed on a replica set member');
    },
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: () => {},
    inTransaction: () => false,
  };
  mongoose.startSession = (async () => mockSession) as any;
}

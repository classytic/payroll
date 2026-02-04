# Test Helpers

Utilities for payroll package tests.

## MongoDB Test Helper

Use `createTestDatabase()` for proper MongoDB Memory Server setup with correct timeouts:

```typescript
import { createTestDatabase, closeTestDatabase, clearDatabase } from './helpers/mongodb.js';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  const db = await createTestDatabase();
  mongoServer = db.mongoServer;

  // Your model setup...
});

afterAll(async () => {
  await closeTestDatabase(mongoServer);
});

beforeEach(async () => {
  await clearDatabase();
});
```

**Benefits:**
- ✅ Proper connection timeouts (30s) prevents "buffering timed out" errors
- ✅ Explicit MongoDB version (7.0.0) avoids re-downloads
- ✅ Centralized configuration
- ✅ Fail-fast with `bufferCommands: false`

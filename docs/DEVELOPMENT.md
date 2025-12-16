# Development Guide

This guide explains how to develop and test the `@classytic/payroll` library locally.

---

## Prerequisites

- Node.js 18+
- npm or pnpm
- TypeScript 5+

---

## Setup

```bash
# Clone and install
cd d:\projects\packages\payroll
npm install

# Build the library
npm run build

# Run tests
npm test
```

---

## Development Workflow

### 1. Make Changes

Edit TypeScript files in `src/`:

```
src/
├── index.ts          # Main exports
├── payroll.ts        # Main Payroll class
├── types.ts          # Type definitions
├── enums.ts          # Enum constants
├── config.ts         # Configuration
├── core/             # Core modules (events, plugins, container)
├── schemas/          # Mongoose schemas
├── factories/        # Data factories
├── services/         # Service layer
├── utils/            # Utility functions
├── errors/           # Error classes
├── plugins/          # Mongoose plugins
└── models/           # Model definitions
```

### 2. Type Check

```bash
# Check for TypeScript errors
npx tsc --noEmit
```

### 3. Build

```bash
# Build the library
npm run build
```

Output goes to `dist/`:
- ESM modules (`.js`)
- TypeScript declarations (`.d.ts`)
- Source maps (`.js.map`)

### 4. Test

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/core.test.ts

# Run with coverage
npm test -- --coverage
```

---

## Using npm link (Recommended)

Link the library to your project for live development.

### Step 1: Link the Library

```bash
cd d:\projects\packages\payroll
npm link
```

### Step 2: Link to Your Project

```bash
cd d:\path\to\your-project
npm link @classytic/payroll
```

### Step 3: Rebuild on Changes

```bash
# In payroll directory - rebuild after changes
npm run build
```

### Step 4: Unlink When Done

```bash
# In your project
npm unlink @classytic/payroll
npm install @classytic/payroll

# In payroll directory
npm unlink
```

---

## Testing in Your Project

```typescript
import { createPayrollInstance } from '@classytic/payroll';

// Create and initialize
const payroll = createPayrollInstance()
  .withModels({
    EmployeeModel,
    PayrollRecordModel,
    TransactionModel,
  })
  .build();

// Test operations
await payroll.hire({
  userId,
  organizationId,
  employment: { position: 'Test', department: 'Engineering' },
  compensation: { baseAmount: 50000 },
});
```

---

## Project Structure

```
@classytic/payroll/
├── src/                    # TypeScript source
│   ├── index.ts           # Main exports
│   ├── payroll.ts         # Payroll class
│   ├── types.ts           # Type definitions
│   ├── enums.ts           # Constants
│   ├── config.ts          # Configuration
│   ├── core/              # Core modules
│   │   ├── container.ts   # DI container
│   │   ├── events.ts      # Event bus
│   │   ├── plugin.ts      # Plugin system
│   │   └── result.ts      # Result type
│   ├── schemas/           # Mongoose schemas
│   ├── factories/         # Data factories
│   ├── services/          # Service layer
│   ├── utils/             # Utilities
│   ├── errors/            # Error classes
│   ├── plugins/           # Mongoose plugins
│   └── models/            # Model definitions
├── dist/                   # Built output (ESM + types)
├── tests/                  # Test files
├── docs/                   # Documentation
├── tsconfig.json          # TypeScript config
├── tsup.config.ts         # Build config
├── vitest.config.ts       # Test config
└── package.json
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build with tsup |
| `npm test` | Run tests with vitest |
| `npm run typecheck` | Type check without emit |
| `npm run lint` | Lint source files |

---

## Adding New Features

### 1. Add Types (if needed)

```typescript
// src/types.ts
export interface NewFeatureParams {
  // ...
}
```

### 2. Implement Feature

```typescript
// src/payroll.ts or appropriate file
async newFeature(params: NewFeatureParams): Promise<Result> {
  // Implementation
}
```

### 3. Export from Index

```typescript
// src/index.ts
export type { NewFeatureParams } from './types.js';
```

### 4. Add Tests

```typescript
// tests/new-feature.test.ts
describe('New Feature', () => {
  it('should work correctly', () => {
    // Test
  });
});
```

### 5. Update Documentation

Add usage examples to README.md.

---

## Common Issues

### "Cannot find module" Error

```bash
# Rebuild the library
npm run build

# Re-link if using npm link
npm link @classytic/payroll
```

### Type Errors

```bash
# Check for errors
npx tsc --noEmit

# Clean and rebuild
rm -rf dist
npm run build
```

### Tests Failing

```bash
# Run with verbose output
npm test -- --reporter=verbose

# Run single test
npm test -- tests/core.test.ts
```

---

## Pre-Publish Checklist

1. [ ] All tests passing (`npm test`)
2. [ ] TypeScript compiles (`npx tsc --noEmit`)
3. [ ] Build succeeds (`npm run build`)
4. [ ] README.md updated
5. [ ] Version bumped (`npm version patch|minor|major`)
6. [ ] Git committed and tagged

---

## Related Docs

- [README.md](../README.md) - Main documentation
- [NPM_GUIDE.md](../NPM_GUIDE.md) - Publishing workflow
- [INTEGRATION.md](./INTEGRATION.md) - Attendance integration

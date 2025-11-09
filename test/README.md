# Test & Examples

This folder contains examples and tests for the @classytic/payroll library.

## Quick Start

```bash
# Run basic usage example
npm run example:basic

# Run mongoose integration example
npm run example:mongoose

# Run full workflow example
npm run example:workflow

# Run all examples
npm test
```

## Examples Available

### 1. Basic Usage (`examples/basic-usage.js`)
Demonstrates importing and using core library features:
- Enums (employment types, statuses, departments)
- Calculation utilities (gross salary, net salary)
- Date utilities (probation period, pay periods)
- Validation utilities

```bash
node test/examples/basic-usage.js
```

**What you'll learn:**
- How to import enums and constants
- Calculate salaries with allowances and deductions
- Work with date utilities
- Validate employee status

---

### 2. Mongoose Integration (`examples/with-mongoose.js`)
Shows how to use library schemas with Mongoose models:
- Employment fields
- Schema definitions (allowance, deduction, compensation)
- Employee plugin usage
- Model creation

```bash
node test/examples/with-mongoose.js
```

**What you'll learn:**
- Integrate schemas into your Mongoose models
- Use the employee plugin
- Structure employee documents
- Define compensation packages

---

### 3. Full Workflow (`examples/full-workflow.js`)
Complete end-to-end HRM workflow demonstration:
- Building employee data with EmployeeBuilder
- Creating compensation packages with CompensationBuilder
- Generating payroll records with PayrollBuilder
- Using query builders for database queries

```bash
node test/examples/full-workflow.js
```

**What you'll learn:**
- Use factory builders for clean object creation
- Calculate complete salary breakdowns
- Generate payroll records
- Build complex queries with QueryBuilder

---

## Adding Your Own Tests

Create new example files in the `test/examples/` folder:

```javascript
// test/examples/my-test.js
import { EmployeeBuilder, calculateGross } from '../../src/index.js';

const employee = new EmployeeBuilder()
  .setBasicInfo({ firstName: 'Jane', lastName: 'Doe' })
  .build();

console.log('Employee:', employee);
```

Run it:
```bash
node test/examples/my-test.js
```

---

## Testing Without Database

All examples can run without a database connection. They demonstrate:
- Pure utility functions
- Data builders and factories
- Schema structures
- Query builders (returns query objects, doesn't execute)

To use with real database, see [DEVELOPMENT.md](../DEVELOPMENT.md) for setup instructions.

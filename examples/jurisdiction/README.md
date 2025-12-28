# Jurisdiction Extension Examples

⚠️ **These are EXAMPLES for extending base country jurisdictions to add state/city rules.**

**See:** [../jurisdiction-data/](../jurisdiction-data/) for base country examples

## State/Province Customization

The jurisdiction system uses a **multi-level approach**:

1. **Country level** - Your app defines (see `jurisdiction-data/`)
2. **State/province level** - Your app extends (examples here)
3. **City level (optional)** - Your app extends when needed

## California Example

Shows how to extend US federal jurisdiction for California-specific rules:
- [california.ts](./california.ts)

### Key California Differences

- **Minimum wage:** $16/hour (vs $7.25 federal)
- **Overtime:** Daily threshold (8 hours) vs federal weekly (40 hours)
- **Double time:** After 12 hours daily
- **Paid sick leave:** Mandated (not federal requirement)
- **Meal/rest breaks:** Stricter requirements
- **State income tax:** In addition to federal

## How to Use These Examples

### 1. Copy to Your App

```typescript
// your-app/src/jurisdictions/california.ts
import { extendJurisdiction } from '@classytic/payroll/jurisdiction';
import { US_FEDERAL } from './us-federal'; // Your base country

export const CALIFORNIA = extendJurisdiction(US_FEDERAL, {
  id: 'US:CA',
  name: 'California',
  // Override state-specific fields
  wage: {
    minimumWage: { amount: 16, effectiveDate: new Date('2024-01-01') },
  },
  overtime: {
    standard: {
      threshold: 8, // Daily, not weekly
      multiplier: 1.5,
      basis: 'daily',
      doubleTimeThreshold: 12,
      doubleTimeMultiplier: 2.0,
    },
  },
  // ... more CA-specific rules
});
```

### 2. Register at Startup

```typescript
// your-app/src/index.ts
import { registerJurisdictions } from '@classytic/payroll/jurisdiction';
import { US_FEDERAL } from './jurisdictions/us-federal';
import { CALIFORNIA } from './jurisdictions/california';
import { NEW_YORK } from './jurisdictions/new-york';

registerJurisdictions([
  US_FEDERAL,
  CALIFORNIA,
  NEW_YORK,
]);
```

### 3. Use in Calculations

```typescript
import { calculateJurisdictionTax } from '@classytic/payroll/jurisdiction';

// California employee
const caTax = calculateJurisdictionTax({
  annualIncome: 100000,
  jurisdiction: { country: 'US', state: 'CA' },
});

// Uses federal + California state tax
console.log('Federal tax:', caTax.incomeTax);
console.log('State details:', /* CA overrides */);
```

## Common State Customizations

### Minimum Wage Variations

Most states have higher minimum wage than federal:

```typescript
wage: {
  minimumWage: {
    amount: 15.74, // Washington State 2024
    effectiveDate: new Date('2024-01-01'),
  },
}
```

### Overtime Rules

Some states use daily overtime (CA, CO, NV):

```typescript
overtime: {
  standard: {
    threshold: 8, // Daily hours
    multiplier: 1.5,
    basis: 'daily',
  },
}
```

### State Income Tax

Add state tax brackets:

```typescript
tax: {
  incomeTax: [
    { min: 0, max: 10000, rate: 0.01 },
    { min: 10000, max: 20000, rate: 0.02 },
    // ... state brackets
  ],
  // Inherits federal social security, medicare, etc.
}
```

### Paid Leave Requirements

Some states mandate paid sick leave:

```typescript
leave: {
  sickLeave: {
    days: 5, // California minimum
    accrual: 'per-hour',
    accrualRate: 1 / 30,
  },
}
```

## City-Level Customization

Some cities have their own rules (e.g., Seattle, San Francisco):

```typescript
import { extendJurisdiction } from '@classytic/payroll/jurisdiction';
import { CALIFORNIA } from './california';

export const SAN_FRANCISCO = extendJurisdiction(CALIFORNIA, {
  id: 'US:CA:SF',
  name: 'San Francisco',
  parent: 'US:CA',
  level: 'city',
  wage: {
    minimumWage: {
      amount: 18.07, // SF minimum wage (2024)
      effectiveDate: new Date('2024-07-01'),
    },
  },
});
```

Usage:

```typescript
const sfTax = calculateJurisdictionTax({
  annualIncome: 100000,
  jurisdiction: { country: 'US', state: 'CA', city: 'SF' },
});
```

## Fallback Behavior

The system automatically falls back:

```
US:CA:SF (city) → US:CA (state) → US (country)
```

If city rules not found, uses state rules. If state not found, uses country rules.

## Best Practices

1. **Start with country** - Define base country jurisdiction first
2. **Override selectively** - Only override what's different
3. **Document sources** - Reference official government sites
4. **Test thoroughly** - Verify calculations with official tools
5. **Version control** - Track changes to jurisdiction rules
6. **Update regularly** - Review quarterly for law changes

## Resources

- **State Labor Departments:** Each US state has its own
- **DOL State Resources:** https://www.dol.gov/agencies/whd/state
- **State Minimum Wages:** https://www.dol.gov/agencies/whd/minimum-wage/state
- **State Tax Authorities:** Search "[State] Department of Revenue"

## Need Help?

- See main jurisdiction README: [../jurisdiction-data/README.md](../jurisdiction-data/README.md)
- Open an issue on GitHub
- Consult with local employment law attorneys

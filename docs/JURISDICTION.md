# Jurisdiction & Compliance

## Tax Bracket Registration

Register country/state-specific tax brackets at app startup:

```typescript
import {
  registerJurisdiction,
  createJurisdictionDefinition,
  extendJurisdiction
} from '@classytic/payroll';

// Define jurisdiction with tax brackets
const bangladesh = createJurisdictionDefinition({
  id: 'BD',
  name: 'Bangladesh',
  level: 'country',
  currency: 'BDT',
  tax: {
    incomeTax: [
      { min: 0, max: 350000, rate: 0 },
      { min: 350000, max: 450000, rate: 0.05 },
      { min: 450000, max: 750000, rate: 0.10 },
      { min: 750000, max: 1150000, rate: 0.15 },
      { min: 1150000, max: 1650000, rate: 0.20 },
      { min: 1650000, max: Infinity, rate: 0.25 },
    ],
    effectiveFrom: new Date('2024-07-01'),
    thresholdsByCategory: {
      female: 400000,      // Higher threshold for women
      senior: 400000,      // 65+ years
      disabled: 475000,    // PWD
    }
  }
});

registerJurisdiction(bangladesh);

// Extend for state/city level
const dhaka = extendJurisdiction(bangladesh, {
  id: 'BD:DHK',
  name: 'Dhaka',
  level: 'city',
  tax: {
    cityTax: [{ min: 0, max: Infinity, rate: 0.01 }]
  }
});

registerJurisdiction(dhaka);
```

## Using Tax Brackets

```typescript
import { calculateJurisdictionTax } from '@classytic/payroll';

const tax = calculateJurisdictionTax({
  annualIncome: 1000000,
  jurisdiction: { country: 'BD', city: 'DHK' },
  taxpayerCategory: 'female',  // Gets higher threshold
  preTaxDeductions: 50000      // Provident fund, etc.
});

// Result includes breakdown per bracket
console.log(tax.totalTax, tax.effectiveRate, tax.brackets);
```

## Compliance Rules

Add custom validation rules per jurisdiction:

```typescript
const jurisdiction = createJurisdictionDefinition({
  id: 'US',
  name: 'United States',
  level: 'country',
  currency: 'USD',
  complianceRules: [
    {
      id: 'us:flsa:overtime',
      name: 'FLSA Overtime',
      category: 'hours',
      validate: (data) => {
        if (data.isNonExempt && data.weeklyHours > 40 && !data.overtimePaid) {
          return [{
            ruleId: 'us:flsa:overtime',
            severity: 'critical',
            message: 'Overtime not paid for hours over 40',
            remediation: 'Pay 1.5x rate for hours over 40',
            penalty: data.hourlyRate * 0.5 * (data.weeklyHours - 40)
          }];
        }
        return [];
      }
    },
    {
      id: 'us:flsa:minimum-wage',
      name: 'Federal Minimum Wage',
      category: 'wage',
      validate: (data) => {
        const federalMinimum = 7.25;
        if (data.hourlyRate < federalMinimum) {
          return [{
            ruleId: 'us:flsa:minimum-wage',
            severity: 'critical',
            message: `Hourly rate $${data.hourlyRate} below federal minimum $${federalMinimum}`
          }];
        }
        return [];
      }
    }
  ]
});
```

## Running Compliance Checks

```typescript
import { checkCompliance, generateComplianceReport } from '@classytic/payroll';

// Single employee
const violations = checkCompliance(employeeData, { country: 'US' });

// Bulk report
const report = generateComplianceReport(employees, {
  jurisdiction: { country: 'US', state: 'CA' },
  includeCompliant: false,
  groupByJurisdiction: true
});
```

## Leave Entitlements

```typescript
const jurisdiction = createJurisdictionDefinition({
  id: 'BD',
  name: 'Bangladesh',
  leave: {
    annualLeave: { days: 18, accrual: 'monthly', carryForward: true, maxCarryForward: 40 },
    sickLeave: { days: 14, requiresCertificate: true, certificateAfterDays: 2 },
    maternityLeave: { days: 112, paidPercentage: 100 },
    paternityLeave: { days: 7, paidPercentage: 100 },
    publicHolidays: 11,
    otherLeaves: [
      { name: 'Casual Leave', days: 10, paidDays: 10, paidPercentage: 100 }
    ]
  }
});
```

## Working Days Convention

**IMPORTANT**: Use `Date.getDay()` convention (0-6):
- 0 = Sunday
- 1 = Monday
- 2 = Tuesday
- 3 = Wednesday
- 4 = Thursday
- 5 = Friday
- 6 = Saturday

```typescript
// Monday-Friday (default)
const workingDays = [1, 2, 3, 4, 5];

// Sunday-Thursday (Middle East)
const workingDays = [0, 1, 2, 3, 4];

// Monday-Saturday (6-day week)
const workingDays = [1, 2, 3, 4, 5, 6];

// Usage in proration
calculateProRating({
  hireDate: new Date('2024-03-15'),
  periodStart: new Date('2024-03-01'),
  periodEnd: new Date('2024-03-31'),
  workingDays: [1, 2, 3, 4, 5],  // Mon-Fri
  holidays: [new Date('2024-03-26')]  // Independence Day
});
```

# Jurisdiction Data Example

⚠️ **CRITICAL DISCLAIMER** ⚠️

**THIS IS AN EXAMPLE ONLY - NOT LEGAL ADVICE**

## Legal Notice

The jurisdiction definition in this directory is:
- ❌ NOT guaranteed to be accurate
- ❌ NOT legal or tax advice
- ❌ NOT maintained for tax law changes
- ❌ NOT suitable for production use without verification

**YOU ARE SOLELY RESPONSIBLE FOR:**
1. ✅ Verifying accuracy with tax professionals
2. ✅ Updating for current tax year
3. ✅ Compliance with all applicable laws
4. ✅ Testing calculations thoroughly
5. ✅ Legal liability for incorrect calculations

**WE PROVIDE THE TOOLS, YOU PROVIDE THE DATA.**

Tax laws change frequently. A jurisdiction definition that was accurate when written may be outdated by the time you read this.

## What's Included

- [us-federal.ts](./us-federal.ts) - United States federal example (reference only)
- [bangladesh.ts](./bangladesh.ts) - Bangladesh example (reference only)

**Why only a few examples?**
- Shows the structure/pattern for different regions
- Demonstrates different labor law systems (US vs South Asia)
- You research YOUR jurisdiction
- You verify accuracy with local tax professionals
- You own the data

## How to Use This Example

### DO NOT directly import this file

```typescript
// ❌ WRONG - Don't do this
import { US_FEDERAL } from '@classytic/payroll/examples/jurisdiction-data/us-federal';
```

### DO copy, verify, and customize for YOUR jurisdiction

```typescript
// ✅ CORRECT - Copy to your app
// your-app/src/jurisdictions/us-federal.ts

import { createJurisdictionDefinition } from '@classytic/payroll/jurisdiction';

/**
 * US Federal tax configuration
 *
 * ⚠️ VERIFIED BY: [Your Tax Professional Name]
 * ⚠️ VERIFIED DATE: [Date]
 * ⚠️ TAX YEAR: 2024
 * ⚠️ SOURCES:
 *    - IRS Publication 15 (Circular E)
 *    - https://www.irs.gov/pub/irs-pdf/p15.pdf
 *    - [Other official sources]
 */
export const US_FEDERAL = createJurisdictionDefinition({
  id: 'US',
  name: 'United States (Federal)',
  level: 'country',
  currency: 'USD',
  locale: 'en-US',
  effectiveFrom: new Date('2024-01-01'),

  tax: {
    // Verify these brackets for current tax year!
    incomeTax: [
      { min: 0, max: 11600, rate: 0.10 },
      { min: 11600, max: 47150, rate: 0.12 },
      // ... verify each bracket
    ],
    socialSecurity: {
      employeeRate: 0.062, // Verify current rate
      employerRate: 0.062,
      ceiling: 168600, // Verify current ceiling
    },
    // ... complete configuration
  },

  overtime: { /* verify */ },
  leave: { /* verify */ },
  wage: { /* verify */ },
  workingHours: { /* verify */ },
  complianceRules: [],
});
```

## Verification Checklist

Before using ANY jurisdiction data in production:

### Tax Configuration
- [ ] Verified tax brackets with IRS/government sources
- [ ] Confirmed current tax year (2024/2025/etc)
- [ ] Validated social security/pension rates
- [ ] Checked wage base ceilings
- [ ] Reviewed standard deductions

### Wage & Hours
- [ ] Confirmed federal minimum wage
- [ ] Verified overtime threshold (40 hours/week)
- [ ] Checked FLSA requirements

### Leave Entitlements
- [ ] Verified FMLA requirements (unpaid)
- [ ] Checked state-specific leave laws
- [ ] Confirmed holiday count

### Compliance Rules
- [ ] Listed applicable federal laws (FLSA, ACA, etc)
- [ ] Identified regulatory authority
- [ ] Created validation functions

### Testing
- [ ] Unit tests for calculations
- [ ] Compared with official IRS withholding calculator
- [ ] Tested edge cases
- [ ] Verified with sample payrolls

## For Other Countries

Copy the US example structure and adapt for YOUR country:

```typescript
import { createJurisdictionDefinition } from '@classytic/payroll/jurisdiction';

export const MY_COUNTRY = createJurisdictionDefinition({
  id: 'XX',
  name: 'Your Country',
  level: 'country',
  currency: 'XXX',
  locale: 'xx-XX',
  effectiveFrom: new Date('2024-01-01'),

  tax: {
    incomeTax: [
      // YOUR country's tax brackets
      // Verified by YOUR tax professional
    ],
    // YOUR country's social security
    // YOUR country's other taxes
  },

  overtime: {
    // YOUR country's overtime rules
  },

  leave: {
    // YOUR country's leave entitlements
  },

  wage: {
    // YOUR country's minimum wage
  },

  workingHours: {
    // YOUR country's working hour limits
  },

  complianceRules: [
    // YOUR country's compliance checks
  ],

  metadata: {
    authority: 'Your Tax Authority',
    laws: ['Your Labour Law', 'Your Tax Law'],
    lastUpdated: new Date(),
    maintainer: 'Your Organization',
  },
});
```

## Maintenance

Tax laws change:
- **Annually:** Tax brackets, wage ceilings, minimum wage
- **Quarterly:** Sometimes mid-year adjustments
- **Ad-hoc:** Emergency legislation

Create a process to:
1. Review quarterly
2. Subscribe to government updates
3. Test against official calculators
4. Document changes with effective dates

## Resources

### United States
- **IRS:** https://www.irs.gov/
  - Tax withholding: Publication 15 (Circular E)
  - Tax calculator: https://www.irs.gov/individuals/tax-withholding-estimator
- **Department of Labor:** https://www.dol.gov/
  - Minimum wage: https://www.dol.gov/agencies/whd/minimum-wage
  - FLSA: https://www.dol.gov/agencies/whd/flsa

### Bangladesh
- **National Board of Revenue (NBR):** https://nbr.gov.bd/
  - Tax rates and slabs
  - Investment rebate information
- **Ministry of Labour and Employment:** http://www.mole.gov.bd/
  - Bangladesh Labour Act, 2006
  - Labour Rules, 2015
- **Bangladesh Government:** https://bangladesh.gov.bd/
  - Public holiday declarations
  - Gazette notifications

### For Your Country
- Search: "[Country] tax authority"
- Search: "[Country] labour department"
- Consult: Local tax professionals
- Consult: Employment law attorneys

## Support

We can help with:
- ✅ How to use the jurisdiction API
- ✅ Structuring jurisdiction data
- ✅ Type system questions
- ✅ Calculation debugging

We CANNOT help with:
- ❌ Legal advice
- ❌ Tax advice
- ❌ Verifying tax data accuracy
- ❌ Compliance consulting

**For tax/legal questions, consult qualified professionals.**

## License

This example is provided AS-IS with NO WARRANTY.

Use at your own risk. We accept NO LIABILITY for:
- Incorrect calculations
- Compliance violations
- Financial losses
- Legal issues

---

**Remember:**
- **Package = TOOLS** (calculation engine, types, registry)
- **You = DATA** (tax brackets, laws, verified accuracy)

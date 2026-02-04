/**
 * @classytic/payroll - Multi-Jurisdiction Support
 *
 * PURE TOOL - NO DEFAULTS
 *
 * This package provides the TOOLS for multi-jurisdiction payroll.
 * YOU provide the data (tax brackets, labor laws, etc.).
 *
 * WHY NO DEFAULTS?
 * - Tax laws change frequently (your app can update faster than package releases)
 * - Legal liability (you verify accuracy, not us)
 * - Minimal package (no unused data shipped to users)
 * - Flexibility (you own your compliance data)
 *
 * USAGE:
 * ```typescript
 * import { registerJurisdiction, calculateJurisdictionTax } from '@classytic/payroll/jurisdiction';
 *
 * // YOU define your jurisdiction data
 * const myCountry: JurisdictionDefinition = {
 *   id: 'US',
 *   name: 'United States',
 *   currency: 'USD',
 *   tax: { ... }, // Your research
 *   overtime: { ... },
 *   leave: { ... },
 *   // ... etc
 * };
 *
 * // Register it
 * registerJurisdiction(myCountry);
 *
 * // Use it
 * const tax = calculateJurisdictionTax({
 *   annualIncome: 100000,
 *   jurisdiction: { country: 'US' },
 * });
 * ```
 *
 * SEE EXAMPLES:
 * - examples/jurisdiction-data/ for reference implementations
 * - These are EXAMPLES ONLY, not legal advice
 * - YOU are responsible for accuracy and compliance
 */

// ============================================================================
// Types
// ============================================================================

export type {
  JurisdictionLevel,
  JurisdictionIdentifier,
  JurisdictionDefinition,
  TaxBracket,
  TaxConfiguration,
  TaxCalculationInput,
  TaxCalculationResult,
  OvertimeRule,
  OvertimeConfiguration,
  OvertimeCalculationBasis,
  LeaveEntitlement,
  ComplianceRule,
  ComplianceViolation,
  EmploymentData,
  WageConfiguration,
  WorkingHoursConfiguration,
  PaySlipData,
  PaySlipTemplate,
  StatutoryFilingRequirement,
  FilingCalendar,
} from './types.js';

// ============================================================================
// Registry (Pure Tool)
// ============================================================================

export {
  jurisdictionRegistry,
  registerJurisdiction,
  registerJurisdictions,
  getJurisdiction,
  requireJurisdiction,
  hasJurisdiction,
  getJurisdictionsByCountry,
} from './registry.js';

// ============================================================================
// Calculators (Pure Functions)
// ============================================================================

export {
  calculateJurisdictionTax,
  calculateMonthlyTax,
  compareTaxBurden,
} from './calculators/tax.js';

export {
  checkCompliance,
  checkBulkCompliance,
  generateComplianceReport,
} from './calculators/compliance.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a jurisdiction definition with type safety
 *
 * @example
 * ```typescript
 * const myJurisdiction = createJurisdictionDefinition({
 *   id: 'US',
 *   name: 'United States',
 *   level: 'country',
 *   currency: 'USD',
 *   locale: 'en-US',
 *   effectiveFrom: new Date('2024-01-01'),
 *   tax: { ... },
 *   overtime: { ... },
 *   leave: { ... },
 *   wage: { ... },
 *   workingHours: { ... },
 *   complianceRules: [],
 * });
 *
 * registerJurisdiction(myJurisdiction);
 * ```
 */
export function createJurisdictionDefinition(
  definition: import('./types.js').JurisdictionDefinition
): import('./types.js').JurisdictionDefinition {
  return definition;
}

/**
 * Helper to extend an existing jurisdiction (e.g., create a state from a country)
 *
 * @example
 * ```typescript
 * import { extendJurisdiction } from '@classytic/payroll/jurisdiction';
 *
 * // First get your base country jurisdiction (from your data)
 * const usFederal = getJurisdiction({ country: 'US' });
 *
 * // Extend it for a state
 * const california = extendJurisdiction(usFederal!, {
 *   id: 'US:CA',
 *   name: 'California',
 *   parent: 'US',
 *   level: 'state',
 *   wage: {
 *     minimumWage: { amount: 16, effectiveDate: new Date('2024-01-01') },
 *   },
 * });
 *
 * registerJurisdiction(california);
 * ```
 */
export function extendJurisdiction(
  base: import('./types.js').JurisdictionDefinition,
  overrides: Partial<import('./types.js').JurisdictionDefinition> & {
    id: string;
    name: string;
  }
): import('./types.js').JurisdictionDefinition {
  return {
    ...base,
    ...overrides,
    level: overrides.level || 'state',
    parent: base.id,
    tax: {
      ...base.tax,
      ...(overrides.tax || {}),
    } as import('./types.js').TaxConfiguration,
    overtime: {
      ...base.overtime,
      ...(overrides.overtime || {}),
    } as import('./types.js').OvertimeConfiguration,
    leave: {
      ...base.leave,
      ...(overrides.leave || {}),
    } as import('./types.js').LeaveEntitlement,
    wage: {
      ...base.wage,
      ...(overrides.wage || {}),
    } as import('./types.js').WageConfiguration,
    workingHours: {
      ...base.workingHours,
      ...(overrides.workingHours || {}),
    } as import('./types.js').WorkingHoursConfiguration,
    complianceRules: overrides.complianceRules || base.complianceRules,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata || {}),
    } as NonNullable<import('./types.js').JurisdictionDefinition['metadata']>,
  };
}

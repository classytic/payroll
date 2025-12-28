/**
 * @classytic/payroll - Jurisdiction-Aware Tax Calculator
 *
 * Pure functions for calculating taxes using jurisdiction-specific rules.
 */

import type {
  JurisdictionIdentifier,
  TaxCalculationInput,
  TaxCalculationResult,
  TaxConfiguration,
} from '../types.js';
import { requireJurisdiction } from '../registry.js';

// ============================================================================
// Tax Calculation
// ============================================================================

/**
 * Calculate comprehensive tax for an employee
 *
 * @example
 * ```typescript
 * const result = calculateJurisdictionTax({
 *   annualIncome: 100000,
 *   jurisdiction: { country: 'US', state: 'CA' },
 *   dependents: 2,
 * });
 *
 * console.log(result.totalEmployeeTax); // Total tax burden
 * console.log(result.effectiveRate);    // Effective tax rate
 * ```
 */
export function calculateJurisdictionTax(input: TaxCalculationInput): TaxCalculationResult {
  const jurisdiction = requireJurisdiction(input.jurisdiction);
  const config = jurisdiction.tax;

  // 1. Calculate taxable income (after allowances/deductions)
  const taxableIncome = calculateTaxableIncome(
    input.annualIncome,
    config,
    input.dependents,
    input.customAllowances,
    input.pensionContribution
  );

  // 2. Calculate income tax
  const incomeTax = calculateIncomeTax(taxableIncome, config.incomeTax);

  // 3. Calculate social security
  const { employeeAmount: socialSecurityEmployee, employerAmount: socialSecurityEmployer } =
    calculateSocialSecurity(input.annualIncome, config.socialSecurity);

  // 4. Calculate medicare
  const { employeeAmount: medicareEmployee, employerAmount: medicareEmployer } = calculateMedicare(
    input.annualIncome,
    config.medicare
  );

  // 5. Calculate unemployment
  const unemploymentEmployer = calculateUnemployment(input.annualIncome, config.unemployment);

  // 6. Calculate other contributions
  const otherContributions = calculateOtherContributions(
    input.annualIncome,
    config.otherContributions || []
  );

  // 7. Calculate totals
  const totalEmployeeTax =
    incomeTax +
    socialSecurityEmployee +
    medicareEmployee +
    otherContributions.reduce((sum, c) => sum + c.employeeAmount, 0);

  const totalEmployerTax =
    socialSecurityEmployer +
    medicareEmployer +
    unemploymentEmployer +
    otherContributions.reduce((sum, c) => sum + c.employerAmount, 0);

  const effectiveRate = input.annualIncome > 0 ? totalEmployeeTax / input.annualIncome : 0;

  return {
    incomeTax,
    socialSecurityEmployee,
    socialSecurityEmployer,
    medicareEmployee,
    medicareEmployer,
    unemploymentEmployer,
    otherContributions,
    totalEmployeeTax,
    totalEmployerTax,
    effectiveRate,
    taxableIncome,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate taxable income after allowances and deductions
 */
function calculateTaxableIncome(
  grossIncome: number,
  config: TaxConfiguration,
  dependents = 0,
  customAllowances = 0,
  pensionContribution = 0
): number {
  let taxableIncome = grossIncome;

  // Apply standard deduction
  if (config.standardDeduction) {
    taxableIncome -= config.standardDeduction;
  }

  // Apply personal allowance
  if (config.allowances?.personal) {
    taxableIncome -= config.allowances.personal;
  }

  // Apply dependent allowance
  if (config.allowances?.dependent && dependents > 0) {
    taxableIncome -= config.allowances.dependent * dependents;
  }

  // Apply pension allowance
  if (config.allowances?.pension && pensionContribution > 0) {
    const pensionAllowance = Math.min(pensionContribution, config.allowances.pension);
    taxableIncome -= pensionAllowance;
  }

  // Apply custom allowances
  if (customAllowances > 0) {
    taxableIncome -= customAllowances;
  }

  return Math.max(0, taxableIncome);
}

/**
 * Calculate income tax using progressive brackets
 */
function calculateIncomeTax(
  taxableIncome: number,
  brackets: TaxConfiguration['incomeTax']
): number {
  let tax = 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) {
      continue;
    }

    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
    const bracketTax = taxableInBracket * bracket.rate;

    // Add fixed amount if specified
    tax += bracketTax + (bracket.fixedAmount || 0);
  }

  return Math.round(tax);
}

/**
 * Calculate social security contributions
 */
function calculateSocialSecurity(
  annualIncome: number,
  config?: TaxConfiguration['socialSecurity']
): { employeeAmount: number; employerAmount: number } {
  if (!config) {
    return { employeeAmount: 0, employerAmount: 0 };
  }

  // Apply floor and ceiling
  let taxableIncome = annualIncome;

  if (config.floor && taxableIncome < config.floor) {
    return { employeeAmount: 0, employerAmount: 0 };
  }

  if (config.ceiling && taxableIncome > config.ceiling) {
    taxableIncome = config.ceiling;
  }

  const employeeAmount = Math.round(taxableIncome * config.employeeRate);
  const employerAmount = Math.round(taxableIncome * config.employerRate);

  return { employeeAmount, employerAmount };
}

/**
 * Calculate medicare contributions
 */
function calculateMedicare(
  annualIncome: number,
  config?: TaxConfiguration['medicare']
): { employeeAmount: number; employerAmount: number } {
  if (!config) {
    return { employeeAmount: 0, employerAmount: 0 };
  }

  let employeeAmount = Math.round(annualIncome * config.employeeRate);
  const employerAmount = Math.round(annualIncome * config.employerRate);

  // Additional medicare tax for high earners
  if (config.additionalRate && config.additionalThreshold) {
    if (annualIncome > config.additionalThreshold) {
      const additionalIncome = annualIncome - config.additionalThreshold;
      employeeAmount += Math.round(additionalIncome * config.additionalRate);
    }
  }

  return { employeeAmount, employerAmount };
}

/**
 * Calculate unemployment insurance
 */
function calculateUnemployment(
  annualIncome: number,
  config?: TaxConfiguration['unemployment']
): number {
  if (!config) {
    return 0;
  }

  let taxableIncome = annualIncome;

  if (config.ceiling && taxableIncome > config.ceiling) {
    taxableIncome = config.ceiling;
  }

  return Math.round(taxableIncome * config.employerRate);
}

/**
 * Calculate other mandatory contributions
 */
function calculateOtherContributions(
  annualIncome: number,
  contributions: NonNullable<TaxConfiguration['otherContributions']>
): Array<{ name: string; employeeAmount: number; employerAmount: number }> {
  return contributions.map((contrib) => {
    let taxableIncome = annualIncome;

    if (contrib.ceiling && taxableIncome > contrib.ceiling) {
      taxableIncome = contrib.ceiling;
    }

    const employeeAmount = contrib.employeeRate
      ? Math.round(taxableIncome * contrib.employeeRate)
      : 0;

    const employerAmount = contrib.employerRate
      ? Math.round(taxableIncome * contrib.employerRate)
      : 0;

    return {
      name: contrib.name,
      employeeAmount,
      employerAmount,
    };
  });
}

// ============================================================================
// Monthly Tax Calculation (Convenience)
// ============================================================================

/**
 * Calculate monthly tax (convenience wrapper)
 */
export function calculateMonthlyTax(
  monthlyIncome: number,
  jurisdiction: JurisdictionIdentifier,
  options?: {
    dependents?: number;
    customAllowances?: number;
    pensionContribution?: number;
  }
): {
  monthlyIncomeTax: number;
  monthlySocialSecurity: number;
  monthlyMedicare: number;
  monthlyTotal: number;
  effectiveRate: number;
} {
  const annualIncome = monthlyIncome * 12;

  const result = calculateJurisdictionTax({
    annualIncome,
    jurisdiction,
    dependents: options?.dependents,
    customAllowances: options?.customAllowances ? options.customAllowances * 12 : undefined,
    pensionContribution: options?.pensionContribution
      ? options.pensionContribution * 12
      : undefined,
  });

  return {
    monthlyIncomeTax: Math.round(result.incomeTax / 12),
    monthlySocialSecurity: Math.round(result.socialSecurityEmployee / 12),
    monthlyMedicare: Math.round(result.medicareEmployee / 12),
    monthlyTotal: Math.round(result.totalEmployeeTax / 12),
    effectiveRate: result.effectiveRate,
  };
}

// ============================================================================
// Tax Comparison (Multi-Jurisdiction)
// ============================================================================

/**
 * Compare tax burden across multiple jurisdictions
 */
export function compareTaxBurden(
  annualIncome: number,
  jurisdictions: JurisdictionIdentifier[]
): Array<{
  jurisdiction: JurisdictionIdentifier;
  jurisdictionName: string;
  result: TaxCalculationResult;
}> {
  return jurisdictions.map((jurisdiction) => {
    const jurisdictionDef = requireJurisdiction(jurisdiction);
    const result = calculateJurisdictionTax({
      annualIncome,
      jurisdiction,
    });

    return {
      jurisdiction,
      jurisdictionName: jurisdictionDef.name,
      result,
    };
  });
}

/**
 * Money calculation utilities for payroll compliance
 *
 * Uses banker's rounding (round half to even) to prevent systematic bias
 * in financial calculations, as recommended for payroll systems.
 *
 * PRECISION: All functions default to 2 decimal places (cents/paise precision)
 * to maintain accuracy in payroll calculations. Amounts are stored as floating
 * point numbers with decimal precision (e.g., 1000.50 for $1,000.50).
 *
 * ## Design Decision: Floating Point Storage
 *
 * This module uses floating-point numbers (IEEE 754 double precision) for money
 * storage rather than integer minor units (cents) or MongoDB Decimal128.
 *
 * ### Tradeoffs:
 *
 * **Why floating point:**
 * - Simpler API (developers think in dollars, not cents)
 * - More intuitive JSON serialization (100.50 vs 10050)
 * - Sufficient precision for payroll (15 significant digits)
 * - Banker's rounding mitigates cumulative drift
 *
 * **Why NOT integer cents:**
 * - Would require breaking schema changes
 * - All consumer code needs conversion (amount / 100)
 * - More verbose for reporting/display
 *
 * **Why NOT Decimal128:**
 * - MongoDB-specific, reduces portability
 * - Requires special BSON handling in application code
 * - Overkill for typical payroll amounts (< $10M/employee/year)
 *
 * ### Mitigation:
 * - All calculations go through roundMoney() with banker's rounding
 * - Final amounts always rounded to 2 decimal places before storage
 * - Aggregations use MongoDB $round operator for consistency
 *
 * @see https://en.wikipedia.org/wiki/Banker%27s_rounding
 */

/**
 * Banker's rounding (round half to even) with decimal precision
 *
 * When rounding 0.5, rounds to the nearest even number:
 * - 2.5 → 2 (even)
 * - 3.5 → 4 (even)
 * - 4.5 → 4 (even)
 *
 * This prevents systematic bias in cumulative rounding that occurs
 * with standard rounding (always up), which is critical for payroll compliance.
 *
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 2 for cent precision)
 * @returns The rounded value
 */
export function roundMoney(value: number, decimals = 2): number {
  const multiplier = Math.pow(10, decimals);
  const scaled = value * multiplier;
  const fraction = scaled - Math.floor(scaled);

  // If exactly 0.5 (within tolerance), round to nearest even
  // Use 1e-10 tolerance to handle floating-point imprecision
  if (Math.abs(fraction - 0.5) < 1e-10) {
    const floor = Math.floor(scaled);
    const rounded = floor % 2 === 0 ? floor : floor + 1;
    return rounded / multiplier;
  }

  // Otherwise use standard rounding
  return Math.round(scaled) / multiplier;
}

/**
 * Round money with validation for negative values
 *
 * @param value - The number to round
 * @param decimals - Number of decimal places (default: 2 for cent precision)
 * @returns The rounded value (never negative for deductions)
 */
export function roundMoneyPositive(value: number, decimals = 2): number {
  return Math.max(0, roundMoney(value, decimals));
}

/**
 * Calculate percentage of an amount with banker's rounding
 *
 * @param amount - Base amount
 * @param percentage - Percentage (e.g., 10 for 10%)
 * @param decimals - Decimal places to round to (default: 2 for cent precision)
 * @returns Rounded percentage amount
 */
export function percentageOf(amount: number, percentage: number, decimals = 2): number {
  return roundMoney((amount * percentage) / 100, decimals);
}

/**
 * Prorate an amount by a ratio with banker's rounding
 *
 * @param amount - Base amount
 * @param ratio - Proration ratio (0 to 1)
 * @param decimals - Decimal places (default: 2 for cent precision)
 * @returns Prorated amount
 */
export function prorateAmount(amount: number, ratio: number, decimals = 2): number {
  return roundMoney(amount * ratio, decimals);
}

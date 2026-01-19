/**
 * Bug Fix Test: Percentage-based rounding loses decimal precision
 *
 * Issue: applyPercentage() uses bankersRound() which rounds to whole units,
 * losing cent precision. For example, 1000.50 * 15% becomes 150 instead of 150.08.
 *
 * Expected: Use roundMoney() for 2-decimal precision in percentage calculations.
 */

import { describe, it, expect } from 'vitest';
import { applyPercentage } from '../../src/utils/calculation.js';
import { percentageOf } from '../../src/utils/money.js';

describe('Bug: Percentage Rounding Precision', () => {
  it('should preserve cent precision when applying percentage', () => {
    // Test case from bug report
    const amount = 1000.50;
    const percentage = 15;

    const result = applyPercentage(amount, percentage);
    const expected = 150.08; // 1000.50 * 0.15 = 150.075 → 150.08 (banker's rounding)

    expect(result).toBe(expected);
  });

  it('should handle multiple percentage calculations accurately', () => {
    const testCases = [
      { amount: 1000.50, percentage: 15, expected: 150.08 },
      { amount: 2500.75, percentage: 10, expected: 250.08 },
      { amount: 5000.25, percentage: 12.5, expected: 625.03 },
      { amount: 1234.56, percentage: 7.5, expected: 92.59 },
    ];

    testCases.forEach(({ amount, percentage, expected }) => {
      const result = applyPercentage(amount, percentage);
      expect(result).toBe(expected);
    });
  });

  it('should match percentageOf() utility behavior', () => {
    const amount = 1000.50;
    const percentage = 15;

    const fromApplyPercentage = applyPercentage(amount, percentage);
    const fromPercentageOf = percentageOf(amount, percentage);

    expect(fromApplyPercentage).toBe(fromPercentageOf);
  });

  it('should handle edge case with exactly 0.5 cents using banker\'s rounding', () => {
    // 1000.50 * 15% = 150.075 (exactly 0.5 cents)
    // Banker's rounding: round to nearest even → 150.08
    const result = applyPercentage(1000.50, 15);
    expect(result).toBe(150.08);

    // 1000.00 * 15% = 150.00 (no fraction)
    const result2 = applyPercentage(1000.00, 15);
    expect(result2).toBe(150.00);
  });

  it('should accumulate without drift in bulk payroll', () => {
    // Simulate 100 employees with same salary
    const employees = Array.from({ length: 100 }, () => ({ salary: 1000.50 }));

    const totalTax = employees.reduce((sum, emp) => {
      return sum + applyPercentage(emp.salary, 15);
    }, 0);

    // Expected: 100 * 150.08 = 15,008.00
    // If using integer rounding: 100 * 150 = 15,000.00 (loss of 8.00!)
    // Use toBeCloseTo to handle floating-point accumulation drift
    expect(totalTax).toBeCloseTo(15008.00, 2);
  });
});

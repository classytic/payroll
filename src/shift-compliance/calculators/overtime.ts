/**
 * @classytic/payroll - Overtime Calculator
 *
 * Pure functions for calculating overtime bonuses.
 * No side effects, no DB calls - just math.
 */

import type {
  OvertimePolicy,
  OvertimeBonusResult,
  OvertimeOccurrence,
} from '../types.js';
import { roundMoney } from '../../utils/money.js';

// ============================================================================
// Daily Overtime
// ============================================================================

/**
 * Calculate daily overtime bonus
 *
 * @example
 * ```typescript
 * // Employee worked 10 hours, threshold is 8, rate is $100/hour
 * const result = calculateDailyOvertime(10, 8, 1.5, 100);
 * // → { amount: 100, overtimeHours: 2 }
 * // Calculation: 2 hours × $100 × 0.5 (extra) = $100
 * ```
 */
export function calculateDailyOvertime(
  hoursWorked: number,
  threshold: number,
  multiplier: number,
  hourlyRate: number
): { amount: number; overtimeHours: number } {
  const overtimeHours = Math.max(0, hoursWorked - threshold);

  if (overtimeHours === 0) {
    return { amount: 0, overtimeHours: 0 };
  }

  // Calculate EXTRA pay (multiplier - 1)
  // e.g., 1.5x means 0.5x extra on top of regular pay
  const extraMultiplier = multiplier - 1;
  const bonus = roundMoney(overtimeHours * hourlyRate * extraMultiplier, 2);

  return { amount: bonus, overtimeHours };
}

// ============================================================================
// Weekly Overtime
// ============================================================================

/**
 * Calculate weekly overtime bonus
 *
 * @example
 * ```typescript
 * // Employee worked 45 hours, threshold is 40, rate is $100/hour
 * const result = calculateWeeklyOvertime(45, 40, 1.5, 100);
 * // → { amount: 250, overtimeHours: 5 }
 * ```
 */
export function calculateWeeklyOvertime(
  hoursWorked: number,
  threshold: number,
  multiplier: number,
  hourlyRate: number
): { amount: number; overtimeHours: number } {
  // Same logic as daily
  return calculateDailyOvertime(hoursWorked, threshold, multiplier, hourlyRate);
}

// ============================================================================
// Monthly Overtime
// ============================================================================

/**
 * Calculate monthly overtime bonus
 *
 * @example
 * ```typescript
 * // Employee worked 170 hours, threshold is 160
 * const result = calculateMonthlyOvertime(170, 160, 1.5, 100);
 * // → { amount: 500, overtimeHours: 10 }
 * ```
 */
export function calculateMonthlyOvertime(
  hoursWorked: number,
  threshold: number,
  multiplier: number,
  hourlyRate: number
): { amount: number; overtimeHours: number } {
  // Same logic as daily/weekly
  return calculateDailyOvertime(hoursWorked, threshold, multiplier, hourlyRate);
}

// ============================================================================
// Weekend Premium
// ============================================================================

/**
 * Calculate weekend premium pay
 *
 * @example
 * ```typescript
 * // Employee worked 8 hours on Saturday
 * const result = calculateWeekendPremium(8, 1.5, 100, 'saturday');
 * // → { amount: 400, hours: 8 }
 * // Regular: 8 × $100 = $800
 * // Premium: 8 × $100 × 0.5 (extra) = $400
 * ```
 */
export function calculateWeekendPremium(
  hours: number,
  multiplier: number,
  hourlyRate: number,
  day: 'saturday' | 'sunday'
): { amount: number; hours: number; day: string } {
  const extraMultiplier = multiplier - 1;
  const bonus = roundMoney(hours * hourlyRate * extraMultiplier, 2);

  return { amount: bonus, hours, day };
}

// ============================================================================
// Night Shift Differential
// ============================================================================

/**
 * Calculate night shift differential
 *
 * @example
 * ```typescript
 * // Employee worked 8 hours during night shift (10pm-6am)
 * const result = calculateNightShiftDifferential(8, 1.2, 100);
 * // → { amount: 160, hours: 8 }
 * // Differential: 8 × $100 × 0.2 (extra) = $160
 * ```
 */
export function calculateNightShiftDifferential(
  hours: number,
  multiplier: number,
  hourlyRate: number
): { amount: number; hours: number } {
  const extraMultiplier = multiplier - 1;
  const bonus = roundMoney(hours * hourlyRate * extraMultiplier, 2);

  return { amount: bonus, hours };
}

// ============================================================================
// Main Overtime Calculator
// ============================================================================

/**
 * Calculate all overtime bonuses based on policy
 *
 * @example
 * ```typescript
 * const policy: OvertimePolicy = {
 *   enabled: true,
 *   mode: 'daily',
 *   dailyThreshold: 8,
 *   dailyMultiplier: 1.5,
 * };
 *
 * const occurrences: OvertimeOccurrence[] = [
 *   { date: new Date(), type: 'daily', hours: 2, multiplier: 1.5 },
 *   { date: new Date(), type: 'weekend-sunday', hours: 8, multiplier: 2.0 },
 * ];
 *
 * const result = calculateOvertimeBonus({
 *   policy,
 *   occurrences,
 *   hourlyRate: 100,
 * });
 * ```
 */
export function calculateOvertimeBonus(input: {
  policy: OvertimePolicy;
  occurrences?: OvertimeOccurrence[];
  overtimeHours?: number;
  overtimeDays?: number;
  hourlyRate: number;
}): OvertimeBonusResult {
  const {
    policy,
    occurrences = [],
    overtimeHours = 0,
    overtimeDays = 0,
    hourlyRate,
  } = input;

  // If disabled, return zeros
  if (!policy.enabled) {
    return {
      amount: 0,
      hours: 0,
      breakdown: [],
    };
  }

  let totalBonus = 0;
  let totalHours = 0;
  const breakdown: OvertimeBonusResult['breakdown'] = [];

  // Process detailed occurrences if provided
  if (occurrences.length > 0) {
    for (const occ of occurrences) {
      let bonus = 0;
      const extraMultiplier = occ.multiplier - 1;

      switch (occ.type) {
        case 'daily':
        case 'weekly':
        case 'monthly':
          bonus = roundMoney(occ.hours * hourlyRate * extraMultiplier, 2);
          break;

        case 'weekend-saturday':
        case 'weekend-sunday':
          bonus = roundMoney(occ.hours * hourlyRate * extraMultiplier, 2);
          break;

        case 'night-shift':
          bonus = roundMoney(occ.hours * hourlyRate * extraMultiplier, 2);
          break;
      }

      totalBonus += bonus;
      totalHours += occ.hours;

      breakdown.push({
        date: occ.date,
        type: occ.type,
        hours: occ.hours,
        rate: hourlyRate,
        multiplier: occ.multiplier,
        amount: bonus,
      });
    }
  }
  // Fallback to simple hours/days calculation
  else {
    const hours = overtimeHours || 0;
    const days = overtimeDays || 0;

    if (policy.mode === 'daily' && policy.dailyThreshold && policy.dailyMultiplier) {
      // Calculate based on days
      const hoursFromDays = days * policy.dailyThreshold;
      const result = calculateDailyOvertime(
        hoursFromDays + hours,
        policy.dailyThreshold,
        policy.dailyMultiplier,
        hourlyRate
      );
      totalBonus = result.amount;
      totalHours = result.overtimeHours;
    } else if (policy.mode === 'weekly' && policy.weeklyThreshold && policy.weeklyMultiplier) {
      const result = calculateWeeklyOvertime(
        hours,
        policy.weeklyThreshold,
        policy.weeklyMultiplier,
        hourlyRate
      );
      totalBonus = result.amount;
      totalHours = result.overtimeHours;
    } else if (policy.mode === 'monthly' && policy.monthlyThreshold && policy.monthlyMultiplier) {
      const result = calculateMonthlyOvertime(
        hours,
        policy.monthlyThreshold,
        policy.monthlyMultiplier,
        hourlyRate
      );
      totalBonus = result.amount;
      totalHours = result.overtimeHours;
    }

    // Add to breakdown if we calculated something
    if (totalBonus > 0) {
      breakdown.push({
        date: new Date(),
        type: policy.mode,
        hours: totalHours,
        rate: hourlyRate,
        multiplier: policy.dailyMultiplier || policy.weeklyMultiplier || policy.monthlyMultiplier || 1.5,
        amount: totalBonus,
      });
    }
  }

  return {
    amount: roundMoney(totalBonus, 2),
    hours: totalHours,
    breakdown,
  };
}

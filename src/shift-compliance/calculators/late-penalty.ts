/**
 * @classytic/payroll - Late Penalty Calculator
 *
 * Pure functions for calculating late arrival penalties.
 * No side effects, no DB calls - just math.
 */

import type {
  LateArrivalPolicy,
  LatePenaltyResult,
  LateOccurrence,
  PenaltyTier,
} from '../types.js';

// ============================================================================
// Flat Penalty Mode
// ============================================================================

/**
 * Calculate penalty using flat rate per occurrence
 *
 * @example
 * ```typescript
 * // $50 per late occurrence
 * const result = calculateFlatPenalty(3, 50);
 * // → { amount: 150, occurrences: 3 }
 * ```
 */
export function calculateFlatPenalty(
  occurrenceCount: number,
  flatAmount: number
): { amount: number; occurrences: number } {
  return {
    amount: occurrenceCount * flatAmount,
    occurrences: occurrenceCount,
  };
}

// ============================================================================
// Per-Minute Penalty Mode
// ============================================================================

/**
 * Calculate penalty based on minutes late
 *
 * @example
 * ```typescript
 * // $2 per minute, 45 minutes late
 * const result = calculatePerMinutePenalty(45, 2);
 * // → { amount: 90, minutes: 45 }
 * ```
 */
export function calculatePerMinutePenalty(
  totalMinutesLate: number,
  perMinuteRate: number
): { amount: number; minutes: number } {
  return {
    amount: Math.round(totalMinutesLate * perMinuteRate),
    minutes: totalMinutesLate,
  };
}

// ============================================================================
// Percentage Penalty Mode
// ============================================================================

/**
 * Calculate penalty as percentage of daily wage
 *
 * @example
 * ```typescript
 * // 2% of $500 daily wage, 3 late occurrences
 * const result = calculatePercentagePenalty(3, 2, 500);
 * // → { amount: 30, percentage: 2 }
 * ```
 */
export function calculatePercentagePenalty(
  occurrenceCount: number,
  percentageRate: number,
  dailyWage: number
): { amount: number; percentage: number } {
  const penaltyPerOccurrence = Math.round((dailyWage * percentageRate) / 100);
  return {
    amount: occurrenceCount * penaltyPerOccurrence,
    percentage: percentageRate,
  };
}

// ============================================================================
// Tiered Penalty Mode (Progressive Discipline)
// ============================================================================

/**
 * Find which tier an occurrence falls into
 *
 * @example
 * ```typescript
 * const tiers = [
 *   { from: 1, to: 2, penalty: 0, warning: true },
 *   { from: 3, to: 4, penalty: 25 },
 *   { from: 5, penalty: 50 },
 * ];
 *
 * findTier(1, tiers);  // → tier 0 (warning)
 *   findTier(3, tiers);  // → tier 1 ($25)
 * findTier(6, tiers);  // → tier 2 ($50)
 * ```
 */
export function findTier(occurrenceNumber: number, tiers: PenaltyTier[]): PenaltyTier | null {
  for (const tier of tiers) {
    // Open-ended tier (e.g., "5th and above")
    if (tier.to === undefined && occurrenceNumber >= tier.from) {
      return tier;
    }

    // Bounded tier (e.g., "3rd to 4th")
    if (tier.to !== undefined && occurrenceNumber >= tier.from && occurrenceNumber <= tier.to) {
      return tier;
    }
  }

  return null;
}

/**
 * Calculate penalty for a single occurrence using tiered system
 *
 * @example
 * ```typescript
 * const tiers = [
 *   { from: 1, to: 2, penalty: 0, warning: true },
 *   { from: 3, penalty: 25 },
 * ];
 *
 * calculateTieredPenaltyForOccurrence(1, tiers);  // → 0 (warning)
 * calculateTieredPenaltyForOccurrence(3, tiers);  // → 25
 * ```
 */
export function calculateTieredPenaltyForOccurrence(
  occurrenceNumber: number,
  tiers: PenaltyTier[]
): { amount: number; tier: PenaltyTier | null; warning: boolean } {
  const tier = findTier(occurrenceNumber, tiers);

  if (!tier) {
    // No tier found - no penalty
    return { amount: 0, tier: null, warning: false };
  }

  if (tier.warning) {
    // Warning only - no financial penalty
    return { amount: 0, tier, warning: true };
  }

  return { amount: tier.penalty, tier, warning: false };
}

/**
 * Calculate total tiered penalties for multiple occurrences
 *
 * @example
 * ```typescript
 * const tiers = [
 *   { from: 1, to: 2, penalty: 0, warning: true },
 *   { from: 3, to: 4, penalty: 25 },
 *   { from: 5, penalty: 50 },
 * ];
 *
 * // Employee has 5 late occurrences
 * const result = calculateTieredPenalty(5, 2, tiers);
 * // → {
 * //   amount: 125,  // 0 + 0 + 25 + 25 + 50
 * //   breakdown: [...]
 * // }
 * ```
 */
export function calculateTieredPenalty(
  newOccurrences: number,
  currentOccurrenceCount: number,
  tiers: PenaltyTier[]
): { amount: number; breakdown: Array<{ occurrence: number; penalty: number; tier?: number; warning: boolean }> } {
  let totalPenalty = 0;
  const breakdown: Array<{ occurrence: number; penalty: number; tier?: number; warning: boolean }> = [];

  for (let i = 0; i < newOccurrences; i++) {
    const occurrenceNumber = currentOccurrenceCount + i + 1;
    const result = calculateTieredPenaltyForOccurrence(occurrenceNumber, tiers);

    totalPenalty += result.amount;

    breakdown.push({
      occurrence: occurrenceNumber,
      penalty: result.amount,
      tier: result.tier ? tiers.indexOf(result.tier) : undefined,
      warning: result.warning,
    });
  }

  return { amount: totalPenalty, breakdown };
}

// ============================================================================
// Main Late Penalty Calculator
// ============================================================================

/**
 * Calculate late arrival penalties based on policy
 *
 * @example
 * ```typescript
 * const policy: LateArrivalPolicy = {
 *   enabled: true,
 *   gracePeriod: 5,
 *   mode: 'flat',
 *   flatAmount: 50,
 * };
 *
 * const occurrences: LateOccurrence[] = [
 *   { date: new Date(), scheduledTime, actualTime, minutesLate: 10 },
 *   { date: new Date(), scheduledTime, actualTime, minutesLate: 3 },  // Within grace
 * ];
 *
 * const result = calculateLatePenalty({
 *   policy,
 *   occurrences,
 *   dailyWage: 500,
 * });
 * // → { amount: 50, occurrences: 1, breakdown: [...] }
 * ```
 */
export function calculateLatePenalty(input: {
  policy: LateArrivalPolicy;
  occurrences?: LateOccurrence[];
  lateCount?: number;
  totalLateMinutes?: number;
  dailyWage?: number;
  currentOccurrenceCount?: number;
}): LatePenaltyResult {
  const {
    policy,
    occurrences = [],
    lateCount = 0,
    totalLateMinutes = 0,
    dailyWage = 0,
    currentOccurrenceCount = 0,
  } = input;

  // If disabled, return zeros
  if (!policy.enabled) {
    return {
      amount: 0,
      occurrences: 0,
      breakdown: [],
    };
  }

  // Filter occurrences beyond grace period
  const penalizableOccurrences = occurrences.filter(
    (occ) => occ.minutesLate > policy.gracePeriod
  );

  const penalizableCount = penalizableOccurrences.length || Math.max(0, lateCount);
  const penalizableMinutes = penalizableOccurrences.reduce((sum, occ) => sum + Math.max(0, occ.minutesLate - policy.gracePeriod), 0) || totalLateMinutes;

  // No penalizable occurrences
  if (penalizableCount === 0) {
    return {
      amount: 0,
      occurrences: 0,
      breakdown: occurrences.map((occ) => ({
        date: occ.date,
        minutesLate: occ.minutesLate,
        penaltyAmount: 0,
        waived: true,
        reason: 'Within grace period',
      })),
    };
  }

  // Calculate based on mode
  let totalPenalty = 0;
  let tierBreakdown: Array<{ occurrence: number; penalty: number; tier?: number; warning: boolean }> = [];

  switch (policy.mode) {
    case 'flat':
      if (policy.flatAmount) {
        const result = calculateFlatPenalty(penalizableCount, policy.flatAmount);
        totalPenalty = result.amount;
      }
      break;

    case 'per-minute':
      if (policy.perMinuteRate) {
        const result = calculatePerMinutePenalty(penalizableMinutes, policy.perMinuteRate);
        totalPenalty = result.amount;
      }
      break;

    case 'percentage':
      if (policy.percentageRate && dailyWage > 0) {
        const result = calculatePercentagePenalty(penalizableCount, policy.percentageRate, dailyWage);
        totalPenalty = result.amount;
      }
      break;

    case 'tiered':
      if (policy.tiers && policy.tiers.length > 0) {
        const result = calculateTieredPenalty(penalizableCount, currentOccurrenceCount, policy.tiers);
        totalPenalty = result.amount;
        tierBreakdown = result.breakdown;
      }
      break;
  }

  // Apply caps if configured
  if (policy.maxPenaltyAmount) {
    totalPenalty = Math.min(totalPenalty, policy.maxPenaltyAmount.amount);
  }

  // Build breakdown
  const breakdown = penalizableOccurrences.map((occ, index) => {
    const tierInfo = tierBreakdown[index];
    const penaltyPerOccurrence = policy.mode === 'tiered' && tierInfo
      ? tierInfo.penalty
      : totalPenalty / penalizableCount;

    return {
      date: occ.date,
      minutesLate: occ.minutesLate,
      penaltyAmount: Math.round(penaltyPerOccurrence),
      tier: tierInfo?.tier,
      waived: false,
    };
  });

  return {
    amount: Math.round(totalPenalty),
    occurrences: penalizableCount,
    breakdown,
  };
}

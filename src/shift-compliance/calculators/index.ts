/**
 * @classytic/payroll - Shift Compliance Calculators
 *
 * Main calculator that orchestrates all shift compliance calculations.
 */

import type {
  AttendancePolicy,
  ShiftComplianceData,
  ShiftComplianceResult,
  CalculateShiftComplianceInput,
} from '../types.js';

import { calculateLatePenalty } from './late-penalty.js';
import { calculateOvertimeBonus } from './overtime.js';

// Re-export individual calculators
export { calculateLatePenalty } from './late-penalty.js';
export { calculateOvertimeBonus } from './overtime.js';

// ============================================================================
// Main Shift Compliance Calculator
// ============================================================================

/**
 * Calculate complete shift compliance adjustments.
 *
 * This is the main function users call. It takes attendance data + policy
 * and returns penalties + bonuses.
 *
 * @example
 * ```typescript
 * const attendance: ShiftComplianceData = {
 *   lateArrivals: 3,
 *   totalLateMinutes: 45,
 *   earlyDepartures: 1,
 *   totalEarlyMinutes: 20,
 *   overtimeHours: 8,
 * };
 *
 * const policy: AttendancePolicy = {
 *   name: 'Manufacturing Policy',
 *   lateArrival: {
 *     enabled: true,
 *     gracePeriod: 0,
 *     mode: 'flat',
 *     flatAmount: 50,
 *   },
 *   earlyDeparture: {
 *     enabled: true,
 *     gracePeriod: 0,
 *     mode: 'flat',
 *     flatAmount: 75,
 *   },
 *   overtime: {
 *     enabled: true,
 *     mode: 'daily',
 *     dailyThreshold: 8,
 *     dailyMultiplier: 1.5,
 *   },
 *   effectiveFrom: new Date(),
 *   active: true,
 * };
 *
 * const result = calculateShiftCompliance({
 *   attendance,
 *   policy,
 *   dailyWage: 1500,
 *   hourlyRate: 200,
 * });
 *
 * // result = {
 * //   latePenalty: { amount: 150, ... },
 * //   earlyDeparturePenalty: { amount: 75, ... },
 * //   overtimeBonus: { amount: 800, ... },
 * //   totalPenalties: 225,
 * //   totalBonuses: 800,
 * //   netAdjustment: 575,  // +800 - 225
 * //   ...
 * // }
 * ```
 */
export function calculateShiftCompliance(
  input: CalculateShiftComplianceInput
): ShiftComplianceResult {
  const {
    attendance,
    policy,
    dailyWage,
    hourlyRate,
    currentOccurrenceCount = 0,
  } = input;

  // Calculate late penalties
  const latePenalty = calculateLatePenalty({
    policy: policy.lateArrival,
    occurrences: attendance.lateOccurrences,
    lateCount: attendance.lateArrivals,
    totalLateMinutes: attendance.totalLateMinutes,
    dailyWage,
    currentOccurrenceCount,
  });

  // Calculate early departure penalties (same logic as late)
  const earlyDeparturePenalty = calculateLatePenalty({
    policy: policy.earlyDeparture,
    occurrences: attendance.earlyOccurrences?.map((occ) => ({
      date: occ.date,
      scheduledTime: occ.scheduledTime,
      actualTime: occ.actualTime,
      minutesLate: occ.minutesEarly,  // Reuse "late" logic with "early" minutes
    })),
    lateCount: attendance.earlyDepartures,
    totalLateMinutes: attendance.totalEarlyMinutes,
    dailyWage,
    currentOccurrenceCount,
  });

  // Calculate overtime bonuses
  const overtimeBonus = calculateOvertimeBonus({
    policy: policy.overtime,
    occurrences: attendance.overtimeOccurrences,
    overtimeHours: attendance.overtimeHours,
    overtimeDays: attendance.overtimeDays,
    hourlyRate,
  });

  // Calculate totals
  const totalPenalties = latePenalty.amount + earlyDeparturePenalty.amount;
  const totalBonuses = overtimeBonus.amount;
  const netAdjustment = totalBonuses - totalPenalties;

  // Calculate compliance score (0-100)
  const totalOccurrences = latePenalty.occurrences + earlyDeparturePenalty.occurrences;
  const complianceScore = calculateComplianceScore(totalOccurrences, attendance);

  // Determine if employee is at risk
  const isAtRisk = determineRiskStatus(totalOccurrences, policy);

  return {
    latePenalty,
    earlyDeparturePenalty,
    overtimeBonus,
    totalPenalties,
    totalBonuses,
    netAdjustment,
    complianceScore,
    occurrenceCount: totalOccurrences,
    isAtRisk,
    policyId: policy.id,
    policyName: policy.name,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate compliance score (0-100)
 *
 * Logic:
 * - 0 occurrences = 100
 * - 1 occurrence = 90
 * - 2 occurrences = 80
 * - 3 occurrences = 70
 * - etc.
 */
function calculateComplianceScore(
  totalOccurrences: number,
  attendance: ShiftComplianceData
): number {
  if (totalOccurrences === 0) {
    return 100;
  }

  // Deduct 10 points per occurrence, min 0
  return Math.max(0, 100 - (totalOccurrences * 10));
}

/**
 * Determine if employee is at risk of termination
 *
 * Logic:
 * - If policy has tiered penalties, check if at final tier
 * - Otherwise, flag if >7 occurrences (industry standard)
 */
function determineRiskStatus(
  totalOccurrences: number,
  policy: AttendancePolicy
): boolean {
  // Check tiered policy
  if (policy.lateArrival.mode === 'tiered' && policy.lateArrival.tiers) {
    const lastTier = policy.lateArrival.tiers[policy.lateArrival.tiers.length - 1];
    if (lastTier && lastTier.from && totalOccurrences >= lastTier.from) {
      return true;
    }
  }

  // Default threshold: 7 occurrences
  return totalOccurrences >= 7;
}

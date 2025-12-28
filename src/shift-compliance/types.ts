/**
 * @classytic/payroll - Shift Compliance Types
 *
 * Clean, modern type definitions for shift-based attendance management.
 * No legacy baggage - one proper standard.
 */

import type { ObjectIdLike } from '../types.js';

// Re-export for convenience
export type { ObjectIdLike } from '../types.js';

// ============================================================================
// Enums
// ============================================================================

/** How penalties are calculated */
export type PenaltyMode =
  | 'flat'       // Fixed amount per occurrence
  | 'per-minute' // Amount per minute late/early
  | 'percentage' // Percentage of daily wage
  | 'tiered';    // Progressive penalties (1st, 2nd, 3rd offense)

/** When overtime kicks in */
export type OvertimeMode =
  | 'daily'   // > X hours per day
  | 'weekly'  // > X hours per week
  | 'monthly'; // > X hours per month

/** When to reset occurrence counters */
export type ResetPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

/** Clock-in rounding mode */
export type RoundingMode =
  | 'nearest' // Round to nearest interval
  | 'up'      // Always round up (favor employer)
  | 'down';   // Always round down (favor employee)

// ============================================================================
// Shift Compliance Policy
// ============================================================================

/**
 * Tiered penalty configuration for progressive discipline.
 *
 * @example
 * ```typescript
 * [
 *   { from: 1, to: 2, penalty: 0, warning: true },  // 1st-2nd: warning only
 *   { from: 3, to: 4, penalty: 25 },                 // 3rd-4th: $25
 *   { from: 5, penalty: 50 }                         // 5th+: $50
 * ]
 * ```
 */
export interface PenaltyTier {
  /** Occurrence number start (inclusive) */
  from: number;

  /** Occurrence number end (inclusive, optional for open-ended) */
  to?: number;

  /** Penalty amount for this tier */
  penalty: number;

  /** If true, log warning but don't deduct money */
  warning?: boolean;
}

/**
 * Maximum penalties per period configuration
 */
export interface MaxPenaltiesPerPeriod {
  /** Maximum number of penalties allowed */
  count: number;

  /** Period type */
  period: ResetPeriod;
}

/**
 * Weekend premium configuration
 */
export interface WeekendPremium {
  /** Saturday premium multiplier (e.g., 1.5 for time-and-a-half) */
  saturday: number;

  /** Sunday premium multiplier (e.g., 2.0 for double time) */
  sunday: number;
}

/**
 * Night shift differential configuration
 */
export interface NightShiftDifferential {
  /** Start hour (24h format, e.g., 22 = 10pm) */
  startHour: number;

  /** End hour (24h format, e.g., 6 = 6am) */
  endHour: number;

  /** Premium multiplier (e.g., 1.2 = 20% extra) */
  multiplier: number;
}

/**
 * Late arrival policy configuration
 */
export interface LateArrivalPolicy {
  /** Enable late arrival tracking */
  enabled: boolean;

  /** Grace period in minutes (no penalty if late < this) */
  gracePeriod: number;

  /** How to calculate penalty */
  mode: PenaltyMode;

  // Flat mode
  /** Fixed penalty amount per occurrence */
  flatAmount?: number;

  // Per-minute mode
  /** Penalty per minute late */
  perMinuteRate?: number;

  // Percentage mode
  /** Penalty as percentage of daily wage (e.g., 2 = 2%) */
  percentageRate?: number;

  // Tiered mode
  /** Progressive penalties based on occurrence count */
  tiers?: PenaltyTier[];

  // Caps and limits
  /** Maximum penalties allowed per period */
  maxPenaltiesPerPeriod?: MaxPenaltiesPerPeriod;

  /** Maximum total penalty amount per period */
  maxPenaltyAmount?: {
    amount: number;
    period: ResetPeriod;
  };

  /** When to reset occurrence counter */
  resetOccurrenceCount?: ResetPeriod;
}

/**
 * Early departure policy configuration
 * (Same structure as late arrival)
 */
export type EarlyDeparturePolicy = LateArrivalPolicy;

/**
 * Overtime bonus configuration
 */
export interface OvertimePolicy {
  /** Enable overtime bonuses */
  enabled: boolean;

  /** When overtime kicks in */
  mode: OvertimeMode;

  // Daily overtime
  /** Hours per day before overtime (e.g., 8) */
  dailyThreshold?: number;

  /** Overtime multiplier for daily (e.g., 1.5 = time and half) */
  dailyMultiplier?: number;

  // Weekly overtime
  /** Hours per week before overtime (e.g., 40) */
  weeklyThreshold?: number;

  /** Overtime multiplier for weekly */
  weeklyMultiplier?: number;

  // Monthly overtime
  /** Hours per month before overtime (e.g., 160) */
  monthlyThreshold?: number;

  /** Overtime multiplier for monthly */
  monthlyMultiplier?: number;

  // Weekend premium
  /** Weekend premium pay (null = disabled) */
  weekendPremium?: WeekendPremium;

  // Night shift differential
  /** Night shift premium (null = disabled) */
  nightShiftDifferential?: NightShiftDifferential;
}

/**
 * Clock-in rounding configuration
 */
export interface ClockRoundingPolicy {
  /** Enable clock-in rounding */
  enabled: boolean;

  /** Round to nearest X minutes */
  roundTo: 5 | 10 | 15;

  /** Rounding mode */
  mode: RoundingMode;
}

/**
 * Complete attendance policy configuration.
 *
 * This is what organizations define and what we use for calculations.
 * Users can store this in DB, config file, or pass directly.
 */
export interface AttendancePolicy {
  /** Unique policy ID (optional, for DB storage) */
  id?: string;

  /** Organization this policy belongs to (optional, for multi-tenant) */
  organizationId?: ObjectIdLike;

  /** Policy name for display */
  name: string;

  /** Policy description */
  description?: string;

  /** Who this policy applies to (optional, for targeted policies) */
  appliesTo?: {
    departments?: string[];
    positions?: string[];
    employeeIds?: ObjectIdLike[];
    all?: boolean;
  };

  /** Late arrival rules */
  lateArrival: LateArrivalPolicy;

  /** Early departure rules */
  earlyDeparture: EarlyDeparturePolicy;

  /** Overtime bonus rules */
  overtime: OvertimePolicy;

  /** Clock-in rounding rules */
  clockRounding?: ClockRoundingPolicy;

  /** When this policy becomes effective */
  effectiveFrom: Date;

  /** When this policy expires (null = no expiry) */
  effectiveTo?: Date | null;

  /** Is this policy active */
  active: boolean;
}

// ============================================================================
// Attendance Data (What users send us)
// ============================================================================

/**
 * Single late arrival occurrence
 */
export interface LateOccurrence {
  /** Date of late arrival */
  date: Date;

  /** Scheduled clock-in time */
  scheduledTime: Date;

  /** Actual clock-in time */
  actualTime: Date;

  /** Minutes late (calculated: actual - scheduled) */
  minutesLate: number;
}

/**
 * Single early departure occurrence
 */
export interface EarlyOccurrence {
  /** Date of early departure */
  date: Date;

  /** Scheduled clock-out time */
  scheduledTime: Date;

  /** Actual clock-out time */
  actualTime: Date;

  /** Minutes early (calculated: scheduled - actual) */
  minutesEarly: number;
}

/**
 * Single overtime occurrence
 */
export interface OvertimeOccurrence {
  /** Date of overtime */
  date: Date;

  /** Type of overtime */
  type: 'daily' | 'weekly' | 'monthly' | 'weekend-saturday' | 'weekend-sunday' | 'night-shift';

  /** Overtime hours */
  hours: number;

  /** Applicable multiplier */
  multiplier: number;
}

/**
 * Shift compliance data for a period.
 *
 * This is what users send us - we do the calculations.
 */
export interface ShiftComplianceData {
  // Late arrivals
  /** Number of late arrivals */
  lateArrivals?: number;

  /** Total minutes late (sum of all occurrences) */
  totalLateMinutes?: number;

  /** Detailed late occurrences (optional, for breakdown) */
  lateOccurrences?: LateOccurrence[];

  // Early departures
  /** Number of early departures */
  earlyDepartures?: number;

  /** Total minutes early */
  totalEarlyMinutes?: number;

  /** Detailed early occurrences */
  earlyOccurrences?: EarlyOccurrence[];

  // Overtime
  /** Total overtime hours */
  overtimeHours?: number;

  /** Total overtime days (for daily mode) */
  overtimeDays?: number;

  /** Detailed overtime breakdown */
  overtimeOccurrences?: OvertimeOccurrence[];
}

// ============================================================================
// Calculation Results (What we return)
// ============================================================================

/**
 * Late penalty calculation result
 */
export interface LatePenaltyResult {
  /** Total penalty amount */
  amount: number;

  /** Number of occurrences processed */
  occurrences: number;

  /** Breakdown per occurrence */
  breakdown: Array<{
    date: Date;
    minutesLate: number;
    penaltyAmount: number;
    tier?: number;  // Which tier applied (for tiered mode)
    waived: boolean;
    reason?: string;
  }>;
}

/**
 * Early departure penalty result
 */
export type EarlyDeparturePenaltyResult = LatePenaltyResult;

/**
 * Overtime bonus calculation result
 */
export interface OvertimeBonusResult {
  /** Total bonus amount */
  amount: number;

  /** Total overtime hours */
  hours: number;

  /** Breakdown by type */
  breakdown: Array<{
    date: Date;
    type: string;
    hours: number;
    rate: number;
    multiplier: number;
    amount: number;
  }>;
}

/**
 * Shift differential calculation result
 */
export interface ShiftDifferentialResult {
  /** Total differential amount */
  amount: number;

  /** Hours that qualify for differential */
  hours: number;

  /** Type of differential */
  type: 'night' | 'weekend';

  /** Multiplier applied */
  multiplier: number;
}

/**
 * Complete shift compliance calculation result.
 *
 * This is what we return after processing.
 */
export interface ShiftComplianceResult {
  // Penalties
  /** Late arrival penalties */
  latePenalty: LatePenaltyResult;

  /** Early departure penalties */
  earlyDeparturePenalty: EarlyDeparturePenaltyResult;

  // Bonuses
  /** Overtime bonuses */
  overtimeBonus: OvertimeBonusResult;

  /** Shift differential bonuses (if any) */
  shiftDifferential?: ShiftDifferentialResult;

  // Totals
  /** Total penalties (to deduct from salary) */
  totalPenalties: number;

  /** Total bonuses (to add to salary) */
  totalBonuses: number;

  /** Net adjustment (bonuses - penalties) */
  netAdjustment: number;

  // Compliance metrics
  /** Compliance score (0-100) */
  complianceScore: number;

  /** Total occurrence count (late + early) */
  occurrenceCount: number;

  /** Is employee at risk (near termination threshold) */
  isAtRisk: boolean;

  // Applied policy
  /** Policy ID that was used */
  policyId?: string;

  /** Policy name */
  policyName: string;
}

// ============================================================================
// Calculation Input (What calculation functions receive)
// ============================================================================

/**
 * Input for shift compliance calculation
 */
export interface CalculateShiftComplianceInput {
  /** Attendance data for the period */
  attendance: ShiftComplianceData;

  /** Policy to apply */
  policy: AttendancePolicy;

  /** Daily wage (for percentage-based penalties) */
  dailyWage: number;

  /** Hourly rate (for overtime calculations) */
  hourlyRate: number;

  /** Current occurrence count (for tiered penalties, optional) */
  currentOccurrenceCount?: number;

  /** Employee ID (for logging, optional) */
  employeeId?: ObjectIdLike;

  /** Period info (for logging, optional) */
  period?: {
    month: number;
    year: number;
  };
}

// ============================================================================
// Manager Override (Optional feature)
// ============================================================================

/**
 * Manager override for waiving penalties
 */
export interface PenaltyOverride {
  /** Which penalty to override */
  penaltyId: string;

  /** Employee affected */
  employeeId: ObjectIdLike;

  /** Manager who made the override */
  overriddenBy: ObjectIdLike;

  /** When the override was made */
  overriddenAt: Date;

  /** Original penalty amount */
  originalAmount: number;

  /** New amount (0 = fully waived) */
  newAmount: number;

  /** Reason for override */
  reason: string;

  /** Does this need approval */
  approvalRequired?: boolean;

  /** Who approved (if approval required) */
  approvedBy?: ObjectIdLike;

  /** When approved */
  approvedAt?: Date;
}

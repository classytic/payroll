/**
 * @classytic/payroll - Shift Compliance Module
 *
 * Modern shift compliance management for attendance policies, late penalties,
 * overtime bonuses, and progressive discipline systems.
 *
 * This module provides:
 * - Pure calculation functions (no database required)
 * - Industry-standard preset policies
 * - Fluent builder API for creating custom policies
 * - Optional Mongoose schemas for persistence
 * - Type-safe interfaces for all operations
 *
 * @example
 * ```typescript
 * import {
 *   calculateShiftCompliance,
 *   AttendancePolicyBuilder,
 *   createPolicyFromPreset,
 * } from '@classytic/payroll/shift-compliance';
 *
 * // Option 1: Use a preset policy
 * const policy = createPolicyFromPreset('manufacturing', {
 *   name: 'Factory Floor Policy',
 *   organizationId: orgId,
 * });
 *
 * // Option 2: Build a custom policy
 * const customPolicy = AttendancePolicyBuilder.create()
 *   .named('Custom Policy')
 *   .lateArrival()
 *     .gracePeriod(10)
 *     .tieredPenalty()
 *       .tier(1, 2).warning()
 *       .tier(3).penalty(50)
 *     .end()
 *   .end()
 *   .overtime()
 *     .mode('daily')
 *     .dailyThreshold(8, 1.5)
 *   .end()
 *   .build();
 *
 * // Calculate compliance for an employee
 * const result = calculateShiftCompliance({
 *   attendance: {
 *     lateArrivals: 3,
 *     totalLateMinutes: 45,
 *     overtimeHours: 8,
 *   },
 *   policy,
 *   dailyWage: 1500,
 *   hourlyRate: 200,
 * });
 *
 * console.log(result.netAdjustment); // Total adjustment (bonuses - penalties)
 * console.log(result.complianceScore); // 0-100 compliance score
 * console.log(result.isAtRisk); // Whether employee is at risk
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Main types
  AttendancePolicy,
  ShiftComplianceData,
  ShiftComplianceResult,
  CalculateShiftComplianceInput,

  // Policy types
  LateArrivalPolicy,
  EarlyDeparturePolicy,
  OvertimePolicy,
  ClockRoundingPolicy,

  // Mode and configuration types
  PenaltyMode,
  OvertimeMode,
  ResetPeriod,
  RoundingMode,

  // Supporting types
  PenaltyTier,
  MaxPenaltiesPerPeriod,
  WeekendPremium,
  NightShiftDifferential,

  // Occurrence types
  LateOccurrence,
  EarlyOccurrence,
  OvertimeOccurrence,

  // Result types
  LatePenaltyResult,
  EarlyDeparturePenaltyResult,
  OvertimeBonusResult,
  ShiftDifferentialResult,

  // Manager override types
  PenaltyOverride,

  // Utility types
  ObjectIdLike,
} from './types.js';

// ============================================================================
// Calculators
// ============================================================================

export {
  // Main calculator (most users will use this)
  calculateShiftCompliance,

  // Individual calculators (for advanced usage)
  calculateLatePenalty,
  calculateOvertimeBonus,
} from './calculators/index.js';

// Export individual calculation functions (for very advanced usage)
export {
  calculateFlatPenalty,
  calculatePerMinutePenalty,
  calculatePercentagePenalty,
  calculateTieredPenalty,
} from './calculators/late-penalty.js';

export {
  calculateDailyOvertime,
  calculateWeeklyOvertime,
  calculateMonthlyOvertime,
  calculateWeekendPremium,
  calculateNightShiftDifferential,
} from './calculators/overtime.js';

// ============================================================================
// Preset Policies
// ============================================================================

export {
  // Factory function
  createPolicyFromPreset,

  // Preset constants (for reference or customization)
  DEFAULT_ATTENDANCE_POLICY,
  MANUFACTURING_POLICY,
  RETAIL_POLICY,
  OFFICE_POLICY,
  HEALTHCARE_POLICY,
  HOSPITALITY_POLICY,
} from './config.js';

// ============================================================================
// Fluent Builders
// ============================================================================

export {
  // Main builder
  AttendancePolicyBuilder,

  // Standalone builders (for building sub-policies independently)
  createLatePolicyBuilder,
  createOvertimePolicyBuilder,
  createClockRoundingPolicyBuilder,

  // Individual builder classes (for advanced type usage)
  LatePolicyBuilder,
  TieredPenaltyBuilder,
  OvertimePolicyBuilder,
  ClockRoundingPolicyBuilder,
} from './builders.js';

// ============================================================================
// Mongoose Schemas (Optional)
// ============================================================================

export {
  // Main schema
  AttendancePolicySchema,
  AttendancePolicySchemaDefinition,

  // Sub-schemas (for building custom schemas)
  LateArrivalPolicySchema,
  LateArrivalPolicySchemaDefinition,
  EarlyDeparturePolicySchema,
  EarlyDeparturePolicySchemaDefinition,
  OvertimePolicySchema,
  OvertimePolicySchemaDefinition,
  ClockRoundingPolicySchema,
  ClockRoundingPolicySchemaDefinition,

  // Supporting schemas
  PenaltyTierSchema,
  PenaltyTierSchemaDefinition,
  MaxPenaltiesSchema,
  MaxPenaltiesSchemaDefinition,
  WeekendPremiumSchema,
  WeekendPremiumSchemaDefinition,
  NightShiftDifferentialSchema,
  NightShiftDifferentialSchemaDefinition,

  // Type augmentations
  type AttendancePolicyDocument,
  type AttendancePolicyModel,
} from './schemas.js';

// ============================================================================
// Re-export Default Schema
// ============================================================================

export { default as default } from './schemas.js';

/**
 * @classytic/payroll - Shift Compliance Configuration
 *
 * Default configurations and industry-standard preset policies.
 */

import type { AttendancePolicy } from './types.js';

// ============================================================================
// Default Policy
// ============================================================================

/**
 * Default attendance policy (moderate, office-friendly)
 */
export const DEFAULT_ATTENDANCE_POLICY: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'> = {
  lateArrival: {
    enabled: true,
    gracePeriod: 10,  // 10 minutes grace
    mode: 'tiered',
    tiers: [
      { from: 1, to: 2, penalty: 0, warning: true },  // 1st-2nd: warning
      { from: 3, to: 4, penalty: 25 },                 // 3rd-4th: $25
      { from: 5, penalty: 50 },                        // 5th+: $50
    ],
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  earlyDeparture: {
    enabled: true,
    gracePeriod: 10,
    mode: 'tiered',
    tiers: [
      { from: 1, to: 2, penalty: 0, warning: true },
      { from: 3, to: 4, penalty: 30 },
      { from: 5, penalty: 60 },
    ],
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  overtime: {
    enabled: true,
    mode: 'daily',
    dailyThreshold: 8,
    dailyMultiplier: 1.5,
    weeklyThreshold: 40,
    weeklyMultiplier: 1.5,
  },

  clockRounding: {
    enabled: false,
    roundTo: 15,
    mode: 'nearest',
  },
};

// ============================================================================
// Industry Preset Policies
// ============================================================================

/**
 * Manufacturing/Factory policy (strict, zero tolerance)
 */
export const MANUFACTURING_POLICY: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'> = {
  lateArrival: {
    enabled: true,
    gracePeriod: 0,  // No grace period
    mode: 'flat',
    flatAmount: 100,  // $100 per occurrence
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  earlyDeparture: {
    enabled: true,
    gracePeriod: 0,
    mode: 'flat',
    flatAmount: 150,  // Higher penalty for early departure
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  overtime: {
    enabled: true,
    mode: 'daily',
    dailyThreshold: 8,
    dailyMultiplier: 1.5,
    weeklyThreshold: 40,
    weeklyMultiplier: 2.0,  // Double time for weekly OT
  },

  clockRounding: {
    enabled: true,
    roundTo: 15,
    mode: 'down',  // Round down (favor employer)
  },
};

/**
 * Retail policy (flexible with weekend premiums)
 */
export const RETAIL_POLICY: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'> = {
  lateArrival: {
    enabled: true,
    gracePeriod: 5,
    mode: 'flat',
    flatAmount: 25,
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'monthly',
  },

  earlyDeparture: {
    enabled: true,
    gracePeriod: 5,
    mode: 'flat',
    flatAmount: 25,
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'monthly',
  },

  overtime: {
    enabled: true,
    mode: 'weekly',
    weeklyThreshold: 40,
    weeklyMultiplier: 1.5,
    weekendPremium: {
      saturday: 1.5,  // Time and half on Saturday
      sunday: 2.0,     // Double time on Sunday
    },
  },

  clockRounding: {
    enabled: true,
    roundTo: 5,
    mode: 'nearest',
  },
};

/**
 * Office/Tech policy (very flexible, progressive discipline)
 */
export const OFFICE_POLICY: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'> = {
  lateArrival: {
    enabled: true,
    gracePeriod: 15,  // 15 minutes grace
    mode: 'tiered',
    tiers: [
      { from: 1, to: 3, penalty: 0, warning: true },  // 1st-3rd: warning only
      { from: 4, to: 5, penalty: 20 },                 // 4th-5th: $20
      { from: 6, penalty: 40 },                        // 6th+: $40
    ],
    maxPenaltiesPerPeriod: {
      count: 3,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  earlyDeparture: {
    enabled: false,  // Often not tracked in office environments
    gracePeriod: 30,
    mode: 'flat',
    flatAmount: 0,
  },

  overtime: {
    enabled: true,
    mode: 'weekly',
    weeklyThreshold: 40,
    weeklyMultiplier: 1.5,
  },

  clockRounding: {
    enabled: false,  // No rounding for office workers
    roundTo: 15,
    mode: 'nearest',
  },
};

/**
 * Healthcare policy (night shift differential, weekend premiums)
 */
export const HEALTHCARE_POLICY: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'> = {
  lateArrival: {
    enabled: true,
    gracePeriod: 5,
    mode: 'flat',
    flatAmount: 50,
    maxPenaltiesPerPeriod: {
      count: 3,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  earlyDeparture: {
    enabled: true,
    gracePeriod: 5,
    mode: 'flat',
    flatAmount: 75,  // Higher penalty due to patient care
    maxPenaltiesPerPeriod: {
      count: 3,
      period: 'monthly',
    },
    resetOccurrenceCount: 'quarterly',
  },

  overtime: {
    enabled: true,
    mode: 'daily',
    dailyThreshold: 8,
    dailyMultiplier: 1.5,
    weekendPremium: {
      saturday: 1.5,
      sunday: 2.0,
    },
    nightShiftDifferential: {
      startHour: 22,  // 10pm
      endHour: 6,     // 6am
      multiplier: 1.3, // 30% premium
    },
  },

  clockRounding: {
    enabled: true,
    roundTo: 15,
    mode: 'nearest',
  },
};

/**
 * Hospitality policy (flexible, weekend/night premiums)
 */
export const HOSPITALITY_POLICY: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'> = {
  lateArrival: {
    enabled: true,
    gracePeriod: 5,
    mode: 'percentage',
    percentageRate: 1,  // 1% of daily wage per occurrence
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'monthly',
  },

  earlyDeparture: {
    enabled: true,
    gracePeriod: 5,
    mode: 'percentage',
    percentageRate: 1.5,  // 1.5% of daily wage
    maxPenaltiesPerPeriod: {
      count: 5,
      period: 'monthly',
    },
    resetOccurrenceCount: 'monthly',
  },

  overtime: {
    enabled: true,
    mode: 'weekly',
    weeklyThreshold: 40,
    weeklyMultiplier: 1.5,
    weekendPremium: {
      saturday: 1.25,
      sunday: 1.5,
    },
    nightShiftDifferential: {
      startHour: 22,
      endHour: 6,
      multiplier: 1.2,
    },
  },

  clockRounding: {
    enabled: true,
    roundTo: 10,
    mode: 'nearest',
  },
};

// ============================================================================
// Preset Factory
// ============================================================================

/**
 * Get a complete policy from a preset
 *
 * @example
 * ```typescript
 * const policy = createPolicyFromPreset('manufacturing', {
 *   name: 'Factory Floor Policy',
 *   organizationId: orgId,
 * });
 * ```
 */
export function createPolicyFromPreset(
  preset: 'default' | 'manufacturing' | 'retail' | 'office' | 'healthcare' | 'hospitality',
  overrides?: Partial<AttendancePolicy>
): AttendancePolicy {
  let basePolicy: Omit<AttendancePolicy, 'name' | 'effectiveFrom' | 'active'>;

  switch (preset) {
    case 'manufacturing':
      basePolicy = MANUFACTURING_POLICY;
      break;
    case 'retail':
      basePolicy = RETAIL_POLICY;
      break;
    case 'office':
      basePolicy = OFFICE_POLICY;
      break;
    case 'healthcare':
      basePolicy = HEALTHCARE_POLICY;
      break;
    case 'hospitality':
      basePolicy = HOSPITALITY_POLICY;
      break;
    default:
      basePolicy = DEFAULT_ATTENDANCE_POLICY;
  }

  return {
    ...basePolicy,
    name: overrides?.name || `${preset.charAt(0).toUpperCase() + preset.slice(1)} Policy`,
    effectiveFrom: overrides?.effectiveFrom || new Date(),
    active: overrides?.active ?? true,
    ...overrides,
  };
}

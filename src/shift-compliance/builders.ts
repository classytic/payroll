/**
 * @classytic/payroll - Shift Compliance Fluent Builders
 *
 * DX-friendly fluent API for creating attendance policies programmatically.
 *
 * @example
 * ```typescript
 * const policy = AttendancePolicyBuilder.create()
 *   .named('Tech Department Policy')
 *   .description('Flexible policy for tech workers')
 *   .lateArrival()
 *     .enable()
 *     .gracePeriod(15)
 *     .tieredPenalty()
 *       .tier(1, 3).warning()
 *       .tier(4, 5).penalty(20)
 *       .tier(6).penalty(40)
 *     .end()
 *     .maxPenalties(3, 'monthly')
 *     .resetOccurrences('quarterly')
 *   .end()
 *   .overtime()
 *     .enable()
 *     .mode('weekly')
 *     .weeklyThreshold(40, 1.5)
 *   .end()
 *   .build();
 * ```
 */

import type {
  AttendancePolicy,
  LateArrivalPolicy,
  EarlyDeparturePolicy,
  OvertimePolicy,
  ClockRoundingPolicy,
  PenaltyTier,
} from './types.js';
import type { ObjectIdLike } from './types.js';

// ============================================================================
// Late Arrival / Early Departure Policy Builder
// ============================================================================

/**
 * Builder for late arrival or early departure policies.
 * Uses same structure for both since the logic is identical.
 */
export class LatePolicyBuilder<TParent = unknown> {
  private policy: Partial<LateArrivalPolicy> = {
    enabled: true,
    gracePeriod: 0,
  };
  private parent?: TParent;

  constructor(parent?: TParent) {
    this.parent = parent;
  }

  /**
   * Enable this policy
   */
  enable(): this {
    this.policy.enabled = true;
    return this;
  }

  /**
   * Disable this policy
   */
  disable(): this {
    this.policy.enabled = false;
    return this;
  }

  /**
   * Set grace period in minutes (how many minutes late before penalty applies)
   */
  gracePeriod(minutes: number): this {
    this.policy.gracePeriod = minutes;
    return this;
  }

  /**
   * Use flat penalty mode (same penalty for each occurrence)
   *
   * @param amount - Penalty amount per occurrence
   */
  flatPenalty(amount: number): this {
    this.policy.mode = 'flat';
    this.policy.flatAmount = amount;
    delete this.policy.perMinuteRate;
    delete this.policy.percentageRate;
    delete this.policy.tiers;
    return this;
  }

  /**
   * Use per-minute penalty mode (penalty based on minutes late)
   *
   * @param rate - Penalty per minute late
   */
  perMinutePenalty(rate: number): this {
    this.policy.mode = 'per-minute';
    this.policy.perMinuteRate = rate;
    delete this.policy.flatAmount;
    delete this.policy.percentageRate;
    delete this.policy.tiers;
    return this;
  }

  /**
   * Use percentage penalty mode (percentage of daily wage)
   *
   * @param percentage - Percentage of daily wage (e.g., 2 for 2%)
   */
  percentagePenalty(percentage: number): this {
    this.policy.mode = 'percentage';
    this.policy.percentageRate = percentage;
    delete this.policy.flatAmount;
    delete this.policy.perMinuteRate;
    delete this.policy.tiers;
    return this;
  }

  /**
   * Start building tiered penalty (progressive discipline)
   *
   * @example
   * ```typescript
   * .tieredPenalty()
   *   .tier(1, 2).warning()
   *   .tier(3, 4).penalty(25)
   *   .tier(5).penalty(50)
   * .end()
   * ```
   */
  tieredPenalty(): TieredPenaltyBuilder<this> {
    this.policy.mode = 'tiered';
    this.policy.tiers = [];
    delete this.policy.flatAmount;
    delete this.policy.perMinuteRate;
    delete this.policy.percentageRate;
    return new TieredPenaltyBuilder(this);
  }

  /**
   * Set maximum penalties per period (caps total penalties)
   *
   * @param count - Max number of penalties
   * @param period - Period type ('daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly')
   */
  maxPenalties(count: number, period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'): this {
    this.policy.maxPenaltiesPerPeriod = { count, period };
    return this;
  }

  /**
   * Set when to reset occurrence counter
   *
   * @param period - Reset period ('monthly' | 'quarterly' | 'yearly')
   */
  resetOccurrences(period: 'monthly' | 'quarterly' | 'yearly'): this {
    this.policy.resetOccurrenceCount = period;
    return this;
  }

  /**
   * Add a custom tier (advanced usage)
   */
  addTier(tier: PenaltyTier): this {
    if (!this.policy.tiers) {
      this.policy.tiers = [];
    }
    this.policy.tiers.push(tier);
    return this;
  }

  /**
   * Finish building this policy and return to parent builder
   */
  end(): TParent {
    if (!this.parent) {
      throw new Error('Cannot call end() without parent builder');
    }
    return this.parent;
  }

  /**
   * Build the policy (for standalone usage)
   */
  build(): LateArrivalPolicy {
    // Validate required fields
    if (this.policy.mode === undefined) {
      throw new Error('Penalty mode is required. Use flatPenalty(), perMinutePenalty(), percentagePenalty(), or tieredPenalty()');
    }

    // Validate mode-specific fields
    if (this.policy.mode === 'flat' && this.policy.flatAmount === undefined) {
      throw new Error('flatAmount is required for flat penalty mode');
    }
    if (this.policy.mode === 'per-minute' && this.policy.perMinuteRate === undefined) {
      throw new Error('perMinuteRate is required for per-minute penalty mode');
    }
    if (this.policy.mode === 'percentage' && this.policy.percentageRate === undefined) {
      throw new Error('percentageRate is required for percentage penalty mode');
    }
    if (this.policy.mode === 'tiered' && (!this.policy.tiers || this.policy.tiers.length === 0)) {
      throw new Error('At least one tier is required for tiered penalty mode');
    }

    return this.policy as LateArrivalPolicy;
  }

  /** @internal */
  _getPolicy(): Partial<LateArrivalPolicy> {
    return this.policy;
  }
}

// ============================================================================
// Tiered Penalty Builder
// ============================================================================

/**
 * Builder for tiered penalties (progressive discipline)
 */
export class TieredPenaltyBuilder<TParent> {
  private tiers: PenaltyTier[] = [];
  private parent: TParent;
  private currentTier: Partial<PenaltyTier> = {};

  constructor(parent: TParent) {
    this.parent = parent;
  }

  /**
   * Start a new tier
   *
   * @param from - Starting occurrence number (1-indexed)
   * @param to - Ending occurrence number (optional, omit for open-ended tier)
   */
  tier(from: number, to?: number): this {
    // Save previous tier if exists
    if (Object.keys(this.currentTier).length > 0) {
      this.saveTier();
    }

    this.currentTier = { from, to };
    return this;
  }

  /**
   * Set this tier as warning only (no financial penalty)
   */
  warning(): this {
    this.currentTier.penalty = 0;
    this.currentTier.warning = true;
    return this;
  }

  /**
   * Set penalty amount for this tier
   */
  penalty(amount: number): this {
    this.currentTier.penalty = amount;
    this.currentTier.warning = false;
    return this;
  }

  /**
   * Finish building tiers and return to parent
   */
  end(): TParent {
    // Save last tier
    if (Object.keys(this.currentTier).length > 0) {
      this.saveTier();
    }

    // Update parent's tiers via internal accessor
    if (this.parent instanceof LatePolicyBuilder) {
      this.parent._getPolicy().tiers = this.tiers;
    }

    return this.parent;
  }

  private saveTier(): void {
    if (this.currentTier.from === undefined) {
      throw new Error('Tier must have a "from" value. Use .tier(from, to?)');
    }
    if (this.currentTier.penalty === undefined) {
      throw new Error('Tier must have a penalty or be marked as warning. Use .penalty(amount) or .warning()');
    }

    this.tiers.push(this.currentTier as PenaltyTier);
    this.currentTier = {};
  }
}

// ============================================================================
// Overtime Policy Builder
// ============================================================================

/**
 * Builder for overtime policies
 */
export class OvertimePolicyBuilder<TParent = unknown> {
  private policy: Partial<OvertimePolicy> = {
    enabled: true,
  };
  private parent?: TParent;

  constructor(parent?: TParent) {
    this.parent = parent;
  }

  /**
   * Enable overtime calculations
   */
  enable(): this {
    this.policy.enabled = true;
    return this;
  }

  /**
   * Disable overtime calculations
   */
  disable(): this {
    this.policy.enabled = false;
    return this;
  }

  /**
   * Set overtime calculation mode
   */
  mode(mode: 'daily' | 'weekly' | 'monthly'): this {
    this.policy.mode = mode;
    return this;
  }

  /**
   * Set daily overtime threshold and multiplier
   *
   * @param hours - Hours threshold (e.g., 8)
   * @param multiplier - Overtime multiplier (e.g., 1.5 for time-and-a-half)
   */
  dailyThreshold(hours: number, multiplier: number): this {
    this.policy.dailyThreshold = hours;
    this.policy.dailyMultiplier = multiplier;
    return this;
  }

  /**
   * Set weekly overtime threshold and multiplier
   *
   * @param hours - Hours threshold (e.g., 40)
   * @param multiplier - Overtime multiplier (e.g., 1.5 for time-and-a-half)
   */
  weeklyThreshold(hours: number, multiplier: number): this {
    this.policy.weeklyThreshold = hours;
    this.policy.weeklyMultiplier = multiplier;
    return this;
  }

  /**
   * Set monthly overtime threshold and multiplier
   *
   * @param hours - Hours threshold (e.g., 160)
   * @param multiplier - Overtime multiplier (e.g., 2.0 for double time)
   */
  monthlyThreshold(hours: number, multiplier: number): this {
    this.policy.monthlyThreshold = hours;
    this.policy.monthlyMultiplier = multiplier;
    return this;
  }

  /**
   * Set weekend premium rates
   *
   * @param saturday - Saturday multiplier (e.g., 1.5)
   * @param sunday - Sunday multiplier (e.g., 2.0)
   */
  weekendPremium(saturday: number, sunday: number): this {
    this.policy.weekendPremium = { saturday, sunday };
    return this;
  }

  /**
   * Set night shift differential
   *
   * @param startHour - Start hour (24-hour format, e.g., 22 for 10pm)
   * @param endHour - End hour (24-hour format, e.g., 6 for 6am)
   * @param multiplier - Night shift multiplier (e.g., 1.3 for 30% premium)
   */
  nightShiftDifferential(startHour: number, endHour: number, multiplier: number): this {
    this.policy.nightShiftDifferential = { startHour, endHour, multiplier };
    return this;
  }

  /**
   * Finish building this policy and return to parent builder
   */
  end(): TParent {
    if (!this.parent) {
      throw new Error('Cannot call end() without parent builder');
    }
    return this.parent;
  }

  /**
   * Build the policy (for standalone usage)
   */
  build(): OvertimePolicy {
    // Validate required fields
    if (this.policy.mode === undefined) {
      throw new Error('Overtime mode is required. Use .mode("daily" | "weekly" | "monthly")');
    }

    // Validate mode-specific fields
    if (this.policy.mode === 'daily' && (this.policy.dailyThreshold === undefined || this.policy.dailyMultiplier === undefined)) {
      throw new Error('dailyThreshold and dailyMultiplier are required for daily mode. Use .dailyThreshold(hours, multiplier)');
    }
    if (this.policy.mode === 'weekly' && (this.policy.weeklyThreshold === undefined || this.policy.weeklyMultiplier === undefined)) {
      throw new Error('weeklyThreshold and weeklyMultiplier are required for weekly mode. Use .weeklyThreshold(hours, multiplier)');
    }
    if (this.policy.mode === 'monthly' && (this.policy.monthlyThreshold === undefined || this.policy.monthlyMultiplier === undefined)) {
      throw new Error('monthlyThreshold and monthlyMultiplier are required for monthly mode. Use .monthlyThreshold(hours, multiplier)');
    }

    return this.policy as OvertimePolicy;
  }

  /** @internal */
  _getPolicy(): Partial<OvertimePolicy> {
    return this.policy;
  }
}

// ============================================================================
// Clock Rounding Policy Builder
// ============================================================================

/**
 * Builder for clock rounding policies
 */
export class ClockRoundingPolicyBuilder<TParent = unknown> {
  private policy: Partial<ClockRoundingPolicy> = {
    enabled: false,
  };
  private parent?: TParent;

  constructor(parent?: TParent) {
    this.parent = parent;
  }

  /**
   * Enable clock rounding
   */
  enable(): this {
    this.policy.enabled = true;
    return this;
  }

  /**
   * Disable clock rounding
   */
  disable(): this {
    this.policy.enabled = false;
    return this;
  }

  /**
   * Set rounding interval in minutes
   *
   * @param minutes - Round to nearest N minutes (e.g., 5, 10, 15)
   */
  roundTo(minutes: 5 | 10 | 15): this {
    this.policy.roundTo = minutes;
    return this;
  }

  /**
   * Set rounding mode
   *
   * @param mode - 'up' (favor employee) | 'down' (favor employer) | 'nearest' (neutral)
   */
  roundingMode(mode: 'up' | 'down' | 'nearest'): this {
    this.policy.mode = mode;
    return this;
  }

  /**
   * Finish building this policy and return to parent builder
   */
  end(): TParent {
    if (!this.parent) {
      throw new Error('Cannot call end() without parent builder');
    }
    return this.parent;
  }

  /**
   * Build the policy (for standalone usage)
   */
  build(): ClockRoundingPolicy {
    if (this.policy.enabled && (this.policy.roundTo === undefined || this.policy.mode === undefined)) {
      throw new Error('roundTo and mode are required when clock rounding is enabled');
    }

    return this.policy as ClockRoundingPolicy;
  }

  /** @internal */
  _getPolicy(): Partial<ClockRoundingPolicy> {
    return this.policy;
  }
}

// ============================================================================
// Main Attendance Policy Builder
// ============================================================================

/**
 * Main builder for creating complete attendance policies
 *
 * @example
 * ```typescript
 * const policy = AttendancePolicyBuilder.create()
 *   .named('Manufacturing Policy')
 *   .description('Strict policy for factory floor')
 *   .organizationId(orgId)
 *   .lateArrival()
 *     .enable()
 *     .gracePeriod(0)
 *     .flatPenalty(100)
 *     .maxPenalties(5, 'monthly')
 *     .resetOccurrences('quarterly')
 *   .end()
 *   .earlyDeparture()
 *     .enable()
 *     .gracePeriod(0)
 *     .flatPenalty(150)
 *   .end()
 *   .overtime()
 *     .enable()
 *     .mode('daily')
 *     .dailyThreshold(8, 1.5)
 *     .weeklyThreshold(40, 2.0)
 *   .end()
 *   .clockRounding()
 *     .enable()
 *     .roundTo(15)
 *     .roundingMode('down')
 *   .end()
 *   .effectiveFrom(new Date('2025-01-01'))
 *   .build();
 * ```
 */
export class AttendancePolicyBuilder {
  private policy: Partial<AttendancePolicy> = {
    active: true,
    effectiveFrom: new Date(),
  };

  private lateArrivalBuilder?: LatePolicyBuilder<this>;
  private earlyDepartureBuilder?: LatePolicyBuilder<this>;
  private overtimeBuilder?: OvertimePolicyBuilder<this>;
  private clockRoundingBuilder?: ClockRoundingPolicyBuilder<this>;

  /**
   * Create a new policy builder
   */
  static create(): AttendancePolicyBuilder {
    return new AttendancePolicyBuilder();
  }

  /**
   * Set policy name
   */
  named(name: string): this {
    this.policy.name = name;
    return this;
  }

  /**
   * Set policy description
   */
  description(description: string): this {
    this.policy.description = description;
    return this;
  }

  /**
   * Set organization ID (for multi-tenant systems)
   */
  organizationId(id: ObjectIdLike): this {
    this.policy.organizationId = id;
    return this;
  }

  /**
   * Set policy ID (for updates)
   */
  id(id: string): this {
    this.policy.id = id;
    return this;
  }

  /**
   * Set effective from date
   */
  effectiveFrom(date: Date): this {
    this.policy.effectiveFrom = date;
    return this;
  }

  /**
   * Set effective to date (when policy expires)
   */
  effectiveTo(date: Date | null): this {
    this.policy.effectiveTo = date;
    return this;
  }

  /**
   * Set policy active status
   */
  active(active: boolean): this {
    this.policy.active = active;
    return this;
  }

  /**
   * Start building late arrival policy
   */
  lateArrival(): LatePolicyBuilder<this> {
    if (!this.lateArrivalBuilder) {
      this.lateArrivalBuilder = new LatePolicyBuilder<this>(this);
    }
    return this.lateArrivalBuilder;
  }

  /**
   * Start building early departure policy
   */
  earlyDeparture(): LatePolicyBuilder<this> {
    if (!this.earlyDepartureBuilder) {
      this.earlyDepartureBuilder = new LatePolicyBuilder<this>(this);
    }
    return this.earlyDepartureBuilder;
  }

  /**
   * Start building overtime policy
   */
  overtime(): OvertimePolicyBuilder<this> {
    if (!this.overtimeBuilder) {
      this.overtimeBuilder = new OvertimePolicyBuilder<this>(this);
    }
    return this.overtimeBuilder;
  }

  /**
   * Start building clock rounding policy
   */
  clockRounding(): ClockRoundingPolicyBuilder<this> {
    if (!this.clockRoundingBuilder) {
      this.clockRoundingBuilder = new ClockRoundingPolicyBuilder<this>(this);
    }
    return this.clockRoundingBuilder;
  }

  /**
   * Build the complete attendance policy
   */
  build(): AttendancePolicy {
    // Validate required fields
    if (!this.policy.name) {
      throw new Error('Policy name is required. Use .named(name)');
    }

    // Build sub-policies
    if (this.lateArrivalBuilder) {
      this.policy.lateArrival = this.lateArrivalBuilder.build();
    } else {
      throw new Error('Late arrival policy is required. Use .lateArrival()...end()');
    }

    if (this.earlyDepartureBuilder) {
      this.policy.earlyDeparture = this.earlyDepartureBuilder.build();
    } else {
      throw new Error('Early departure policy is required. Use .earlyDeparture()...end()');
    }

    if (this.overtimeBuilder) {
      this.policy.overtime = this.overtimeBuilder.build();
    } else {
      throw new Error('Overtime policy is required. Use .overtime()...end()');
    }

    // Clock rounding is optional
    if (this.clockRoundingBuilder) {
      this.policy.clockRounding = this.clockRoundingBuilder.build();
    }

    return this.policy as AttendancePolicy;
  }
}

// ============================================================================
// Standalone Builder Exports
// ============================================================================

/**
 * Create a standalone late arrival policy builder
 */
export function createLatePolicyBuilder(): LatePolicyBuilder<void> {
  return new LatePolicyBuilder<void>();
}

/**
 * Create a standalone overtime policy builder
 */
export function createOvertimePolicyBuilder(): OvertimePolicyBuilder<void> {
  return new OvertimePolicyBuilder<void>();
}

/**
 * Create a standalone clock rounding policy builder
 */
export function createClockRoundingPolicyBuilder(): ClockRoundingPolicyBuilder<void> {
  return new ClockRoundingPolicyBuilder<void>();
}

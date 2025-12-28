/**
 * Shift Compliance Builders Tests
 *
 * Tests for the fluent builder API for creating attendance policies.
 */

import { describe, it, expect } from 'vitest';
import { AttendancePolicyBuilder } from '../src/shift-compliance/builders.js';

describe('AttendancePolicyBuilder', () => {
  it('should build a basic policy with flat penalties', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Test Policy')
      .description('A test policy')
      .lateArrival()
        .enable()
        .gracePeriod(10)
        .flatPenalty(50)
      .end()
      .earlyDeparture()
        .enable()
        .gracePeriod(5)
        .flatPenalty(75)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
      .end()
      .build();

    expect(policy.name).toBe('Test Policy');
    expect(policy.description).toBe('A test policy');
    expect(policy.lateArrival.enabled).toBe(true);
    expect(policy.lateArrival.gracePeriod).toBe(10);
    expect(policy.lateArrival.mode).toBe('flat');
    expect(policy.lateArrival.flatAmount).toBe(50);
    expect(policy.earlyDeparture.flatAmount).toBe(75);
    expect(policy.overtime.mode).toBe('daily');
    expect(policy.overtime.dailyThreshold).toBe(8);
    expect(policy.overtime.dailyMultiplier).toBe(1.5);
  });

  it('should build a policy with tiered penalties', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Progressive Policy')
      .lateArrival()
        .enable()
        .gracePeriod(15)
        .tieredPenalty()
          .tier(1, 2).warning()
          .tier(3, 4).penalty(25)
          .tier(5).penalty(50)
        .end()
        .maxPenalties(5, 'monthly')
        .resetOccurrences('quarterly')
      .end()
      .earlyDeparture()
        .disable()
        .flatPenalty(0)
      .end()
      .overtime()
        .enable()
        .mode('weekly')
        .weeklyThreshold(40, 1.5)
      .end()
      .build();

    expect(policy.name).toBe('Progressive Policy');
    expect(policy.lateArrival.mode).toBe('tiered');
    expect(policy.lateArrival.tiers).toHaveLength(3);
    expect(policy.lateArrival.tiers![0]).toEqual({
      from: 1,
      to: 2,
      penalty: 0,
      warning: true,
    });
    expect(policy.lateArrival.tiers![1]).toEqual({
      from: 3,
      to: 4,
      penalty: 25,
      warning: false,
    });
    expect(policy.lateArrival.tiers![2]).toEqual({
      from: 5,
      penalty: 50,
      warning: false,
    });
    expect(policy.lateArrival.maxPenaltiesPerPeriod).toEqual({
      count: 5,
      period: 'monthly',
    });
    expect(policy.lateArrival.resetOccurrenceCount).toBe('quarterly');
    expect(policy.earlyDeparture.enabled).toBe(false);
  });

  it('should build a policy with per-minute penalties', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Per-Minute Policy')
      .lateArrival()
        .enable()
        .gracePeriod(0)
        .perMinutePenalty(2)
      .end()
      .earlyDeparture()
        .enable()
        .perMinutePenalty(3)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
      .end()
      .build();

    expect(policy.lateArrival.mode).toBe('per-minute');
    expect(policy.lateArrival.perMinuteRate).toBe(2);
    expect(policy.earlyDeparture.mode).toBe('per-minute');
    expect(policy.earlyDeparture.perMinuteRate).toBe(3);
  });

  it('should build a policy with percentage penalties', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Percentage Policy')
      .lateArrival()
        .enable()
        .gracePeriod(5)
        .percentagePenalty(2)
      .end()
      .earlyDeparture()
        .enable()
        .percentagePenalty(3)
      .end()
      .overtime()
        .enable()
        .mode('weekly')
        .weeklyThreshold(40, 1.5)
      .end()
      .build();

    expect(policy.lateArrival.mode).toBe('percentage');
    expect(policy.lateArrival.percentageRate).toBe(2);
    expect(policy.earlyDeparture.percentageRate).toBe(3);
  });

  it('should build a policy with weekend premiums', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Retail Policy')
      .lateArrival()
        .enable()
        .flatPenalty(25)
      .end()
      .earlyDeparture()
        .enable()
        .flatPenalty(25)
      .end()
      .overtime()
        .enable()
        .mode('weekly')
        .weeklyThreshold(40, 1.5)
        .weekendPremium(1.5, 2.0)
      .end()
      .build();

    expect(policy.overtime.weekendPremium).toEqual({
      saturday: 1.5,
      sunday: 2.0,
    });
  });

  it('should build a policy with night shift differential', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Healthcare Policy')
      .lateArrival()
        .enable()
        .flatPenalty(50)
      .end()
      .earlyDeparture()
        .enable()
        .flatPenalty(75)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
        .nightShiftDifferential(22, 6, 1.3)
      .end()
      .build();

    expect(policy.overtime.nightShiftDifferential).toEqual({
      startHour: 22,
      endHour: 6,
      multiplier: 1.3,
    });
  });

  it('should build a policy with clock rounding', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Manufacturing Policy')
      .lateArrival()
        .enable()
        .flatPenalty(100)
      .end()
      .earlyDeparture()
        .enable()
        .flatPenalty(150)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
      .end()
      .clockRounding()
        .enable()
        .roundTo(15)
        .roundingMode('down')
      .end()
      .build();

    expect(policy.clockRounding).toBeDefined();
    expect(policy.clockRounding!.enabled).toBe(true);
    expect(policy.clockRounding!.roundTo).toBe(15);
    expect(policy.clockRounding!.mode).toBe('down');
  });

  it('should set effective dates correctly', () => {
    const effectiveFrom = new Date('2025-01-01');
    const effectiveTo = new Date('2025-12-31');

    const policy = AttendancePolicyBuilder.create()
      .named('Temporary Policy')
      .effectiveFrom(effectiveFrom)
      .effectiveTo(effectiveTo)
      .active(true)
      .lateArrival()
        .enable()
        .flatPenalty(50)
      .end()
      .earlyDeparture()
        .enable()
        .flatPenalty(50)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
      .end()
      .build();

    expect(policy.effectiveFrom).toEqual(effectiveFrom);
    expect(policy.effectiveTo).toEqual(effectiveTo);
    expect(policy.active).toBe(true);
  });

  it('should throw error when required fields are missing', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .lateArrival()
          .enable()
          .flatPenalty(50)
        .end()
        .earlyDeparture()
          .enable()
          .flatPenalty(50)
        .end()
        .overtime()
          .enable()
          .mode('daily')
          .dailyThreshold(8, 1.5)
        .end()
        .build();
    }).toThrow('Policy name is required');
  });

  it('should throw error when late arrival policy is missing', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .named('Incomplete Policy')
        .earlyDeparture()
          .enable()
          .flatPenalty(50)
        .end()
        .overtime()
          .enable()
          .mode('daily')
          .dailyThreshold(8, 1.5)
        .end()
        .build();
    }).toThrow('Late arrival policy is required');
  });

  it('should throw error when early departure policy is missing', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .named('Incomplete Policy')
        .lateArrival()
          .enable()
          .flatPenalty(50)
        .end()
        .overtime()
          .enable()
          .mode('daily')
          .dailyThreshold(8, 1.5)
        .end()
        .build();
    }).toThrow('Early departure policy is required');
  });

  it('should throw error when overtime policy is missing', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .named('Incomplete Policy')
        .lateArrival()
          .enable()
          .flatPenalty(50)
        .end()
        .earlyDeparture()
          .enable()
          .flatPenalty(50)
        .end()
        .build();
    }).toThrow('Overtime policy is required');
  });

  it('should throw error when penalty mode is not set', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .named('Invalid Policy')
        .lateArrival()
          .enable()
          .gracePeriod(10)
        .end()
        .earlyDeparture()
          .enable()
          .flatPenalty(50)
        .end()
        .overtime()
          .enable()
          .mode('daily')
          .dailyThreshold(8, 1.5)
        .end()
        .build();  // Now validation runs
    }).toThrow('Penalty mode is required');
  });

  it('should throw error for tiered penalty without tiers', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .named('Invalid Policy')
        .lateArrival()
          .enable()
          .tieredPenalty()
          .end()
        .end()
        .earlyDeparture()
          .enable()
          .flatPenalty(50)
        .end()
        .overtime()
          .enable()
          .mode('daily')
          .dailyThreshold(8, 1.5)
        .end()
        .build();  // Now validation runs
    }).toThrow('At least one tier is required');
  });

  it('should throw error when overtime mode-specific fields are missing', () => {
    expect(() => {
      AttendancePolicyBuilder.create()
        .named('Invalid Policy')
        .lateArrival()
          .enable()
          .flatPenalty(50)
        .end()
        .earlyDeparture()
          .enable()
          .flatPenalty(50)
        .end()
        .overtime()
          .enable()
          .mode('daily')
          // Missing dailyThreshold and dailyMultiplier
        .end()
        .build();
    }).toThrow('dailyThreshold and dailyMultiplier are required');
  });

  it('should support method chaining for multiple configurations', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Complex Policy')
      .description('A complex policy with multiple features')
      .lateArrival()
        .enable()
        .gracePeriod(10)
        .tieredPenalty()
          .tier(1, 2).warning()
          .tier(3, 4).penalty(25)
          .tier(5).penalty(50)
        .end()
        .maxPenalties(5, 'monthly')
        .resetOccurrences('quarterly')
      .end()
      .earlyDeparture()
        .enable()
        .gracePeriod(5)
        .flatPenalty(30)
        .maxPenalties(3, 'monthly')
      .end()
      .overtime()
        .enable()
        .mode('weekly')
        .weeklyThreshold(40, 1.5)
        .weekendPremium(1.5, 2.0)
        .nightShiftDifferential(22, 6, 1.3)
      .end()
      .clockRounding()
        .enable()
        .roundTo(15)
        .roundingMode('nearest')
      .end()
      .build();

    expect(policy.name).toBe('Complex Policy');
    expect(policy.lateArrival.tiers).toHaveLength(3);
    expect(policy.earlyDeparture.flatAmount).toBe(30);
    expect(policy.overtime.weekendPremium).toBeDefined();
    expect(policy.overtime.nightShiftDifferential).toBeDefined();
    expect(policy.clockRounding).toBeDefined();
  });

  it('should allow updating existing policies', () => {
    const policy = AttendancePolicyBuilder.create()
      .id('existing-policy-id')
      .named('Updated Policy')
      .lateArrival()
        .enable()
        .flatPenalty(50)
      .end()
      .earlyDeparture()
        .enable()
        .flatPenalty(50)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
      .end()
      .build();

    expect(policy.id).toBe('existing-policy-id');
  });

  it('should support organization ID for multi-tenant systems', () => {
    const policy = AttendancePolicyBuilder.create()
      .named('Org Policy')
      .organizationId('org-123')
      .lateArrival()
        .enable()
        .flatPenalty(50)
      .end()
      .earlyDeparture()
        .enable()
        .flatPenalty(50)
      .end()
      .overtime()
        .enable()
        .mode('daily')
        .dailyThreshold(8, 1.5)
      .end()
      .build();

    expect(policy.organizationId).toBe('org-123');
  });
});

describe('LatePolicyBuilder standalone', () => {
  it('should build standalone late arrival policy', async () => {
    const { createLatePolicyBuilder } = await import('../src/shift-compliance/builders.js');

    const policy = createLatePolicyBuilder()
      .enable()
      .gracePeriod(10)
      .flatPenalty(50)
      .build();

    expect(policy.enabled).toBe(true);
    expect(policy.gracePeriod).toBe(10);
    expect(policy.mode).toBe('flat');
    expect(policy.flatAmount).toBe(50);
  });
});

describe('OvertimePolicyBuilder standalone', () => {
  it('should build standalone overtime policy', async () => {
    const { createOvertimePolicyBuilder } = await import('../src/shift-compliance/builders.js');

    const policy = createOvertimePolicyBuilder()
      .enable()
      .mode('daily')
      .dailyThreshold(8, 1.5)
      .weekendPremium(1.5, 2.0)
      .build();

    expect(policy.enabled).toBe(true);
    expect(policy.mode).toBe('daily');
    expect(policy.dailyThreshold).toBe(8);
    expect(policy.dailyMultiplier).toBe(1.5);
    expect(policy.weekendPremium).toEqual({
      saturday: 1.5,
      sunday: 2.0,
    });
  });
});

describe('ClockRoundingPolicyBuilder standalone', () => {
  it('should build standalone clock rounding policy', async () => {
    const { createClockRoundingPolicyBuilder } = await import('../src/shift-compliance/builders.js');

    const policy = createClockRoundingPolicyBuilder()
      .enable()
      .roundTo(15)
      .roundingMode('nearest')
      .build();

    expect(policy.enabled).toBe(true);
    expect(policy.roundTo).toBe(15);
    expect(policy.mode).toBe('nearest');
  });

  it('should allow disabled clock rounding', async () => {
    const { createClockRoundingPolicyBuilder } = await import('../src/shift-compliance/builders.js');

    const policy = createClockRoundingPolicyBuilder()
      .disable()
      .build();

    expect(policy.enabled).toBe(false);
  });
});

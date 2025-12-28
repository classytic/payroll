/**
 * Shift Compliance Presets Tests
 *
 * Tests for industry-standard preset policies.
 */

import { describe, it, expect } from 'vitest';
import {
  createPolicyFromPreset,
  DEFAULT_ATTENDANCE_POLICY,
  MANUFACTURING_POLICY,
  RETAIL_POLICY,
  OFFICE_POLICY,
  HEALTHCARE_POLICY,
  HOSPITALITY_POLICY,
} from '../src/shift-compliance/config.js';

describe('Preset Policies', () => {
  describe('DEFAULT_ATTENDANCE_POLICY', () => {
    it('should have moderate office-friendly settings', () => {
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.enabled).toBe(true);
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.gracePeriod).toBe(10);
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.mode).toBe('tiered');
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.tiers).toHaveLength(3);

      // Verify tiered structure
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.tiers![0]).toEqual({
        from: 1,
        to: 2,
        penalty: 0,
        warning: true,
      });
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.tiers![1]).toEqual({
        from: 3,
        to: 4,
        penalty: 25,
      });
      expect(DEFAULT_ATTENDANCE_POLICY.lateArrival.tiers![2]).toEqual({
        from: 5,
        penalty: 50,
      });
    });

    it('should have early departure settings', () => {
      expect(DEFAULT_ATTENDANCE_POLICY.earlyDeparture.enabled).toBe(true);
      expect(DEFAULT_ATTENDANCE_POLICY.earlyDeparture.gracePeriod).toBe(10);
      expect(DEFAULT_ATTENDANCE_POLICY.earlyDeparture.mode).toBe('tiered');
    });

    it('should have overtime settings', () => {
      expect(DEFAULT_ATTENDANCE_POLICY.overtime.enabled).toBe(true);
      expect(DEFAULT_ATTENDANCE_POLICY.overtime.mode).toBe('daily');
      expect(DEFAULT_ATTENDANCE_POLICY.overtime.dailyThreshold).toBe(8);
      expect(DEFAULT_ATTENDANCE_POLICY.overtime.dailyMultiplier).toBe(1.5);
      expect(DEFAULT_ATTENDANCE_POLICY.overtime.weeklyThreshold).toBe(40);
      expect(DEFAULT_ATTENDANCE_POLICY.overtime.weeklyMultiplier).toBe(1.5);
    });

    it('should have clock rounding disabled by default', () => {
      expect(DEFAULT_ATTENDANCE_POLICY.clockRounding?.enabled).toBe(false);
    });
  });

  describe('MANUFACTURING_POLICY', () => {
    it('should have strict zero-tolerance settings', () => {
      expect(MANUFACTURING_POLICY.lateArrival.gracePeriod).toBe(0);
      expect(MANUFACTURING_POLICY.lateArrival.mode).toBe('flat');
      expect(MANUFACTURING_POLICY.lateArrival.flatAmount).toBe(100);
    });

    it('should have higher penalty for early departure', () => {
      expect(MANUFACTURING_POLICY.earlyDeparture.flatAmount).toBe(150);
    });

    it('should have double time for weekly overtime', () => {
      expect(MANUFACTURING_POLICY.overtime.weeklyMultiplier).toBe(2.0);
    });

    it('should have clock rounding enabled (favor employer)', () => {
      expect(MANUFACTURING_POLICY.clockRounding?.enabled).toBe(true);
      expect(MANUFACTURING_POLICY.clockRounding?.roundTo).toBe(15);
      expect(MANUFACTURING_POLICY.clockRounding?.mode).toBe('down');
    });
  });

  describe('RETAIL_POLICY', () => {
    it('should have flexible settings with short grace period', () => {
      expect(RETAIL_POLICY.lateArrival.gracePeriod).toBe(5);
      expect(RETAIL_POLICY.lateArrival.mode).toBe('flat');
      expect(RETAIL_POLICY.lateArrival.flatAmount).toBe(25);
    });

    it('should have weekend premiums', () => {
      expect(RETAIL_POLICY.overtime.weekendPremium).toBeDefined();
      expect(RETAIL_POLICY.overtime.weekendPremium?.saturday).toBe(1.5);
      expect(RETAIL_POLICY.overtime.weekendPremium?.sunday).toBe(2.0);
    });

    it('should use weekly overtime mode', () => {
      expect(RETAIL_POLICY.overtime.mode).toBe('weekly');
      expect(RETAIL_POLICY.overtime.weeklyThreshold).toBe(40);
    });

    it('should reset occurrences monthly', () => {
      expect(RETAIL_POLICY.lateArrival.resetOccurrenceCount).toBe('monthly');
    });
  });

  describe('OFFICE_POLICY', () => {
    it('should have very flexible settings', () => {
      expect(OFFICE_POLICY.lateArrival.gracePeriod).toBe(15);
      expect(OFFICE_POLICY.lateArrival.mode).toBe('tiered');
    });

    it('should have lenient progressive discipline', () => {
      const tiers = OFFICE_POLICY.lateArrival.tiers!;
      expect(tiers[0]).toEqual({
        from: 1,
        to: 3,
        penalty: 0,
        warning: true,
      });
      expect(tiers[1]).toEqual({
        from: 4,
        to: 5,
        penalty: 20,
      });
      expect(tiers[2]).toEqual({
        from: 6,
        penalty: 40,
      });
    });

    it('should have early departure disabled', () => {
      expect(OFFICE_POLICY.earlyDeparture.enabled).toBe(false);
    });

    it('should have no clock rounding', () => {
      expect(OFFICE_POLICY.clockRounding?.enabled).toBe(false);
    });

    it('should have lower max penalties per period', () => {
      expect(OFFICE_POLICY.lateArrival.maxPenaltiesPerPeriod?.count).toBe(3);
    });
  });

  describe('HEALTHCARE_POLICY', () => {
    it('should have strict settings for patient care', () => {
      expect(HEALTHCARE_POLICY.lateArrival.gracePeriod).toBe(5);
      expect(HEALTHCARE_POLICY.lateArrival.flatAmount).toBe(50);
      expect(HEALTHCARE_POLICY.earlyDeparture.flatAmount).toBe(75);
    });

    it('should have night shift differential', () => {
      expect(HEALTHCARE_POLICY.overtime.nightShiftDifferential).toBeDefined();
      expect(HEALTHCARE_POLICY.overtime.nightShiftDifferential?.startHour).toBe(22);
      expect(HEALTHCARE_POLICY.overtime.nightShiftDifferential?.endHour).toBe(6);
      expect(HEALTHCARE_POLICY.overtime.nightShiftDifferential?.multiplier).toBe(1.3);
    });

    it('should have weekend premiums', () => {
      expect(HEALTHCARE_POLICY.overtime.weekendPremium).toBeDefined();
      expect(HEALTHCARE_POLICY.overtime.weekendPremium?.saturday).toBe(1.5);
      expect(HEALTHCARE_POLICY.overtime.weekendPremium?.sunday).toBe(2.0);
    });

    it('should use daily overtime mode', () => {
      expect(HEALTHCARE_POLICY.overtime.mode).toBe('daily');
    });
  });

  describe('HOSPITALITY_POLICY', () => {
    it('should have percentage-based penalties', () => {
      expect(HOSPITALITY_POLICY.lateArrival.mode).toBe('percentage');
      expect(HOSPITALITY_POLICY.lateArrival.percentageRate).toBe(1);
      expect(HOSPITALITY_POLICY.earlyDeparture.percentageRate).toBe(1.5);
    });

    it('should have night shift differential', () => {
      expect(HOSPITALITY_POLICY.overtime.nightShiftDifferential).toBeDefined();
      expect(HOSPITALITY_POLICY.overtime.nightShiftDifferential?.multiplier).toBe(1.2);
    });

    it('should have weekend premiums', () => {
      expect(HOSPITALITY_POLICY.overtime.weekendPremium).toBeDefined();
      expect(HOSPITALITY_POLICY.overtime.weekendPremium?.saturday).toBe(1.25);
      expect(HOSPITALITY_POLICY.overtime.weekendPremium?.sunday).toBe(1.5);
    });

    it('should have clock rounding enabled', () => {
      expect(HOSPITALITY_POLICY.clockRounding?.enabled).toBe(true);
      expect(HOSPITALITY_POLICY.clockRounding?.roundTo).toBe(10);
      expect(HOSPITALITY_POLICY.clockRounding?.mode).toBe('nearest');
    });
  });
});

describe('createPolicyFromPreset', () => {
  it('should create a policy from default preset', () => {
    const policy = createPolicyFromPreset('default', {
      name: 'My Default Policy',
    });

    expect(policy.name).toBe('My Default Policy');
    expect(policy.lateArrival.gracePeriod).toBe(10);
    expect(policy.active).toBe(true);
    expect(policy.effectiveFrom).toBeInstanceOf(Date);
  });

  it('should create a policy from manufacturing preset', () => {
    const policy = createPolicyFromPreset('manufacturing');

    expect(policy.name).toBe('Manufacturing Policy');
    expect(policy.lateArrival.flatAmount).toBe(100);
    expect(policy.earlyDeparture.flatAmount).toBe(150);
  });

  it('should create a policy from retail preset', () => {
    const policy = createPolicyFromPreset('retail');

    expect(policy.name).toBe('Retail Policy');
    expect(policy.overtime.weekendPremium).toBeDefined();
  });

  it('should create a policy from office preset', () => {
    const policy = createPolicyFromPreset('office');

    expect(policy.name).toBe('Office Policy');
    expect(policy.lateArrival.gracePeriod).toBe(15);
    expect(policy.earlyDeparture.enabled).toBe(false);
  });

  it('should create a policy from healthcare preset', () => {
    const policy = createPolicyFromPreset('healthcare');

    expect(policy.name).toBe('Healthcare Policy');
    expect(policy.overtime.nightShiftDifferential).toBeDefined();
  });

  it('should create a policy from hospitality preset', () => {
    const policy = createPolicyFromPreset('hospitality');

    expect(policy.name).toBe('Hospitality Policy');
    expect(policy.lateArrival.mode).toBe('percentage');
  });

  it('should allow overriding preset values', () => {
    const effectiveFrom = new Date('2025-06-01');

    const policy = createPolicyFromPreset('manufacturing', {
      name: 'Custom Factory Policy',
      effectiveFrom,
      active: false,
      lateArrival: {
        enabled: true,
        gracePeriod: 5, // Override the zero grace period
        mode: 'flat',
        flatAmount: 75, // Lower penalty than default
      },
    } as any);

    expect(policy.name).toBe('Custom Factory Policy');
    expect(policy.effectiveFrom).toEqual(effectiveFrom);
    expect(policy.active).toBe(false);
    expect(policy.lateArrival.gracePeriod).toBe(5);
    expect(policy.lateArrival.flatAmount).toBe(75);
  });

  it('should support organization ID override', () => {
    const policy = createPolicyFromPreset('default', {
      name: 'Org Policy',
      organizationId: 'org-123',
    } as any);

    expect(policy.organizationId).toBe('org-123');
  });

  it('should generate default name if not provided', () => {
    const policy = createPolicyFromPreset('manufacturing');

    expect(policy.name).toBe('Manufacturing Policy');
  });

  it('should set active to true by default', () => {
    const policy = createPolicyFromPreset('default');

    expect(policy.active).toBe(true);
  });

  it('should set effectiveFrom to current date by default', () => {
    const before = new Date();
    const policy = createPolicyFromPreset('default');
    const after = new Date();

    expect(policy.effectiveFrom.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(policy.effectiveFrom.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should preserve all preset characteristics', () => {
    const policy = createPolicyFromPreset('healthcare', {
      name: 'Hospital Policy',
    });

    // Should preserve all healthcare-specific settings
    expect(policy.overtime.nightShiftDifferential).toBeDefined();
    expect(policy.overtime.weekendPremium).toBeDefined();
    expect(policy.lateArrival.flatAmount).toBe(50);
    expect(policy.earlyDeparture.flatAmount).toBe(75);
  });
});

describe('Preset Policy Validation', () => {
  it('all presets should have valid late arrival settings', () => {
    const presets = [
      DEFAULT_ATTENDANCE_POLICY,
      MANUFACTURING_POLICY,
      RETAIL_POLICY,
      OFFICE_POLICY,
      HEALTHCARE_POLICY,
      HOSPITALITY_POLICY,
    ];

    presets.forEach((preset) => {
      expect(preset.lateArrival.enabled).toBeDefined();
      expect(preset.lateArrival.gracePeriod).toBeGreaterThanOrEqual(0);
      expect(['flat', 'per-minute', 'percentage', 'tiered']).toContain(preset.lateArrival.mode);
    });
  });

  it('all presets should have valid early departure settings', () => {
    const presets = [
      DEFAULT_ATTENDANCE_POLICY,
      MANUFACTURING_POLICY,
      RETAIL_POLICY,
      OFFICE_POLICY,
      HEALTHCARE_POLICY,
      HOSPITALITY_POLICY,
    ];

    presets.forEach((preset) => {
      expect(preset.earlyDeparture.enabled).toBeDefined();
      expect(['flat', 'per-minute', 'percentage', 'tiered']).toContain(preset.earlyDeparture.mode);
    });
  });

  it('all presets should have valid overtime settings', () => {
    const presets = [
      DEFAULT_ATTENDANCE_POLICY,
      MANUFACTURING_POLICY,
      RETAIL_POLICY,
      OFFICE_POLICY,
      HEALTHCARE_POLICY,
      HOSPITALITY_POLICY,
    ];

    presets.forEach((preset) => {
      expect(preset.overtime.enabled).toBeDefined();
      expect(['daily', 'weekly', 'monthly']).toContain(preset.overtime.mode);

      if (preset.overtime.mode === 'daily') {
        expect(preset.overtime.dailyThreshold).toBeDefined();
        expect(preset.overtime.dailyMultiplier).toBeGreaterThanOrEqual(1);
      }

      if (preset.overtime.mode === 'weekly') {
        expect(preset.overtime.weeklyThreshold).toBeDefined();
        expect(preset.overtime.weeklyMultiplier).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it('tiered presets should have valid tier structures', () => {
    const tieredPresets = [
      DEFAULT_ATTENDANCE_POLICY,
      OFFICE_POLICY,
    ];

    tieredPresets.forEach((preset) => {
      expect(preset.lateArrival.tiers).toBeDefined();
      expect(preset.lateArrival.tiers!.length).toBeGreaterThan(0);

      preset.lateArrival.tiers!.forEach((tier, index) => {
        expect(tier.from).toBeGreaterThan(0);
        expect(tier.penalty).toBeGreaterThanOrEqual(0);

        // If there's a next tier, ensure ordering is correct
        if (index < preset.lateArrival.tiers!.length - 1) {
          const nextTier = preset.lateArrival.tiers![index + 1];
          expect(nextTier.from).toBeGreaterThan(tier.from);
        }
      });
    });
  });

  it('weekend premium presets should have valid multipliers', () => {
    const weekendPresets = [
      RETAIL_POLICY,
      HEALTHCARE_POLICY,
      HOSPITALITY_POLICY,
    ];

    weekendPresets.forEach((preset) => {
      expect(preset.overtime.weekendPremium).toBeDefined();
      expect(preset.overtime.weekendPremium!.saturday).toBeGreaterThanOrEqual(1);
      expect(preset.overtime.weekendPremium!.sunday).toBeGreaterThanOrEqual(1);
    });
  });

  it('night shift presets should have valid time ranges', () => {
    const nightShiftPresets = [
      HEALTHCARE_POLICY,
      HOSPITALITY_POLICY,
    ];

    nightShiftPresets.forEach((preset) => {
      const diff = preset.overtime.nightShiftDifferential!;
      expect(diff.startHour).toBeGreaterThanOrEqual(0);
      expect(diff.startHour).toBeLessThan(24);
      expect(diff.endHour).toBeGreaterThanOrEqual(0);
      expect(diff.endHour).toBeLessThan(24);
      expect(diff.multiplier).toBeGreaterThan(1);
    });
  });
});

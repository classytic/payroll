/**
 * Shift Compliance Calculators Tests
 *
 * Comprehensive tests for shift compliance calculation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateShiftCompliance,
  calculateLatePenalty,
  calculateOvertimeBonus,
} from '../src/shift-compliance/calculators/index.js';
import type {
  AttendancePolicy,
  LateArrivalPolicy,
  OvertimePolicy,
  LateOccurrence,
  OvertimeOccurrence,
} from '../src/shift-compliance/types.js';

// ============================================================================
// Helper Functions
// ============================================================================

function createDate(dateString: string): Date {
  return new Date(dateString);
}

// ============================================================================
// Late Penalty Calculator Tests
// ============================================================================

describe('calculateLatePenalty', () => {
  it('should return zero when policy is disabled', () => {
    const policy: LateArrivalPolicy = {
      enabled: false,
      gracePeriod: 0,
      mode: 'flat',
      flatAmount: 50,
    };

    const occurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:15:00'),
        minutesLate: 15,
      },
    ];

    const result = calculateLatePenalty({ policy, occurrences });
    expect(result.amount).toBe(0);
    expect(result.occurrences).toBe(0);
  });

  it('should filter occurrences within grace period', () => {
    const policy: LateArrivalPolicy = {
      enabled: true,
      gracePeriod: 10,
      mode: 'flat',
      flatAmount: 50,
    };

    const occurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:05:00'),
        minutesLate: 5, // Within grace period
      },
      {
        date: createDate('2025-01-16'),
        scheduledTime: createDate('2025-01-16T09:00:00'),
        actualTime: createDate('2025-01-16T09:15:00'),
        minutesLate: 15, // Beyond grace period
      },
    ];

    const result = calculateLatePenalty({ policy, occurrences });
    expect(result.amount).toBe(50); // Only 1 penalizable occurrence
    expect(result.occurrences).toBe(1);
    expect(result.breakdown).toHaveLength(1);
  });

  it('should calculate flat penalty correctly', () => {
    const policy: LateArrivalPolicy = {
      enabled: true,
      gracePeriod: 0,
      mode: 'flat',
      flatAmount: 50,
    };

    const occurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:10:00'),
        minutesLate: 10,
      },
      {
        date: createDate('2025-01-16'),
        scheduledTime: createDate('2025-01-16T09:00:00'),
        actualTime: createDate('2025-01-16T09:20:00'),
        minutesLate: 20,
      },
    ];

    const result = calculateLatePenalty({ policy, occurrences });
    expect(result.amount).toBe(100); // 2 occurrences * $50
    expect(result.occurrences).toBe(2);
  });

  it('should calculate per-minute penalty correctly', () => {
    const policy: LateArrivalPolicy = {
      enabled: true,
      gracePeriod: 0,
      mode: 'per-minute',
      perMinuteRate: 2,
    };

    const occurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:30:00'),
        minutesLate: 30,
      },
    ];

    const result = calculateLatePenalty({ policy, occurrences, totalLateMinutes: 30 });
    expect(result.amount).toBe(60); // 30 minutes * $2
    expect(result.occurrences).toBe(1);
  });

  it('should calculate percentage penalty correctly', () => {
    const policy: LateArrivalPolicy = {
      enabled: true,
      gracePeriod: 0,
      mode: 'percentage',
      percentageRate: 2,
    };

    const occurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:10:00'),
        minutesLate: 10,
      },
      {
        date: createDate('2025-01-16'),
        scheduledTime: createDate('2025-01-16T09:00:00'),
        actualTime: createDate('2025-01-16T09:10:00'),
        minutesLate: 10,
      },
    ];

    const result = calculateLatePenalty({ policy, occurrences, dailyWage: 1000 });
    expect(result.amount).toBe(40); // 2 occurrences * 2% of 1000 = 40
    expect(result.occurrences).toBe(2);
  });

  it('should calculate tiered penalty correctly', () => {
    const policy: LateArrivalPolicy = {
      enabled: true,
      gracePeriod: 0,
      mode: 'tiered',
      tiers: [
        { from: 1, to: 2, penalty: 0, warning: true },
        { from: 3, penalty: 50 },
      ],
    };

    const occurrences: LateOccurrence[] = [
      { date: createDate('2025-01-15'), scheduledTime: createDate('2025-01-15T09:00:00'), actualTime: createDate('2025-01-15T09:10:00'), minutesLate: 10 },
      { date: createDate('2025-01-16'), scheduledTime: createDate('2025-01-16T09:00:00'), actualTime: createDate('2025-01-16T09:10:00'), minutesLate: 10 },
      { date: createDate('2025-01-17'), scheduledTime: createDate('2025-01-17T09:00:00'), actualTime: createDate('2025-01-17T09:10:00'), minutesLate: 10 },
    ];

    const result = calculateLatePenalty({ policy, occurrences, currentOccurrenceCount: 0 });
    expect(result.amount).toBe(50); // 1st-2nd warnings, 3rd is $50
    expect(result.occurrences).toBe(3);
  });

  it('should apply grace period correctly', () => {
    const policy: LateArrivalPolicy = {
      enabled: true,
      gracePeriod: 10,
      mode: 'flat',
      flatAmount: 50,
    };

    const occurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:08:00'),
        minutesLate: 8, // Within grace period
      },
    ];

    const result = calculateLatePenalty({ policy, occurrences });
    expect(result.amount).toBe(0);
    expect(result.occurrences).toBe(0);
  });
});

// ============================================================================
// Overtime Bonus Calculator Tests
// ============================================================================

describe('calculateOvertimeBonus', () => {
  it('should return zero when policy is disabled', () => {
    const policy: OvertimePolicy = {
      enabled: false,
      mode: 'daily',
      dailyThreshold: 8,
      dailyMultiplier: 1.5,
    };

    const result = calculateOvertimeBonus({
      policy,
      overtimeHours: 10,
      hourlyRate: 100,
    });

    expect(result.amount).toBe(0);
    expect(result.hours).toBe(0);
  });

  it('should calculate daily overtime from occurrences', () => {
    const policy: OvertimePolicy = {
      enabled: true,
      mode: 'daily',
      dailyThreshold: 8,
      dailyMultiplier: 1.5,
    };

    const occurrences: OvertimeOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        type: 'daily',
        hours: 2,
        multiplier: 1.5,
      },
      {
        date: createDate('2025-01-16'),
        type: 'daily',
        hours: 3,
        multiplier: 1.5,
      },
    ];

    const result = calculateOvertimeBonus({
      policy,
      occurrences,
      hourlyRate: 100,
    });

    // Total: 5 hours OT * 100 * 0.5 = $250
    expect(result.amount).toBe(250);
    expect(result.hours).toBe(5);
    expect(result.breakdown).toHaveLength(2);
  });

  it('should calculate weekend premium correctly', () => {
    const policy: OvertimePolicy = {
      enabled: true,
      mode: 'weekly',
      weeklyThreshold: 40,
      weeklyMultiplier: 1.5,
      weekendPremium: {
        saturday: 1.5,
        sunday: 2.0,
      },
    };

    const occurrences: OvertimeOccurrence[] = [
      {
        date: createDate('2025-01-18'), // Saturday
        type: 'weekend-saturday',
        hours: 8,
        multiplier: 1.5,
      },
      {
        date: createDate('2025-01-19'), // Sunday
        type: 'weekend-sunday',
        hours: 8,
        multiplier: 2.0,
      },
    ];

    const result = calculateOvertimeBonus({
      policy,
      occurrences,
      hourlyRate: 100,
    });

    // Saturday: 8 * 100 * 0.5 = $400
    // Sunday: 8 * 100 * 1.0 = $800
    // Total: $1200
    expect(result.amount).toBe(1200);
  });

  it('should calculate night shift differential correctly', () => {
    const policy: OvertimePolicy = {
      enabled: true,
      mode: 'daily',
      dailyThreshold: 8,
      dailyMultiplier: 1.5,
      nightShiftDifferential: {
        startHour: 22,
        endHour: 6,
        multiplier: 1.3,
      },
    };

    const occurrences: OvertimeOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        type: 'night-shift',
        hours: 8,
        multiplier: 1.3,
      },
    ];

    const result = calculateOvertimeBonus({
      policy,
      occurrences,
      hourlyRate: 100,
    });

    // 8 * 100 * 0.3 = $240
    expect(result.amount).toBe(240);
  });

  it('should handle simple overtime hours input', () => {
    const policy: OvertimePolicy = {
      enabled: true,
      mode: 'weekly',
      weeklyThreshold: 40,
      weeklyMultiplier: 1.5,
    };

    const result = calculateOvertimeBonus({
      policy,
      overtimeHours: 45,  // 45 hours worked (5 hours over 40 threshold)
      hourlyRate: 100,
    });

    // 5 overtime hours * 100 * 0.5 extra = $250
    expect(result.amount).toBe(250);
    expect(result.hours).toBe(5);  // 5 hours overtime (45 - 40)
  });
});

// ============================================================================
// Main Shift Compliance Calculator Tests
// ============================================================================

describe('calculateShiftCompliance', () => {
  it('should calculate complete shift compliance', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      earlyDeparture: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 75,
      },
      overtime: {
        enabled: true,
        mode: 'daily',
        dailyThreshold: 8,
        dailyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const result = calculateShiftCompliance({
      attendance: {
        lateArrivals: 2,
        earlyDepartures: 1,
        overtimeHours: 13,  // 13 hours worked (5 hours over 8 threshold)
      },
      policy,
      dailyWage: 1000,
      hourlyRate: 125,
    });

    // Late penalty: 2 * $50 = $100
    // Early penalty: 1 * $75 = $75
    // Overtime: (13 - 8) hours * 125 * 0.5 = 5 * 125 * 0.5 = $312.50 (2-decimal precision)
    // Total penalties: $175
    // Total bonuses: $312.50
    // Net adjustment: $312.50 - $175 = $137.50
    expect(result.latePenalty.amount).toBe(100);
    expect(result.earlyDeparturePenalty.amount).toBe(75);
    expect(result.totalPenalties).toBe(175);
    expect(result.overtimeBonus.amount).toBe(312.5);
    expect(result.totalBonuses).toBe(312.5);
    expect(result.netAdjustment).toBe(137.5);
    expect(result.policyName).toBe('Test Policy');
  });

  it('should handle zero overtime when hours below threshold', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      earlyDeparture: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 75,
      },
      overtime: {
        enabled: true,
        mode: 'daily',
        dailyThreshold: 8,
        dailyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const result = calculateShiftCompliance({
      attendance: {
        lateArrivals: 0,
        earlyDepartures: 0,
        overtimeHours: 5,  // Below 8-hour threshold
      },
      policy,
      dailyWage: 1000,
      hourlyRate: 125,
    });

    // No penalties, no overtime (5 < 8)
    expect(result.latePenalty.amount).toBe(0);
    expect(result.earlyDeparturePenalty.amount).toBe(0);
    expect(result.totalPenalties).toBe(0);
    expect(result.overtimeBonus.amount).toBe(0);  // No overtime!
    expect(result.totalBonuses).toBe(0);
    expect(result.netAdjustment).toBe(0);
    expect(result.complianceScore).toBe(100);  // Perfect compliance
  });

  it('should calculate compliance score correctly', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      earlyDeparture: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      overtime: {
        enabled: false,
        mode: 'daily',
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    // 3 late + 1 early = 4 total occurrences
    // Score = 100 - (4 * 10) = 60
    const result = calculateShiftCompliance({
      attendance: {
        lateArrivals: 3,
        earlyDepartures: 1,
      },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(result.complianceScore).toBe(60);
    expect(result.occurrenceCount).toBe(4);
    expect(result.isAtRisk).toBe(false); // Not >= 7 occurrences
  });

  it('should identify at-risk employees', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      earlyDeparture: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      overtime: {
        enabled: false,
        mode: 'daily',
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const result = calculateShiftCompliance({
      attendance: {
        lateArrivals: 5,
        earlyDepartures: 3,
      },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(result.occurrenceCount).toBe(8);
    expect(result.isAtRisk).toBe(true); // >= 7 occurrences
    expect(result.complianceScore).toBe(20); // 100 - (8 * 10)
  });

  it('should handle zero occurrences', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      earlyDeparture: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 50,
      },
      overtime: {
        enabled: true,
        mode: 'daily',
        dailyThreshold: 8,
        dailyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const result = calculateShiftCompliance({
      attendance: {},
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(result.totalPenalties).toBe(0);
    expect(result.totalBonuses).toBe(0);
    expect(result.netAdjustment).toBe(0);
    expect(result.complianceScore).toBe(100);
    expect(result.isAtRisk).toBe(false);
  });

  it('should handle detailed occurrences', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: {
        enabled: true,
        gracePeriod: 5,
        mode: 'flat',
        flatAmount: 50,
      },
      earlyDeparture: {
        enabled: true,
        gracePeriod: 0,
        mode: 'flat',
        flatAmount: 75,
      },
      overtime: {
        enabled: true,
        mode: 'daily',
        dailyThreshold: 8,
        dailyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const lateOccurrences: LateOccurrence[] = [
      {
        date: createDate('2025-01-15'),
        scheduledTime: createDate('2025-01-15T09:00:00'),
        actualTime: createDate('2025-01-15T09:10:00'),
        minutesLate: 10, // Beyond grace period
      },
      {
        date: createDate('2025-01-16'),
        scheduledTime: createDate('2025-01-16T09:00:00'),
        actualTime: createDate('2025-01-16T09:03:00'),
        minutesLate: 3, // Within grace period
      },
    ];

    const result = calculateShiftCompliance({
      attendance: {
        lateOccurrences,
      },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(result.latePenalty.amount).toBe(50); // Only 1 penalizable
    expect(result.latePenalty.occurrences).toBe(1);
  });

  it('should handle all penalty modes correctly', () => {
    // Test flat mode
    const flatPolicy: AttendancePolicy = {
      name: 'Flat Policy',
      lateArrival: { enabled: true, gracePeriod: 0, mode: 'flat', flatAmount: 100 },
      earlyDeparture: { enabled: true, gracePeriod: 0, mode: 'flat', flatAmount: 100 },
      overtime: { enabled: false, mode: 'daily' },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const flatResult = calculateShiftCompliance({
      attendance: { lateArrivals: 3, earlyDepartures: 2 },
      policy: flatPolicy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(flatResult.latePenalty.amount).toBe(300); // 3 * 100
    expect(flatResult.earlyDeparturePenalty.amount).toBe(200); // 2 * 100
    expect(flatResult.totalPenalties).toBe(500);

    // Test per-minute mode
    const perMinutePolicy: AttendancePolicy = {
      name: 'Per-Minute Policy',
      lateArrival: { enabled: true, gracePeriod: 0, mode: 'per-minute', perMinuteRate: 5 },
      earlyDeparture: { enabled: true, gracePeriod: 0, mode: 'per-minute', perMinuteRate: 5 },
      overtime: { enabled: false, mode: 'daily' },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const perMinuteResult = calculateShiftCompliance({
      attendance: {
        lateArrivals: 3,
        totalLateMinutes: 45,
        earlyDepartures: 2,
        totalEarlyMinutes: 30,
      },
      policy: perMinutePolicy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(perMinuteResult.latePenalty.amount).toBe(225); // 45 * 5
    expect(perMinuteResult.earlyDeparturePenalty.amount).toBe(150); // 30 * 5
    expect(perMinuteResult.totalPenalties).toBe(375);

    // Test percentage mode
    const percentagePolicy: AttendancePolicy = {
      name: 'Percentage Policy',
      lateArrival: { enabled: true, gracePeriod: 0, mode: 'percentage', percentageRate: 2 },
      earlyDeparture: { enabled: true, gracePeriod: 0, mode: 'percentage', percentageRate: 3 },
      overtime: { enabled: false, mode: 'daily' },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const percentageResult = calculateShiftCompliance({
      attendance: { lateArrivals: 3, earlyDepartures: 2 },
      policy: percentagePolicy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(percentageResult.latePenalty.amount).toBe(60); // 3 * (1000 * 0.02)
    expect(percentageResult.earlyDeparturePenalty.amount).toBe(60); // 2 * (1000 * 0.03)
  });

  it('should handle all overtime modes correctly', () => {
    // Test daily mode
    const dailyPolicy: AttendancePolicy = {
      name: 'Daily OT',
      lateArrival: { enabled: false, gracePeriod: 0, mode: 'flat' },
      earlyDeparture: { enabled: false, gracePeriod: 0, mode: 'flat' },
      overtime: {
        enabled: true,
        mode: 'daily',
        dailyThreshold: 8,
        dailyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const dailyResult = calculateShiftCompliance({
      attendance: { overtimeHours: 10 }, // 10 hours worked, 2 overtime
      policy: dailyPolicy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(dailyResult.overtimeBonus.amount).toBe(100); // 2 * 100 * 0.5

    // Test weekly mode
    const weeklyPolicy: AttendancePolicy = {
      name: 'Weekly OT',
      lateArrival: { enabled: false, gracePeriod: 0, mode: 'flat' },
      earlyDeparture: { enabled: false, gracePeriod: 0, mode: 'flat' },
      overtime: {
        enabled: true,
        mode: 'weekly',
        weeklyThreshold: 40,
        weeklyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const weeklyResult = calculateShiftCompliance({
      attendance: { overtimeHours: 50 }, // 50 hours worked, 10 overtime
      policy: weeklyPolicy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(weeklyResult.overtimeBonus.amount).toBe(500); // 10 * 100 * 0.5

    // Test monthly mode
    const monthlyPolicy: AttendancePolicy = {
      name: 'Monthly OT',
      lateArrival: { enabled: false, gracePeriod: 0, mode: 'flat' },
      earlyDeparture: { enabled: false, gracePeriod: 0, mode: 'flat' },
      overtime: {
        enabled: true,
        mode: 'monthly',
        monthlyThreshold: 160,
        monthlyMultiplier: 2.0,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const monthlyResult = calculateShiftCompliance({
      attendance: { overtimeHours: 170 }, // 170 hours worked, 10 overtime
      policy: monthlyPolicy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(monthlyResult.overtimeBonus.amount).toBe(1000); // 10 * 100 * 1.0 (2.0 - 1.0)
  });

  it('should handle disabled policies correctly', () => {
    const policy: AttendancePolicy = {
      name: 'Disabled Policy',
      lateArrival: { enabled: false, gracePeriod: 0, mode: 'flat', flatAmount: 100 },
      earlyDeparture: { enabled: false, gracePeriod: 0, mode: 'flat', flatAmount: 100 },
      overtime: { enabled: false, mode: 'daily', dailyThreshold: 8, dailyMultiplier: 1.5 },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    const result = calculateShiftCompliance({
      attendance: {
        lateArrivals: 10,
        earlyDepartures: 10,
        overtimeHours: 20,
      },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    // Everything disabled, no penalties or bonuses
    expect(result.latePenalty.amount).toBe(0);
    expect(result.earlyDeparturePenalty.amount).toBe(0);
    expect(result.overtimeBonus.amount).toBe(0);
    expect(result.totalPenalties).toBe(0);
    expect(result.totalBonuses).toBe(0);
    expect(result.netAdjustment).toBe(0);
  });

  it('should calculate risk status correctly', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: { enabled: true, gracePeriod: 0, mode: 'flat', flatAmount: 50 },
      earlyDeparture: { enabled: true, gracePeriod: 0, mode: 'flat', flatAmount: 50 },
      overtime: { enabled: false, mode: 'daily' },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    // Low occurrences - not at risk
    const lowResult = calculateShiftCompliance({
      attendance: { lateArrivals: 3, earlyDepartures: 2 },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(lowResult.occurrenceCount).toBe(5);
    expect(lowResult.isAtRisk).toBe(false);
    expect(lowResult.complianceScore).toBe(50); // 100 - (5 * 10)

    // High occurrences - at risk (>= 7)
    const highResult = calculateShiftCompliance({
      attendance: { lateArrivals: 5, earlyDepartures: 3 },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(highResult.occurrenceCount).toBe(8);
    expect(highResult.isAtRisk).toBe(true);
    expect(highResult.complianceScore).toBe(20); // 100 - (8 * 10)
  });

  it('should handle exact threshold values correctly', () => {
    const policy: AttendancePolicy = {
      name: 'Test Policy',
      lateArrival: { enabled: false, gracePeriod: 0, mode: 'flat' },
      earlyDeparture: { enabled: false, gracePeriod: 0, mode: 'flat' },
      overtime: {
        enabled: true,
        mode: 'daily',
        dailyThreshold: 8,
        dailyMultiplier: 1.5,
      },
      effectiveFrom: createDate('2025-01-01'),
      active: true,
    };

    // Exactly at threshold - no overtime
    const exactResult = calculateShiftCompliance({
      attendance: { overtimeHours: 8 },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(exactResult.overtimeBonus.amount).toBe(0);
    expect(exactResult.overtimeBonus.hours).toBe(0);

    // One hour over threshold - 1 hour overtime
    const overResult = calculateShiftCompliance({
      attendance: { overtimeHours: 9 },
      policy,
      dailyWage: 1000,
      hourlyRate: 100,
    });

    expect(overResult.overtimeBonus.amount).toBe(50); // 1 * 100 * 0.5
    expect(overResult.overtimeBonus.hours).toBe(1);
  });
});

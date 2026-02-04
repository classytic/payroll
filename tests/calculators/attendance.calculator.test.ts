/**
 * Attendance Deduction Calculator Tests
 *
 * Pure function tests - no database required!
 *
 * Note: All monetary values use 2-decimal precision (cents)
 * per enterprise HRM standards.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAttendanceDeduction,
  calculateDailyRate,
  calculateHourlyRate,
  calculatePartialDayDeduction,
  calculateTotalAttendanceDeduction,
} from '../../src/calculators/attendance.calculator.js';

describe('Attendance Deduction Calculator', () => {
  describe('calculateAttendanceDeduction()', () => {
    it('should calculate deduction for absent days', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 20, // 2 days absent
        dailyRate: 4545.45, // 100000 / 22 with 2 decimal precision
      });

      expect(result.absentDays).toBe(2);
      expect(result.deductionAmount).toBe(9090.9); // 2 * 4545.45
      expect(result.hasDeduction).toBe(true);
    });

    it('should return zero deduction for perfect attendance', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 22, // Perfect attendance
        dailyRate: 4545.45,
      });

      expect(result.absentDays).toBe(0);
      expect(result.deductionAmount).toBe(0);
      expect(result.hasDeduction).toBe(false);
    });

    it('should handle zero working days', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 0,
        actualWorkingDays: 0,
        dailyRate: 4545.45,
      });

      expect(result.absentDays).toBe(0);
      expect(result.deductionAmount).toBe(0);
      expect(result.hasDeduction).toBe(false);
    });

    it('should guard against negative values', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 25, // More than expected (shouldn't happen)
        dailyRate: 4545.45,
      });

      expect(result.absentDays).toBe(0); // Guarded to 0
      expect(result.deductionAmount).toBe(0);
    });

    it('should round deduction amount to 2 decimals', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 20,
        dailyRate: 4545.455, // Has extra precision
      });

      // 2 * 4545.455 = 9090.91 (banker's rounded to 2 decimals)
      expect(result.deductionAmount).toBe(9090.91);
    });
  });

  describe('calculateDailyRate()', () => {
    it('should calculate daily rate with 2 decimal precision', () => {
      expect(calculateDailyRate(100000, 22)).toBe(4545.45);
      expect(calculateDailyRate(150000, 22)).toBe(6818.18);
      expect(calculateDailyRate(50000, 22)).toBe(2272.73);
    });

    it('should handle zero working days', () => {
      expect(calculateDailyRate(100000, 0)).toBe(0);
    });

    it('should round to 2 decimals using banker\'s rounding', () => {
      expect(calculateDailyRate(100000, 30)).toBe(3333.33);
      expect(calculateDailyRate(100000, 3)).toBe(33333.33);
    });
  });

  describe('calculateHourlyRate()', () => {
    it('should calculate hourly rate with 2 decimal precision (8 hour day)', () => {
      // 4545.45 / 8 = 568.18125 → 568.18
      expect(calculateHourlyRate(100000, 22, 8)).toBe(568.18);
      // 6818.18 / 8 = 852.2725 → 852.27
      expect(calculateHourlyRate(150000, 22, 8)).toBe(852.27);
    });

    it('should handle different hours per day', () => {
      // 4545.45 / 6 = 757.575 → 757.58 (banker's rounds .575 up since 7 is odd)
      expect(calculateHourlyRate(100000, 22, 6)).toBe(757.58);
      // 4545.45 / 10 = 454.545 → 454.54 (banker's rounds .545 down since 4 is even)
      expect(calculateHourlyRate(100000, 22, 10)).toBe(454.54);
    });

    it('should use default 8 hours if not specified', () => {
      expect(calculateHourlyRate(100000, 22)).toBe(568.18);
    });

    it('should handle zero hours per day', () => {
      expect(calculateHourlyRate(100000, 22, 0)).toBe(0);
    });
  });

  describe('calculatePartialDayDeduction()', () => {
    it('should calculate half-day deduction with 2 decimal precision', () => {
      // 4545.45 * 0.5 = 2272.725 → 2272.72 (banker's rounds to even)
      expect(calculatePartialDayDeduction(4545.45, 0.5)).toBe(2272.72);
    });

    it('should calculate quarter-day deduction with 2 decimal precision', () => {
      // 4545.45 * 0.25 = 1136.3625 → 1136.36
      expect(calculatePartialDayDeduction(4545.45, 0.25)).toBe(1136.36);
    });

    it('should handle full day (fraction = 1)', () => {
      expect(calculatePartialDayDeduction(4545.45, 1)).toBe(4545.45);
    });

    it('should handle zero absence (fraction = 0)', () => {
      expect(calculatePartialDayDeduction(4545.45, 0)).toBe(0);
    });

    it('should guard against fraction > 1', () => {
      expect(calculatePartialDayDeduction(4545.45, 1.5)).toBe(4545.45); // Capped at 1
    });

    it('should guard against negative fraction', () => {
      expect(calculatePartialDayDeduction(4545.45, -0.5)).toBe(0); // Guarded to 0
    });
  });

  describe('calculateTotalAttendanceDeduction()', () => {
    it('should calculate total with full and partial day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545.45,
        fullDayAbsences: 2,
        partialDayAbsences: [0.5, 0.25],
      });

      // 2 * 4545.45 = 9090.9
      expect(result.fullDayDeduction).toBe(9090.9);
      // partialDayDeduction: 2272.72 (half-day) + 1136.36 (quarter-day) = 3409.08
      expect(result.partialDayDeduction).toBe(3409.08);
      expect(result.totalDeduction).toBe(12499.98); // 9090.9 + 3409.08
    });

    it('should handle only full day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545.45,
        fullDayAbsences: 3,
      });

      // 3 * 4545.45 = 13636.35
      expect(result.fullDayDeduction).toBe(13636.35);
      expect(result.partialDayDeduction).toBe(0);
      expect(result.totalDeduction).toBe(13636.35);
    });

    it('should handle only partial day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545.45,
        partialDayAbsences: [0.5, 0.5, 0.25],
      });

      expect(result.fullDayDeduction).toBe(0);
      expect(result.partialDayDeduction).toBeGreaterThan(0);
      expect(result.totalDeduction).toBe(result.partialDayDeduction);
    });

    it('should handle no absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545.45,
      });

      expect(result.fullDayDeduction).toBe(0);
      expect(result.partialDayDeduction).toBe(0);
      expect(result.totalDeduction).toBe(0);
    });

    it('should guard against negative full day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545.45,
        fullDayAbsences: -2,
      });

      expect(result.fullDayDeduction).toBe(0);
      expect(result.totalDeduction).toBe(0);
    });
  });
});

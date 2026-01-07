/**
 * Attendance Deduction Calculator Tests
 * 
 * Pure function tests - no database required!
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
        dailyRate: 4545, // 100000 / 22
      });

      expect(result.absentDays).toBe(2);
      expect(result.deductionAmount).toBe(9090); // 2 * 4545
      expect(result.hasDeduction).toBe(true);
    });

    it('should return zero deduction for perfect attendance', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 22, // Perfect attendance
        dailyRate: 4545,
      });

      expect(result.absentDays).toBe(0);
      expect(result.deductionAmount).toBe(0);
      expect(result.hasDeduction).toBe(false);
    });

    it('should handle zero working days', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 0,
        actualWorkingDays: 0,
        dailyRate: 4545,
      });

      expect(result.absentDays).toBe(0);
      expect(result.deductionAmount).toBe(0);
      expect(result.hasDeduction).toBe(false);
    });

    it('should guard against negative values', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 25, // More than expected (shouldn't happen)
        dailyRate: 4545,
      });

      expect(result.absentDays).toBe(0); // Guarded to 0
      expect(result.deductionAmount).toBe(0);
    });

    it('should round deduction amount', () => {
      const result = calculateAttendanceDeduction({
        expectedWorkingDays: 22,
        actualWorkingDays: 20,
        dailyRate: 4545.45, // Has decimals
      });

      expect(result.deductionAmount).toBe(9091); // Rounded
    });
  });

  describe('calculateDailyRate()', () => {
    it('should calculate daily rate correctly', () => {
      expect(calculateDailyRate(100000, 22)).toBe(4545);
      expect(calculateDailyRate(150000, 22)).toBe(6818);
      expect(calculateDailyRate(50000, 22)).toBe(2273);
    });

    it('should handle zero working days', () => {
      expect(calculateDailyRate(100000, 0)).toBe(0);
    });

    it('should round to nearest integer', () => {
      expect(calculateDailyRate(100000, 30)).toBe(3333); // Rounded down
      expect(calculateDailyRate(100000, 3)).toBe(33333); // Rounded down
    });
  });

  describe('calculateHourlyRate()', () => {
    it('should calculate hourly rate correctly (8 hour day)', () => {
      expect(calculateHourlyRate(100000, 22, 8)).toBe(568);
      expect(calculateHourlyRate(150000, 22, 8)).toBe(852);
    });

    it('should handle different hours per day', () => {
      expect(calculateHourlyRate(100000, 22, 6)).toBe(758); // 6 hour day
      expect(calculateHourlyRate(100000, 22, 10)).toBe(455); // 10 hour day
    });

    it('should use default 8 hours if not specified', () => {
      expect(calculateHourlyRate(100000, 22)).toBe(568);
    });

    it('should handle zero hours per day', () => {
      expect(calculateHourlyRate(100000, 22, 0)).toBe(0);
    });
  });

  describe('calculatePartialDayDeduction()', () => {
    it('should calculate half-day deduction', () => {
      expect(calculatePartialDayDeduction(4545, 0.5)).toBe(2273);
    });

    it('should calculate quarter-day deduction', () => {
      expect(calculatePartialDayDeduction(4545, 0.25)).toBe(1136);
    });

    it('should handle full day (fraction = 1)', () => {
      expect(calculatePartialDayDeduction(4545, 1)).toBe(4545);
    });

    it('should handle zero absence (fraction = 0)', () => {
      expect(calculatePartialDayDeduction(4545, 0)).toBe(0);
    });

    it('should guard against fraction > 1', () => {
      expect(calculatePartialDayDeduction(4545, 1.5)).toBe(4545); // Capped at 1
    });

    it('should guard against negative fraction', () => {
      expect(calculatePartialDayDeduction(4545, -0.5)).toBe(0); // Guarded to 0
    });
  });

  describe('calculateTotalAttendanceDeduction()', () => {
    it('should calculate total with full and partial day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545,
        fullDayAbsences: 2,
        partialDayAbsences: [0.5, 0.25],
      });

      expect(result.fullDayDeduction).toBe(9090); // 2 * 4545
      expect(result.partialDayDeduction).toBe(3409); // 2273 + 1136
      expect(result.totalDeduction).toBe(12499); // 9090 + 3409
    });

    it('should handle only full day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545,
        fullDayAbsences: 3,
      });

      expect(result.fullDayDeduction).toBe(13635);
      expect(result.partialDayDeduction).toBe(0);
      expect(result.totalDeduction).toBe(13635);
    });

    it('should handle only partial day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545,
        partialDayAbsences: [0.5, 0.5, 0.25],
      });

      expect(result.fullDayDeduction).toBe(0);
      expect(result.partialDayDeduction).toBeGreaterThan(0);
      expect(result.totalDeduction).toBe(result.partialDayDeduction);
    });

    it('should handle no absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545,
      });

      expect(result.fullDayDeduction).toBe(0);
      expect(result.partialDayDeduction).toBe(0);
      expect(result.totalDeduction).toBe(0);
    });

    it('should guard against negative full day absences', () => {
      const result = calculateTotalAttendanceDeduction({
        dailyRate: 4545,
        fullDayAbsences: -2,
      });

      expect(result.fullDayDeduction).toBe(0);
      expect(result.totalDeduction).toBe(0);
    });
  });
});


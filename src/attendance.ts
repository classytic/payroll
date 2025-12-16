/**
 * @classytic/payroll - Attendance Integration
 *
 * Native integration with @classytic/clockin.
 * ClockIn is a peer dependency - attendance is core to payroll.
 */

import type { Model } from 'mongoose';
import type { AttendanceInput } from './core/config.js';

/**
 * ClockIn attendance shape (from @classytic/clockin)
 * 
 * ClockIn stores one document per employee per month with:
 * - totalWorkDays: Total days worked
 * - fullDaysCount: Full work days
 * - halfDaysCount: Half days (counted as 0.5)
 * - paidLeaveDaysCount: Paid leave
 */
interface ClockInAttendance {
  tenantId: any;
  targetId: any;
  targetModel: string;
  year: number;
  month: number;
  monthlyTotal: number;
  uniqueDaysVisited: number;
  fullDaysCount: number;
  halfDaysCount: number;
  paidLeaveDaysCount: number;
  overtimeDaysCount: number;
  totalWorkDays: number;
}

/**
 * Get attendance for payroll calculation
 *
 * @example
 * ```typescript
 * import { getAttendance } from '@classytic/payroll';
 *
 * const attendance = await getAttendance(Attendance, {
 *   organizationId: org._id,
 *   employeeId: emp._id,
 *   month: 3,
 *   year: 2024,
 *   expectedDays: 22,
 * });
 *
 * await payroll.processSalary({ employeeId, month: 3, year: 2024, attendance });
 * ```
 */
export async function getAttendance(
  AttendanceModel: Model<any>,
  params: {
    organizationId: any;
    employeeId: any;
    month: number;
    year: number;
    expectedDays: number;
  }
): Promise<(AttendanceInput & { absentDays: number; overtimeDays: number }) | null> {
  const record = await AttendanceModel.findOne({
    tenantId: params.organizationId,
    targetId: params.employeeId,
    targetModel: 'Employee',
    year: params.year,
    month: params.month,
  }).lean<ClockInAttendance>();

  if (!record) return null;

  // Calculate actual days worked
  const fullDays = record.fullDaysCount || 0;
  const halfDays = (record.halfDaysCount || 0) * 0.5;
  const paidLeave = record.paidLeaveDaysCount || 0;
  const actualDays = Math.round(fullDays + halfDays + paidLeave);
  const absentDays = Math.max(0, params.expectedDays - actualDays);
  const overtimeDays = record.overtimeDaysCount || 0;

  return {
    expectedDays: params.expectedDays,
    actualDays,
    absentDays,
    overtimeDays,
  };
}

/**
 * Get attendance for multiple employees (efficient batch operation)
 *
 * @example
 * ```typescript
 * const attendanceMap = await batchGetAttendance(Attendance, {
 *   organizationId: org._id,
 *   employeeIds: [emp1._id, emp2._id, emp3._id],
 *   month: 3,
 *   year: 2024,
 *   expectedDays: 22,
 * });
 *
 * const emp1Attendance = attendanceMap.get(emp1._id.toString());
 * ```
 */
export async function batchGetAttendance(
  AttendanceModel: Model<any>,
  params: {
    organizationId: any;
    employeeIds: any[];
    month: number;
    year: number;
    expectedDays: number;
  }
): Promise<Map<string, AttendanceInput>> {
  const records = await AttendanceModel.find({
    tenantId: params.organizationId,
    targetId: { $in: params.employeeIds },
    targetModel: 'Employee',
    year: params.year,
    month: params.month,
  }).lean<ClockInAttendance[]>();

  const map = new Map<string, AttendanceInput>();

  for (const record of records) {
    const fullDays = record.fullDaysCount || 0;
    const halfDays = (record.halfDaysCount || 0) * 0.5;
    const paidLeave = record.paidLeaveDaysCount || 0;
    const actualDays = Math.round(fullDays + halfDays + paidLeave);

    map.set(record.targetId.toString(), {
      expectedDays: params.expectedDays,
      actualDays,
    });
  }

  return map;
}


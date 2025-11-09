import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { HRM_CONFIG } from '../config.js';
import { HRM_TRANSACTION_CATEGORIES } from '../enums.js';
import { PayrollFactory } from '../factories/payroll.factory.js';
import { payroll as payrollQuery } from '../utils/query-builders.js';
import {
  calculateGross,
  calculateNet,
  sumAllowances,
  sumDeductions,
} from '../utils/calculation.utils.js';
import {
  getPayPeriod,
  diffInDays,
  addMonths,
} from '../utils/date.utils.js';

export async function processSalary({
  EmployeeModel,
  PayrollRecordModel,
  TransactionModel,
  AttendanceModel = null,
  employeeId,
  month,
  year,
  paymentDate = new Date(),
  paymentMethod = 'bank',
  context = {},
  session = null
}) {
  const employee = await EmployeeModel.findById(employeeId)
    .populate('userId', 'name email')
    .session(session);

  if (!employee) {
    throw new Error('Employee not found');
  }

  if (!employee.canReceiveSalary()) {
    throw new Error('Employee is not eligible to receive salary');
  }

  const existingQuery = payrollQuery()
    .forEmployee(employeeId)
    .forPeriod(month, year)
    .whereIn('status', ['paid', 'processing'])
    .build();

  const existing = await PayrollRecordModel.findOne(existingQuery).session(session);

  if (existing) {
    throw new Error(`Salary already processed for ${month}/${year}`);
  }

  const period = calculatePayPeriod(month, year, paymentDate);

  const breakdown = await calculateSalaryBreakdown({
    employee,
    period,
    AttendanceModel,
    session
  });

  const payrollRecord = await PayrollRecordModel.create([{
    organizationId: employee.organizationId,
    employeeId: employee._id,
    userId: employee.userId._id,
    period,
    breakdown,
    status: 'processing',
    paymentMethod,
    processedBy: context.userId,
  }], { session });

  const transaction = await TransactionModel.create([{
    organizationId: employee.organizationId,
    type: 'expense',
    category: HRM_TRANSACTION_CATEGORIES.SALARY,
    amount: breakdown.netSalary,
    method: paymentMethod,
    status: 'completed',
    date: paymentDate,
    referenceId: employee._id,
    referenceModel: 'Employee',
    handledBy: context.userId,
    notes: `Salary payment - ${employee.userId.name} (${period.month}/${period.year})`,
    metadata: {
      employeeId: employee.employeeId,
      payrollRecordId: payrollRecord[0]._id,
      period: { month, year },
      breakdown: {
        base: breakdown.baseAmount,
        allowances: sumAllowances(breakdown.allowances),
        deductions: sumDeductions(breakdown.deductions),
        gross: breakdown.grossSalary,
        net: breakdown.netSalary,
      }
    }
  }], { session });

  payrollRecord[0].markAsPaid(transaction[0]._id, paymentDate);
  await payrollRecord[0].save({ session });

  await updatePayrollStats(employee, breakdown.netSalary, paymentDate, session);

  logger.info('Salary processed', {
    employeeId: employee.employeeId,
    organizationId: employee.organizationId,
    month,
    year,
    amount: breakdown.netSalary,
    transactionId: transaction[0]._id,
  });

  return {
    payrollRecord: payrollRecord[0],
    transaction: transaction[0],
    employee
  };
}

export async function processBulkPayroll({
  EmployeeModel,
  PayrollRecordModel,
  TransactionModel,
  AttendanceModel = null,
  organizationId,
  month,
  year,
  employeeIds = [],
  paymentDate = new Date(),
  paymentMethod = 'bank',
  context = {},
  session: providedSession = null
}) {
  const useSession = providedSession || await mongoose.startSession();
  const shouldCommit = !providedSession;

  try {
    if (shouldCommit) await useSession.startTransaction();

    const query = {
      organizationId,
      status: 'active',
    };

    if (employeeIds.length > 0) {
      query._id = { $in: employeeIds };
    }

    const employees = await EmployeeModel.find(query).session(useSession);

    const results = {
      successful: [],
      failed: [],
      total: employees.length,
    };

    for (const employee of employees) {
      try {
        const result = await processSalary({
          EmployeeModel,
          PayrollRecordModel,
          TransactionModel,
          AttendanceModel,
          employeeId: employee._id,
          month,
          year,
          paymentDate,
          paymentMethod,
          context,
          session: useSession
        });

        results.successful.push({
          employeeId: employee.employeeId,
          amount: result.payrollRecord.breakdown.netSalary,
          transactionId: result.transaction._id,
        });
      } catch (error) {
        results.failed.push({
          employeeId: employee.employeeId,
          error: error.message,
        });

        logger.error('Failed to process salary', {
          employeeId: employee.employeeId,
          error: error.message,
        });
      }
    }

    if (shouldCommit) await useSession.commitTransaction();

    logger.info('Bulk payroll processed', {
      organizationId,
      month,
      year,
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
    });

    return results;
  } catch (error) {
    if (shouldCommit) await useSession.abortTransaction();
    throw error;
  } finally {
    if (shouldCommit) await useSession.endSession();
  }
}

export async function getPayrollHistory({
  PayrollRecordModel,
  employeeId = null,
  organizationId = null,
  month = null,
  year = null,
  status = null,
  pagination = {},
  session = null
}) {
  let queryBuilder = payrollQuery();

  if (employeeId) {
    queryBuilder = queryBuilder.forEmployee(employeeId);
  }

  if (organizationId) {
    queryBuilder = queryBuilder.forOrganization(organizationId);
  }

  if (month || year) {
    queryBuilder = queryBuilder.forPeriod(month, year);
  }

  if (status) {
    queryBuilder = queryBuilder.withStatus(status);
  }

  const query = queryBuilder.build();

  const options = {
    page: pagination.page || 1,
    limit: pagination.limit || 20,
    sort: pagination.sort || { 'period.year': -1, 'period.month': -1 },
    populate: [
      { path: 'employeeId', select: 'employeeId position department' },
      { path: 'userId', select: 'name email' },
      { path: 'transactionId', select: 'amount method status date' },
    ],
    ...pagination,
  };

  const result = await PayrollRecordModel.paginate(query, options);

  return result;
}

export async function getPayrollSummary({
  PayrollRecordModel,
  organizationId,
  month = null,
  year = null,
  session = null
}) {
  const query = { organizationId };

  if (month) query['period.month'] = month;
  if (year) query['period.year'] = year;

  const summary = await PayrollRecordModel.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalGross: { $sum: '$breakdown.grossSalary' },
        totalNet: { $sum: '$breakdown.netSalary' },
        totalDeductions: { $sum: { $sum: '$breakdown.deductions.amount' } },
        employeeCount: { $sum: 1 },
        paidCount: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
      }
    }
  ]).session(session);

  return summary[0] || {
    totalGross: 0,
    totalNet: 0,
    totalDeductions: 0,
    employeeCount: 0,
    paidCount: 0,
    pendingCount: 0,
  };
}

export async function exportPayrollData({
  PayrollRecordModel,
  organizationId,
  startDate,
  endDate,
  format = 'json',
  session = null
}) {
  const query = {
    organizationId,
    'period.payDate': {
      $gte: startDate,
      $lte: endDate
    }
  };

  const records = await PayrollRecordModel.find(query)
    .populate('employeeId', 'employeeId position department')
    .populate('userId', 'name email')
    .populate('transactionId', 'amount method status date')
    .sort({ 'period.year': -1, 'period.month': -1 })
    .session(session);

  await PayrollRecordModel.updateMany(
    query,
    { exported: true, exportedAt: new Date() }
  ).session(session);

  logger.info('Payroll data exported', {
    organizationId,
    count: records.length,
    startDate,
    endDate,
  });

  return records;
}

function calculatePayPeriod(month, year, paymentDate) {
  return {
    ...getPayPeriod(month, year),
    payDate: paymentDate
  };
}

async function calculateSalaryBreakdown({
  employee,
  period,
  AttendanceModel,
  session
}) {
  const comp = employee.compensation;
  let baseAmount = comp.baseAmount;

  const proRateInfo = calculateProRating(employee.hireDate, period);
  if (proRateInfo.isProRated) {
    baseAmount = Math.round(baseAmount * proRateInfo.ratio);
  }

  let attendanceDeduction = 0;
  if (AttendanceModel && HRM_CONFIG.payroll.attendanceIntegration) {
    attendanceDeduction = await calculateAttendanceDeduction({
      AttendanceModel,
      employeeId: employee._id,
      organizationId: employee.organizationId,
      period,
      dailyRate: baseAmount / proRateInfo.totalDays,
      session
    });
  }

  const allowances = (comp.allowances || []).map(a => ({
    type: a.type,
    amount: a.amount,
    taxable: a.taxable
  }));

  const deductions = (comp.deductions || [])
    .filter(d => d.auto || d.recurring)
    .map(d => ({
      type: d.type,
      amount: d.amount,
      description: d.description
    }));

  if (attendanceDeduction > 0) {
    deductions.push({
      type: 'absence',
      amount: attendanceDeduction,
      description: 'Unpaid leave deduction'
    });
  }

  const grossSalary = calculateGross(baseAmount, allowances);
  const netSalary = calculateNet(grossSalary, deductions);

  return {
    baseAmount,
    allowances,
    deductions,
    grossSalary,
    netSalary,
    workingDays: proRateInfo.totalDays,
    actualDays: proRateInfo.actualDays,
    proRatedAmount: proRateInfo.isProRated ? baseAmount : 0,
    attendanceDeduction,
  };
}

function calculateProRating(hireDate, period) {
  const periodStart = period.startDate;
  const periodEnd = period.endDate;
  const totalDays = diffInDays(periodStart, periodEnd) + 1;

  if (hireDate <= periodStart) {
    return {
      isProRated: false,
      totalDays,
      actualDays: totalDays,
      ratio: 1
    };
  }

  if (hireDate > periodStart && hireDate <= periodEnd) {
    const actualDays = diffInDays(hireDate, periodEnd) + 1;
    const ratio = actualDays / totalDays;

    return {
      isProRated: true,
      totalDays,
      actualDays,
      ratio
    };
  }

  return {
    isProRated: false,
    totalDays,
    actualDays: 0,
    ratio: 0
  };
}

async function calculateAttendanceDeduction({
  AttendanceModel,
  employeeId,
  organizationId,
  period,
  dailyRate,
  session
}) {
  try {
    const attendance = await AttendanceModel.findOne({
      tenantId: organizationId,
      targetId: employeeId,
      targetModel: 'Employee',
      year: period.year,
      month: period.month
    }).session(session);

    if (!attendance) return 0;

    const totalDays = Math.ceil((period.endDate - period.startDate) / (24 * 60 * 60 * 1000)) + 1;

    // ⭐ Smart work days calculation (accounts for full days, half days, paid leave)
    // totalWorkDays = fullDays + (halfDays * 0.5) + paidLeaveDays
    // This is automatically calculated by the attendance model based on attendance types
    const workedDays = attendance.totalWorkDays || 0;

    const absentDays = Math.max(0, totalDays - workedDays);

    return Math.round(absentDays * dailyRate);
  } catch (error) {
    logger.warn('Failed to calculate attendance deduction', {
      employeeId,
      error: error.message
    });
    return 0;
  }
}

async function updatePayrollStats(employee, amount, paymentDate, session) {
  if (!employee.payrollStats) {
    employee.payrollStats = {};
  }

  employee.payrollStats.totalPaid = (employee.payrollStats.totalPaid || 0) + amount;
  employee.payrollStats.lastPaymentDate = paymentDate;
  employee.payrollStats.paymentsThisYear = (employee.payrollStats.paymentsThisYear || 0) + 1;

  const avgMonthly = employee.payrollStats.totalPaid / employee.payrollStats.paymentsThisYear;
  employee.payrollStats.averageMonthly = Math.round(avgMonthly);

  employee.payrollStats.nextPaymentDate = addMonths(paymentDate, 1);
  employee.payrollStats.updatedAt = new Date();

  await employee.save({ session });
}

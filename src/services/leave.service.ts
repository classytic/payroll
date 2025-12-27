/**
 * @classytic/payroll - Leave Service
 *
 * Transactional leave workflow service that ensures consistency
 * between leave requests, employee balances, and payroll.
 */

import type { Model, ClientSession, Connection } from 'mongoose';
import mongoose from 'mongoose';
import type {
  ObjectIdLike,
  EmployeeDocument,
  LeaveRequestDocument,
  LeaveType,
  LeaveBalance,
  RequestLeaveInput,
  WorkingDaysOptions,
} from '../types.js';
import { toObjectId } from '../utils/query-builders.js';
import { calculateLeaveDays, hasLeaveBalance, getAvailableDays } from '../utils/leave.js';
import { logger } from '../utils/logger.js';
import { ValidationError, PayrollError } from '../errors/index.js';
import type { LeaveRequestModel } from '../models/leave-request.model.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for LeaveService
 *
 * @example
 * // Multi-tenant mode (default)
 * const service = createLeaveService({
 *   EmployeeModel,
 *   LeaveRequestModel,
 *   config: {
 *     enforceBalance: true,
 *     checkOverlap: true,
 *   }
 * });
 *
 * @example
 * // Single-tenant mode
 * const service = createLeaveService({
 *   EmployeeModel,
 *   LeaveRequestModel,
 *   config: {
 *     singleTenant: true,
 *     defaultOrganizationId: org._id,
 *   }
 * });
 */
export interface LeaveServiceConfig {
  /** Working days calculation options (holidays, weekends, etc.) */
  workingDaysOptions?: WorkingDaysOptions;
  /** Whether to enforce balance checks before approval (default: true) */
  enforceBalance?: boolean;
  /** Whether to check for overlapping leave requests (default: true) */
  checkOverlap?: boolean;
  /** Field name for leave balances array on employee document (default: 'leaveBalances') */
  leaveBalancesField?: string;
  /**
   * Single-tenant mode: organizationId becomes optional in all methods (default: false)
   * When true, organizationId parameter is optional and not required for operations
   */
  singleTenant?: boolean;
  /**
   * Default organization ID to use in single-tenant mode
   * Only used when singleTenant is true and organizationId is not provided
   */
  defaultOrganizationId?: ObjectIdLike;
}

/**
 * Parameters for requesting leave
 */
export interface RequestLeaveParams {
  /** Organization ID (required in multi-tenant, optional in single-tenant) */
  organizationId?: ObjectIdLike;
  /** Employee requesting leave */
  employeeId: ObjectIdLike;
  /** User ID of the employee */
  userId: ObjectIdLike;
  /** Leave request details (type, dates, reason, etc.) */
  request: RequestLeaveInput;
  /** Holiday dates to exclude from working days calculation */
  holidays?: Date[];
  /** Mongoose session for transaction support */
  session?: ClientSession;
}

/**
 * Parameters for reviewing (approving/rejecting) leave requests
 */
export interface ReviewLeaveParams {
  /** Leave request ID to review */
  requestId: ObjectIdLike;
  /** User ID of the reviewer (manager/admin) */
  reviewerId: ObjectIdLike;
  /** Action to take: 'approve' or 'reject' */
  action: 'approve' | 'reject';
  /** Optional notes explaining the decision */
  notes?: string;
  /** Mongoose session for transaction support */
  session?: ClientSession;
}

/**
 * Parameters for cancelling leave requests
 */
export interface CancelLeaveParams {
  /** Leave request ID to cancel */
  requestId: ObjectIdLike;
  /** Mongoose session for transaction support */
  session?: ClientSession;
}

/**
 * Parameters for querying leave data for payroll processing
 */
export interface LeaveForPayrollParams {
  /** Organization ID (required in multi-tenant, optional in single-tenant) */
  organizationId?: ObjectIdLike;
  /** Employee ID to filter by (optional - omit to get all employees) */
  employeeId?: ObjectIdLike;
  /** Start date of the payroll period */
  startDate: Date;
  /** End date of the payroll period */
  endDate: Date;
  /** Leave type to filter by (e.g., 'unpaid' for deductions) */
  type?: LeaveType;
}

/**
 * Result of a successful leave request
 */
export interface LeaveRequestResult {
  /** The created leave request document */
  request: LeaveRequestDocument;
  /** Calculated working days for this leave */
  days: number;
  /** Updated employee document with pending balance */
  employee: EmployeeDocument;
}

/**
 * Result of leave review (approval/rejection)
 */
export interface ReviewResult {
  /** The updated leave request document */
  request: LeaveRequestDocument;
  /** Updated employee document with adjusted balance */
  employee: EmployeeDocument;
  /** Whether employee balance was updated (false for unpaid leave) */
  balanceUpdated: boolean;
}

/**
 * Result of overlap check for leave requests
 */
export interface OverlapCheckResult {
  /** Whether there are overlapping requests */
  hasOverlap: boolean;
  /** List of overlapping leave requests */
  overlappingRequests: LeaveRequestDocument[];
}

// ============================================================================
// Leave Service
// ============================================================================

/**
 * LeaveService - Transactional leave workflow service
 *
 * Ensures atomic consistency between:
 * - Leave requests (LeaveRequest documents)
 * - Employee balances (pending → used → restored states)
 * - Payroll calculations (unpaid leave deductions)
 *
 * Features:
 * - Automatic working days calculation (excluding weekends/holidays)
 * - Balance validation and enforcement
 * - Overlap detection for conflicting requests
 * - Single-tenant and multi-tenant support
 * - Transaction support for atomic operations
 *
 * @example
 * // Create service instance
 * const leaveService = createLeaveService({
 *   EmployeeModel,
 *   LeaveRequestModel,
 *   config: {
 *     enforceBalance: true,
 *     checkOverlap: true,
 *   }
 * });
 *
 * @example
 * // Request leave
 * const result = await leaveService.requestLeave({
 *   organizationId: org._id,
 *   employeeId: emp._id,
 *   userId: user._id,
 *   request: {
 *     type: 'annual',
 *     startDate: new Date('2024-06-01'),
 *     endDate: new Date('2024-06-05'),
 *   }
 * });
 *
 * @example
 * // Review leave request
 * await leaveService.reviewLeave({
 *   requestId: result.request._id,
 *   reviewerId: manager._id,
 *   action: 'approve',
 *   notes: 'Approved for vacation'
 * });
 */
export class LeaveService {
  private readonly config: Required<Omit<LeaveServiceConfig, 'defaultOrganizationId'>> & {
    defaultOrganizationId?: mongoose.Types.ObjectId;
  };

  constructor(
    private readonly EmployeeModel: Model<EmployeeDocument>,
    private readonly LeaveRequestModel: LeaveRequestModel,
    config: LeaveServiceConfig = {}
  ) {
    this.config = {
      workingDaysOptions: config.workingDaysOptions || {},
      enforceBalance: config.enforceBalance ?? true,
      checkOverlap: config.checkOverlap ?? true,
      leaveBalancesField: config.leaveBalancesField || 'leaveBalances',
      singleTenant: config.singleTenant ?? false,
      defaultOrganizationId: config.defaultOrganizationId
        ? toObjectId(config.defaultOrganizationId)
        : undefined,
    };
  }

  /**
   * Resolve organization ID based on mode
   */
  private resolveOrganizationId(provided?: ObjectIdLike): mongoose.Types.ObjectId | undefined {
    if (this.config.singleTenant) {
      // In single-tenant mode, use provided or default
      return provided
        ? toObjectId(provided)
        : this.config.defaultOrganizationId;
    } else {
      // In multi-tenant mode, organizationId is required
      if (!provided) {
        throw new ValidationError('organizationId is required in multi-tenant mode');
      }
      return toObjectId(provided);
    }
  }

  // ==========================================================================
  // Request Leave (Create + Add Pending Balance)
  // ==========================================================================

  /**
   * Request leave with automatic days calculation and balance validation
   *
   * This method:
   * 1. Calculates working days from date range
   * 2. Checks for overlapping requests
   * 3. Validates sufficient balance (for non-unpaid leave)
   * 4. Creates the leave request
   * 5. Updates employee pending balance
   *
   * All operations are atomic within the provided session.
   *
   * @example
   * const result = await leaveService.requestLeave({
   *   organizationId: org._id,
   *   employeeId: employee._id,
   *   userId: user._id,
   *   request: {
   *     type: 'annual',
   *     startDate: new Date('2024-06-01'),
   *     endDate: new Date('2024-06-05'),
   *     reason: 'Vacation',
   *   },
   *   holidays: [new Date('2024-06-03')], // Will be excluded from days count
   * });
   */
  async requestLeave(params: RequestLeaveParams): Promise<LeaveRequestResult> {
    const {
      organizationId,
      employeeId,
      userId,
      request,
      holidays = [],
      session,
    } = params;

    const orgId = this.resolveOrganizationId(organizationId);
    const empId = toObjectId(employeeId);
    const uId = toObjectId(userId);

    // Calculate working days
    const days = this.calculateDays(request.startDate, request.endDate, {
      ...this.config.workingDaysOptions,
      holidays,
      halfDay: request.halfDay,
    });

    if (days <= 0) {
      throw new ValidationError('Leave request must include at least one working day');
    }

    // Find employee
    const employee = await this.findEmployee(empId, session);
    if (!employee) {
      throw new ValidationError(`Employee not found: ${employeeId}`);
    }

    // Validate organization match when both organizationId values exist
    // This prevents data inconsistency in both single-tenant and multi-tenant modes
    if (orgId) {
      const empOrgId = (employee as unknown as Record<string, unknown>).organizationId as mongoose.Types.ObjectId;
      if (empOrgId && !empOrgId.equals(orgId)) {
        throw new ValidationError(
          `Organization mismatch: employee belongs to ${empOrgId.toString()}, not ${orgId.toString()}`
        );
      }
    }

    // Check for overlapping requests
    if (this.config.checkOverlap) {
      const { hasOverlap, overlappingRequests } = await this.checkOverlap({
        employeeId: empId,
        startDate: request.startDate,
        endDate: request.endDate,
        excludeRequestId: undefined,
        session,
      });

      if (hasOverlap) {
        const dates = overlappingRequests
          .map((r) => `${r.startDate.toISOString().split('T')[0]} to ${r.endDate.toISOString().split('T')[0]}`)
          .join(', ');
        throw new ValidationError(`Leave request overlaps with existing requests: ${dates}`);
      }
    }

    // Check balance (skip for unpaid leave)
    const year = request.startDate.getFullYear();
    if (this.config.enforceBalance && request.type !== 'unpaid') {
      const balances = (employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] as LeaveBalance[] | undefined;
      const hasBalance = hasLeaveBalance({ leaveBalances: balances }, request.type, days, year);

      if (!hasBalance) {
        const available = getAvailableDays({ leaveBalances: balances }, request.type, year);
        throw new ValidationError(
          `Insufficient ${request.type} leave balance. Requested: ${days} days, Available: ${available} days`
        );
      }
    }

    // Create leave request
    const requestData: Record<string, unknown> = {
      employeeId: empId,
      userId: uId,
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      days,
      halfDay: request.halfDay || false,
      reason: request.reason,
      attachments: request.attachments,
      status: 'pending',
    };

    // Only include organizationId if provided (for single-tenant support)
    if (orgId) {
      requestData.organizationId = orgId;
    }

    const [leaveRequest] = await this.LeaveRequestModel.create([requestData], { session });

    // Update employee pending balance
    this.addPendingBalance(employee, request.type, days, year);
    await employee.save({ session });

    logger.info('Leave requested', {
      requestId: leaveRequest._id.toString(),
      employeeId: empId.toString(),
      type: request.type,
      days,
      startDate: request.startDate.toISOString(),
      endDate: request.endDate.toISOString(),
    });

    return {
      request: leaveRequest,
      days,
      employee,
    };
  }

  // ==========================================================================
  // Approve/Reject Leave (Review + Update Balance)
  // ==========================================================================

  /**
   * Review (approve or reject) a leave request
   *
   * When approved:
   * - Moves days from pending to used in employee balance
   *
   * When rejected:
   * - Removes days from pending in employee balance
   *
   * @example
   * // Approve
   * const result = await leaveService.reviewLeave({
   *   requestId: request._id,
   *   reviewerId: admin._id,
   *   action: 'approve',
   *   notes: 'Enjoy your vacation!',
   * });
   *
   * // Reject
   * const result = await leaveService.reviewLeave({
   *   requestId: request._id,
   *   reviewerId: admin._id,
   *   action: 'reject',
   *   notes: 'Peak season - please reschedule',
   * });
   */
  async reviewLeave(params: ReviewLeaveParams): Promise<ReviewResult> {
    const { requestId, reviewerId, action, notes, session } = params;

    const reqId = toObjectId(requestId);
    const revId = toObjectId(reviewerId);

    // Find leave request
    let query = this.LeaveRequestModel.findById(reqId);
    if (session) query = query.session(session);

    const leaveRequest = await query.exec();
    if (!leaveRequest) {
      throw new ValidationError(`Leave request not found: ${requestId}`);
    }

    if (leaveRequest.status !== 'pending') {
      throw new ValidationError(`Cannot ${action} a ${leaveRequest.status} request`);
    }

    // Find employee
    const employee = await this.findEmployee(leaveRequest.employeeId, session);
    if (!employee) {
      throw new ValidationError(`Employee not found: ${leaveRequest.employeeId}`);
    }

    const year = leaveRequest.startDate.getFullYear();
    const { type, days } = leaveRequest;

    if (action === 'approve') {
      // Re-validate balance before approval (in case balance changed)
      if (this.config.enforceBalance && type !== 'unpaid') {
        const balances = (employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] as LeaveBalance[] | undefined;
        // Check if available + pending >= days (since pending will be converted to used)
        const available = getAvailableDays({ leaveBalances: balances }, type, year);
        // The days are already in pending, so we just need to ensure available >= 0 after conversion
        // available = allocated + carriedOver - used - pending
        // After approval: available = allocated + carriedOver - (used + days) - (pending - days)
        // This equals the same, so if hasLeaveBalance was true at request time, it should still work
        // But we check anyway in case balance was modified externally
        const balance = balances?.find((b) => b.type === type && b.year === year);
        if (balance) {
          const wouldBeAvailable = balance.allocated + balance.carriedOver - (balance.used + days) - (balance.pending - days);
          if (wouldBeAvailable < 0) {
            throw new ValidationError(
              `Cannot approve: insufficient ${type} leave balance after pending changes`
            );
          }
        }
      }

      // Approve request
      leaveRequest.status = 'approved';
      leaveRequest.reviewedBy = revId;
      leaveRequest.reviewedAt = new Date();
      if (notes) leaveRequest.reviewNotes = notes;

      // Move pending to used
      this.useBalance(employee, type, days, year);

      logger.info('Leave request approved', {
        requestId: reqId.toString(),
        employeeId: leaveRequest.employeeId.toString(),
        type,
        days,
      });
    } else {
      // Reject request
      leaveRequest.status = 'rejected';
      leaveRequest.reviewedBy = revId;
      leaveRequest.reviewedAt = new Date();
      if (notes) leaveRequest.reviewNotes = notes;

      // Remove from pending
      this.removePendingBalance(employee, type, days, year);

      logger.info('Leave request rejected', {
        requestId: reqId.toString(),
        employeeId: leaveRequest.employeeId.toString(),
        type,
        days,
      });
    }

    await leaveRequest.save({ session });
    await employee.save({ session });

    return {
      request: leaveRequest,
      employee,
      balanceUpdated: true,
    };
  }

  // ==========================================================================
  // Cancel Leave (Cancel + Restore Balance)
  // ==========================================================================

  /**
   * Cancel a leave request
   *
   * For pending requests:
   * - Removes days from pending balance
   *
   * For approved requests (if allowed):
   * - Restores days back to available balance
   *
   * @example
   * const result = await leaveService.cancelLeave({
   *   requestId: request._id,
   * });
   */
  async cancelLeave(
    params: CancelLeaveParams & { allowCancelApproved?: boolean }
  ): Promise<ReviewResult> {
    const { requestId, session, allowCancelApproved = false } = params;

    const reqId = toObjectId(requestId);

    // Find leave request
    let query = this.LeaveRequestModel.findById(reqId);
    if (session) query = query.session(session);

    const leaveRequest = await query.exec();
    if (!leaveRequest) {
      throw new ValidationError(`Leave request not found: ${requestId}`);
    }

    const { status, type, days } = leaveRequest;
    const year = leaveRequest.startDate.getFullYear();

    if (status === 'cancelled') {
      throw new ValidationError('Request is already cancelled');
    }

    if (status === 'rejected') {
      throw new ValidationError('Cannot cancel a rejected request');
    }

    if (status === 'approved' && !allowCancelApproved) {
      throw new ValidationError(
        'Cannot cancel approved request. Use allowCancelApproved: true to override.'
      );
    }

    // Find employee
    const employee = await this.findEmployee(leaveRequest.employeeId, session);
    if (!employee) {
      throw new ValidationError(`Employee not found: ${leaveRequest.employeeId}`);
    }

    // Cancel request
    leaveRequest.status = 'cancelled';

    if (status === 'pending') {
      // Remove from pending
      this.removePendingBalance(employee, type, days, year);
    } else if (status === 'approved') {
      // Restore used balance
      this.restoreBalance(employee, type, days, year);
    }

    await leaveRequest.save({ session });
    await employee.save({ session });

    logger.info('Leave request cancelled', {
      requestId: reqId.toString(),
      employeeId: leaveRequest.employeeId.toString(),
      type,
      days,
      wasApproved: status === 'approved',
    });

    return {
      request: leaveRequest,
      employee,
      balanceUpdated: true,
    };
  }

  // ==========================================================================
  // Overlap Detection
  // ==========================================================================

  /**
   * Check for overlapping leave requests
   *
   * @example
   * const { hasOverlap, overlappingRequests } = await leaveService.checkOverlap({
   *   employeeId: employee._id,
   *   startDate: new Date('2024-06-01'),
   *   endDate: new Date('2024-06-05'),
   * });
   */
  async checkOverlap(params: {
    employeeId: ObjectIdLike;
    startDate: Date;
    endDate: Date;
    excludeRequestId?: ObjectIdLike;
    session?: ClientSession;
  }): Promise<OverlapCheckResult> {
    const { employeeId, startDate, endDate, excludeRequestId, session } = params;

    const empId = toObjectId(employeeId);

    // Find overlapping pending or approved requests
    const query: Record<string, unknown> = {
      employeeId: empId,
      status: { $in: ['pending', 'approved'] },
      $or: [
        // New request starts during existing request
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
      ],
    };

    if (excludeRequestId) {
      query._id = { $ne: toObjectId(excludeRequestId) };
    }

    let mongooseQuery = this.LeaveRequestModel.find(query);
    if (session) mongooseQuery = mongooseQuery.session(session);

    const overlappingRequests = await mongooseQuery.exec();

    return {
      hasOverlap: overlappingRequests.length > 0,
      overlappingRequests,
    };
  }

  // ==========================================================================
  // Payroll Integration
  // ==========================================================================

  /**
   * Get approved unpaid leave for payroll deduction
   *
   * @example
   * const unpaidLeave = await leaveService.getLeaveForPayroll({
   *   organizationId: org._id,
   *   employeeId: employee._id,
   *   startDate: periodStart,
   *   endDate: periodEnd,
   *   type: 'unpaid',
   * });
   *
   * const totalDays = unpaidLeave.reduce((sum, r) => sum + r.days, 0);
   */
  async getLeaveForPayroll(
    params: LeaveForPayrollParams
  ): Promise<LeaveRequestDocument[]> {
    const { organizationId, employeeId, startDate, endDate, type } = params;

    const orgId = this.resolveOrganizationId(organizationId);

    const query: Record<string, unknown> = {
      status: 'approved',
      // Overlap with period
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    };

    // Only filter by organizationId if provided (single-tenant support)
    if (orgId) {
      query.organizationId = orgId;
    }

    if (employeeId) {
      query.employeeId = toObjectId(employeeId);
    }

    if (type) {
      query.type = type;
    }

    return this.LeaveRequestModel.find(query).sort({ startDate: 1 }).exec();
  }

  /**
   * Calculate unpaid leave deduction for an employee in a period
   *
   * @example
   * const { totalDays, deduction } = await leaveService.calculateUnpaidDeduction({
   *   organizationId: org._id,
   *   employeeId: employee._id,
   *   startDate: periodStart,
   *   endDate: periodEnd,
   *   baseSalary: 100000,
   *   workingDaysInMonth: 22,
   * });
   */
  async calculateUnpaidDeduction(params: {
    organizationId?: ObjectIdLike;
    employeeId: ObjectIdLike;
    startDate: Date;
    endDate: Date;
    baseSalary: number;
    workingDaysInMonth: number;
  }): Promise<{ totalDays: number; deduction: number; requests: LeaveRequestDocument[] }> {
    // Validate workingDaysInMonth to prevent Infinity/NaN
    if (params.workingDaysInMonth <= 0) {
      throw new ValidationError(
        'workingDaysInMonth must be positive, got: ' + params.workingDaysInMonth
      );
    }

    const requests = await this.getLeaveForPayroll({
      organizationId: params.organizationId,
      employeeId: params.employeeId,
      startDate: params.startDate,
      endDate: params.endDate,
      type: 'unpaid',
    });

    const totalDays = requests.reduce((sum, r) => sum + r.days, 0);
    const dailyRate = params.baseSalary / params.workingDaysInMonth;
    const deduction = Math.round(dailyRate * totalDays);

    return {
      totalDays,
      deduction,
      requests,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Calculate working days for leave request
   */
  calculateDays(
    startDate: Date,
    endDate: Date,
    options: WorkingDaysOptions & { halfDay?: boolean } = {}
  ): number {
    const days = calculateLeaveDays(startDate, endDate, options);

    // Handle half-day
    if (options.halfDay && days > 0) {
      return days === 1 ? 0.5 : days - 0.5;
    }

    return days;
  }

  /**
   * Find employee by ID
   */
  private async findEmployee(
    employeeId: mongoose.Types.ObjectId,
    session?: ClientSession
  ): Promise<EmployeeDocument | null> {
    let query = this.EmployeeModel.findById(employeeId);
    if (session) query = query.session(session);
    return query.exec();
  }

  /**
   * Add pending balance to employee
   */
  private addPendingBalance(
    employee: EmployeeDocument,
    type: LeaveType,
    days: number,
    year: number
  ): void {
    const balances = ((employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] as LeaveBalance[]) || [];
    const balance = balances.find((b) => b.type === type && b.year === year);

    if (balance) {
      balance.pending += days;
    } else if (type !== 'unpaid') {
      // Create balance entry if doesn't exist (except for unpaid)
      balances.push({
        type,
        allocated: 0,
        used: 0,
        pending: days,
        carriedOver: 0,
        year,
      });
      (employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] = balances;
    }

    employee.markModified(this.config.leaveBalancesField);
  }

  /**
   * Remove pending balance from employee
   */
  private removePendingBalance(
    employee: EmployeeDocument,
    type: LeaveType,
    days: number,
    year: number
  ): void {
    const balances = ((employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] as LeaveBalance[]) || [];
    const balance = balances.find((b) => b.type === type && b.year === year);

    if (balance) {
      balance.pending = Math.max(0, balance.pending - days);
      employee.markModified(this.config.leaveBalancesField);
    }
  }

  /**
   * Use balance (move from pending to used)
   */
  private useBalance(
    employee: EmployeeDocument,
    type: LeaveType,
    days: number,
    year: number
  ): void {
    const balances = ((employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] as LeaveBalance[]) || [];
    const balance = balances.find((b) => b.type === type && b.year === year);

    if (balance) {
      balance.pending = Math.max(0, balance.pending - days);
      balance.used += days;
    } else if (type === 'unpaid') {
      // Track unpaid leave even without initial balance
      balances.push({
        type,
        allocated: 0,
        used: days,
        pending: 0,
        carriedOver: 0,
        year,
      });
      (employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] = balances;
    }

    employee.markModified(this.config.leaveBalancesField);
  }

  /**
   * Restore balance (when approved request is cancelled)
   */
  private restoreBalance(
    employee: EmployeeDocument,
    type: LeaveType,
    days: number,
    year: number
  ): void {
    const balances = ((employee as unknown as Record<string, unknown>)[this.config.leaveBalancesField] as LeaveBalance[]) || [];
    const balance = balances.find((b) => b.type === type && b.year === year);

    if (balance) {
      balance.used = Math.max(0, balance.used - days);
      employee.markModified(this.config.leaveBalancesField);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a LeaveService instance
 *
 * @example
 * const leaveService = createLeaveService({
 *   EmployeeModel: Employee,
 *   LeaveRequestModel: LeaveRequest,
 *   config: {
 *     enforceBalance: true,
 *     checkOverlap: true,
 *   },
 * });
 *
 * // Use in a transaction
 * const session = await mongoose.startSession();
 * session.startTransaction();
 * try {
 *   await leaveService.requestLeave({ ...params, session });
 *   await session.commitTransaction();
 * } catch (error) {
 *   await session.abortTransaction();
 *   throw error;
 * } finally {
 *   session.endSession();
 * }
 */
export function createLeaveService(options: {
  EmployeeModel: Model<EmployeeDocument>;
  LeaveRequestModel: LeaveRequestModel;
  config?: LeaveServiceConfig;
}): LeaveService {
  return new LeaveService(
    options.EmployeeModel,
    options.LeaveRequestModel,
    options.config
  );
}

export default LeaveService;

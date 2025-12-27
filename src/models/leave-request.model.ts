/**
 * @classytic/payroll - LeaveRequest Model
 *
 * Mongoose schema for leave requests with TTL support
 */

import mongoose, { Schema, Model } from 'mongoose';
import type {
  LeaveRequestDocument,
  LeaveType,
  LeaveRequestStatus,
} from '../types.js';
import {
  LEAVE_REQUEST_STATUS,
  LEAVE_TYPE_VALUES,
  LEAVE_REQUEST_STATUS_VALUES,
} from '../enums.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Schema Definition
// ============================================================================

const leaveRequestSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: false, // Optional for single-tenant mode
      ref: 'Organization',
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Employee',
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    type: {
      type: String,
      enum: LEAVE_TYPE_VALUES,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: { endDate?: Date }, value: Date) {
          return !this.endDate || value <= this.endDate;
        },
        message: 'Start date must be before or equal to end date',
      },
    },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: { startDate?: Date }, value: Date) {
          return !this.startDate || value >= this.startDate;
        },
        message: 'End date must be after or equal to start date',
      },
    },
    days: {
      type: Number,
      required: true,
      min: [0.5, 'Days must be at least 0.5'],
    },
    halfDay: { type: Boolean, default: false },
    reason: String,
    status: {
      type: String,
      enum: LEAVE_REQUEST_STATUS_VALUES,
      default: 'pending',
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNotes: String,
    attachments: [String],
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// ============================================================================
// Indexes (opt-in via applyLeaveRequestIndexes)
// ============================================================================

// Note: Indexes are NOT applied automatically
// Use applyLeaveRequestIndexes() from schemas/leave.ts if needed

// ============================================================================
// Virtuals
// ============================================================================

leaveRequestSchema.virtual('isPending').get(function () {
  return this.status === LEAVE_REQUEST_STATUS.PENDING;
});

leaveRequestSchema.virtual('isApproved').get(function () {
  return this.status === LEAVE_REQUEST_STATUS.APPROVED;
});

leaveRequestSchema.virtual('isRejected').get(function () {
  return this.status === LEAVE_REQUEST_STATUS.REJECTED;
});

leaveRequestSchema.virtual('isCancelled').get(function () {
  return this.status === LEAVE_REQUEST_STATUS.CANCELLED;
});

// ============================================================================
// Methods
// ============================================================================

leaveRequestSchema.methods.approve = function (
  reviewerId: mongoose.Types.ObjectId,
  notes?: string
) {
  if (this.status !== LEAVE_REQUEST_STATUS.PENDING) {
    throw new Error('Can only approve pending requests');
  }
  this.status = LEAVE_REQUEST_STATUS.APPROVED;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  if (notes) this.reviewNotes = notes;

  logger.info('Leave request approved', {
    requestId: this._id.toString(),
    employeeId: this.employeeId.toString(),
    type: this.type,
    days: this.days,
  });
};

leaveRequestSchema.methods.reject = function (
  reviewerId: mongoose.Types.ObjectId,
  notes?: string
) {
  if (this.status !== LEAVE_REQUEST_STATUS.PENDING) {
    throw new Error('Can only reject pending requests');
  }
  this.status = LEAVE_REQUEST_STATUS.REJECTED;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  if (notes) this.reviewNotes = notes;

  logger.info('Leave request rejected', {
    requestId: this._id.toString(),
    employeeId: this.employeeId.toString(),
    type: this.type,
    days: this.days,
  });
};

leaveRequestSchema.methods.cancel = function () {
  if (this.status !== LEAVE_REQUEST_STATUS.PENDING) {
    throw new Error('Can only cancel pending requests');
  }
  this.status = LEAVE_REQUEST_STATUS.CANCELLED;

  logger.info('Leave request cancelled', {
    requestId: this._id.toString(),
    employeeId: this.employeeId.toString(),
    type: this.type,
    days: this.days,
  });
};

// ============================================================================
// Statics
// ============================================================================

leaveRequestSchema.statics.findByEmployee = function (
  employeeId: mongoose.Types.ObjectId,
  options: { status?: LeaveRequestStatus; year?: number; limit?: number } = {}
) {
  const query: Record<string, unknown> = { employeeId };

  if (options.status) query.status = options.status;
  if (options.year) {
    query.startDate = {
      $gte: new Date(options.year, 0, 1),
      $lt: new Date(options.year + 1, 0, 1),
    };
  }

  return this.find(query)
    .sort({ startDate: -1 })
    .limit(options.limit || 50);
};

leaveRequestSchema.statics.findPendingByOrganization = function (
  organizationId?: mongoose.Types.ObjectId
) {
  const query: Record<string, unknown> = {
    status: LEAVE_REQUEST_STATUS.PENDING,
  };

  if (organizationId) {
    query.organizationId = organizationId;
  }

  return this.find(query).sort({ createdAt: -1 });
};

leaveRequestSchema.statics.findByPeriod = function (
  organizationId: mongoose.Types.ObjectId | undefined,
  startDate: Date,
  endDate: Date,
  options: { status?: LeaveRequestStatus; type?: LeaveType } = {}
) {
  const query: Record<string, unknown> = {
    $or: [
      { startDate: { $gte: startDate, $lte: endDate } },
      { endDate: { $gte: startDate, $lte: endDate } },
      {
        startDate: { $lte: startDate },
        endDate: { $gte: endDate },
      },
    ],
  };

  if (organizationId) {
    query.organizationId = organizationId;
  }

  if (options.status) query.status = options.status;
  if (options.type) query.type = options.type;

  return this.find(query).sort({ startDate: 1 });
};

leaveRequestSchema.statics.getLeaveStats = function (
  employeeId: mongoose.Types.ObjectId,
  year: number
) {
  return this.aggregate([
    {
      $match: {
        employeeId,
        status: LEAVE_REQUEST_STATUS.APPROVED,
        startDate: {
          $gte: new Date(year, 0, 1),
          $lt: new Date(year + 1, 0, 1),
        },
      },
    },
    {
      $group: {
        _id: '$type',
        totalDays: { $sum: '$days' },
        count: { $sum: 1 },
      },
    },
  ]).then((results: unknown[]) =>
    results as Array<{ _id: LeaveType; totalDays: number; count: number }>
  );
};

leaveRequestSchema.statics.getOrganizationSummary = function (
  organizationId: mongoose.Types.ObjectId | undefined,
  year: number
) {
  const matchStage: Record<string, unknown> = {
    startDate: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1),
    },
  };

  if (organizationId) {
    matchStage.organizationId = organizationId;
  }

  return this.aggregate([
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: { status: '$status', type: '$type' },
        totalDays: { $sum: '$days' },
        count: { $sum: 1 },
      },
    },
  ]);
};

leaveRequestSchema.statics.findOverlapping = function (
  employeeId: mongoose.Types.ObjectId,
  startDate: Date,
  endDate: Date,
  excludeRequestId?: mongoose.Types.ObjectId
) {
  const query: Record<string, unknown> = {
    employeeId,
    status: { $in: [LEAVE_REQUEST_STATUS.PENDING, LEAVE_REQUEST_STATUS.APPROVED] },
    // Overlapping condition: new request overlaps with existing
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }

  return this.find(query).sort({ startDate: 1 });
};

leaveRequestSchema.statics.hasOverlap = async function (
  employeeId: mongoose.Types.ObjectId,
  startDate: Date,
  endDate: Date,
  excludeRequestId?: mongoose.Types.ObjectId
): Promise<boolean> {
  const query: Record<string, unknown> = {
    employeeId,
    status: { $in: [LEAVE_REQUEST_STATUS.PENDING, LEAVE_REQUEST_STATUS.APPROVED] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeRequestId) {
    query._id = { $ne: excludeRequestId };
  }

  const count = await this.countDocuments(query);
  return count > 0;
};

// ============================================================================
// Model Interface
// ============================================================================

export interface LeaveRequestModel extends Model<LeaveRequestDocument> {
  findByEmployee(
    employeeId: mongoose.Types.ObjectId,
    options?: { status?: LeaveRequestStatus; year?: number; limit?: number }
  ): ReturnType<Model<LeaveRequestDocument>['find']>;

  findPendingByOrganization(
    organizationId?: mongoose.Types.ObjectId
  ): ReturnType<Model<LeaveRequestDocument>['find']>;

  findByPeriod(
    organizationId: mongoose.Types.ObjectId | undefined,
    startDate: Date,
    endDate: Date,
    options?: { status?: LeaveRequestStatus; type?: LeaveType }
  ): ReturnType<Model<LeaveRequestDocument>['find']>;

  getLeaveStats(
    employeeId: mongoose.Types.ObjectId,
    year: number
  ): Promise<Array<{ _id: LeaveType; totalDays: number; count: number }>>;

  getOrganizationSummary(
    organizationId: mongoose.Types.ObjectId | undefined,
    year: number
  ): Promise<
    Array<{
      _id: { status: LeaveRequestStatus; type: LeaveType };
      totalDays: number;
      count: number;
    }>
  >;

  findOverlapping(
    employeeId: mongoose.Types.ObjectId,
    startDate: Date,
    endDate: Date,
    excludeRequestId?: mongoose.Types.ObjectId
  ): ReturnType<Model<LeaveRequestDocument>['find']>;

  hasOverlap(
    employeeId: mongoose.Types.ObjectId,
    startDate: Date,
    endDate: Date,
    excludeRequestId?: mongoose.Types.ObjectId
  ): Promise<boolean>;
}

// ============================================================================
// Model Factory
// ============================================================================

/**
 * Get or create LeaveRequest model
 *
 * @example
 * const LeaveRequest = getLeaveRequestModel();
 *
 * // With custom connection
 * const LeaveRequest = getLeaveRequestModel(customConnection);
 */
export function getLeaveRequestModel(
  connection: mongoose.Connection = mongoose.connection
): LeaveRequestModel {
  const modelName = 'LeaveRequest';

  if (connection.models[modelName]) {
    return connection.models[modelName] as LeaveRequestModel;
  }

  return connection.model<LeaveRequestDocument, LeaveRequestModel>(
    modelName,
    leaveRequestSchema
  );
}

export { leaveRequestSchema };
export default leaveRequestSchema;

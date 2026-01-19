/**
 * @classytic/payroll - Timeline Audit Integration
 *
 * Integration with @classytic/mongoose-timeline-audit for comprehensive audit trails.
 * Provides automatic tracking of WHO performed WHAT action and WHEN.
 *
 * ## Setup
 *
 * 1. Install mongoose-timeline-audit:
 *    ```bash
 *    npm install @classytic/mongoose-timeline-audit
 *    ```
 *
 * 2. Apply to your schemas BEFORE registering with Mongoose:
 *    ```typescript
 *    import timelineAuditPlugin from '@classytic/mongoose-timeline-audit';
 *    import { PAYROLL_EVENTS } from '@classytic/payroll';
 *
 *    // Apply to Employee schema
 *    employeeSchema.plugin(timelineAuditPlugin, {
 *      ownerField: 'organizationId',
 *      eventLimits: PAYROLL_EVENTS.EMPLOYEE.limits,
 *    });
 *
 *    // Apply to PayrollRecord schema
 *    payrollRecordSchema.plugin(timelineAuditPlugin, {
 *      ownerField: 'organizationId',
 *      eventLimits: PAYROLL_EVENTS.PAYROLL.limits,
 *    });
 *    ```
 *
 * 3. Use the Payroll events to add timeline entries:
 *    ```typescript
 *    payroll.on('employee:hired', async ({ data }) => {
 *      const employee = await Employee.findById(data.employee.id);
 *      employee.addTimelineEvent(
 *        PAYROLL_EVENTS.EMPLOYEE.HIRED,
 *        `Hired as ${data.employee.position}`,
 *        request,  // Express request for actor tracking
 *        { department: data.employee.department }
 *      );
 *      await employee.save();
 *    });
 *    ```
 *
 * @module @classytic/payroll/timeline-audit
 */

// ============================================================================
// Payroll Event Constants
// ============================================================================

/**
 * Standard payroll events for timeline tracking
 *
 * Use these constants with mongoose-timeline-audit's addTimelineEvent()
 * to maintain consistent event naming across your application.
 */
export const PAYROLL_EVENTS = {
  /**
   * Employee lifecycle events
   */
  EMPLOYEE: {
    /** Employee was hired */
    HIRED: 'employee.hired',
    /** Employee was terminated */
    TERMINATED: 'employee.terminated',
    /** Employee was re-hired after termination */
    REHIRED: 'employee.rehired',
    /** Employee status changed (active, on_leave, suspended) */
    STATUS_CHANGED: 'employee.status_changed',
    /** Employee department/position changed */
    ROLE_CHANGED: 'employee.role_changed',
    /** Employee probation ended */
    PROBATION_ENDED: 'employee.probation_ended',

    /** Recommended event limits for employee timeline */
    limits: {
      'employee.status_changed': 50,
      'employee.role_changed': 20,
    },
  },

  /**
   * Compensation events
   */
  COMPENSATION: {
    /** Base salary was updated */
    SALARY_UPDATED: 'compensation.salary_updated',
    /** Allowance was added */
    ALLOWANCE_ADDED: 'compensation.allowance_added',
    /** Allowance was removed */
    ALLOWANCE_REMOVED: 'compensation.allowance_removed',
    /** Deduction was added */
    DEDUCTION_ADDED: 'compensation.deduction_added',
    /** Deduction was removed */
    DEDUCTION_REMOVED: 'compensation.deduction_removed',
    /** Bank details were updated */
    BANK_UPDATED: 'compensation.bank_updated',

    /** Recommended event limits */
    limits: {
      'compensation.salary_updated': 24, // 2 years of monthly updates
      'compensation.allowance_added': 20,
      'compensation.allowance_removed': 20,
      'compensation.deduction_added': 20,
      'compensation.deduction_removed': 20,
      'compensation.bank_updated': 10,
    },
  },

  /**
   * Payroll processing events
   */
  PAYROLL: {
    /** Salary was processed */
    PROCESSED: 'payroll.processed',
    /** Payroll was voided (before payment) */
    VOIDED: 'payroll.voided',
    /** Payroll was reversed (after payment) */
    REVERSED: 'payroll.reversed',
    /** Payroll was restored from voided state */
    RESTORED: 'payroll.restored',
    /** Payroll export was generated */
    EXPORTED: 'payroll.exported',

    /** Recommended event limits */
    limits: {
      'payroll.processed': 36, // 3 years of monthly payroll
      'payroll.voided': 10,
      'payroll.reversed': 10,
      'payroll.restored': 5,
      'payroll.exported': 20,
    },
  },

  /**
   * Tax withholding events
   */
  TAX: {
    /** Tax was withheld */
    WITHHELD: 'tax.withheld',
    /** Tax was submitted to authorities */
    SUBMITTED: 'tax.submitted',
    /** Tax payment was made */
    PAID: 'tax.paid',
    /** Tax withholding was cancelled */
    CANCELLED: 'tax.cancelled',

    /** Recommended event limits */
    limits: {
      'tax.withheld': 36,
      'tax.submitted': 12,
      'tax.paid': 12,
      'tax.cancelled': 10,
    },
  },

  /**
   * Leave management events
   */
  LEAVE: {
    /** Leave was requested */
    REQUESTED: 'leave.requested',
    /** Leave was approved */
    APPROVED: 'leave.approved',
    /** Leave was rejected */
    REJECTED: 'leave.rejected',
    /** Leave was cancelled */
    CANCELLED: 'leave.cancelled',
    /** Leave balance was accrued */
    ACCRUED: 'leave.accrued',
    /** Annual leave was reset */
    RESET: 'leave.reset',

    /** Recommended event limits */
    limits: {
      'leave.requested': 50,
      'leave.approved': 50,
      'leave.rejected': 20,
      'leave.cancelled': 20,
      'leave.accrued': 12,
      'leave.reset': 5,
    },
  },
} as const;

/**
 * All payroll event types (for TypeScript)
 */
export type PayrollTimelineEvent =
  | typeof PAYROLL_EVENTS.EMPLOYEE[keyof typeof PAYROLL_EVENTS.EMPLOYEE]
  | typeof PAYROLL_EVENTS.COMPENSATION[keyof typeof PAYROLL_EVENTS.COMPENSATION]
  | typeof PAYROLL_EVENTS.PAYROLL[keyof typeof PAYROLL_EVENTS.PAYROLL]
  | typeof PAYROLL_EVENTS.TAX[keyof typeof PAYROLL_EVENTS.TAX]
  | typeof PAYROLL_EVENTS.LEAVE[keyof typeof PAYROLL_EVENTS.LEAVE];

// ============================================================================
// Timeline Audit Plugin Configuration
// ============================================================================

/**
 * Recommended timeline audit configuration for Employee model
 */
export const EMPLOYEE_TIMELINE_CONFIG = {
  ownerField: 'organizationId',
  fieldName: 'timeline',
  hideByDefault: true, // Don't include timeline in normal queries
  eventLimits: {
    ...PAYROLL_EVENTS.EMPLOYEE.limits,
    ...PAYROLL_EVENTS.COMPENSATION.limits,
  },
};

/**
 * Recommended timeline audit configuration for PayrollRecord model
 */
export const PAYROLL_RECORD_TIMELINE_CONFIG = {
  ownerField: 'organizationId',
  fieldName: 'timeline',
  hideByDefault: true,
  eventLimits: PAYROLL_EVENTS.PAYROLL.limits,
};

/**
 * Recommended timeline audit configuration for LeaveRequest model
 */
export const LEAVE_REQUEST_TIMELINE_CONFIG = {
  ownerField: 'organizationId',
  fieldName: 'timeline',
  hideByDefault: true,
  eventLimits: PAYROLL_EVENTS.LEAVE.limits,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build timeline event metadata from payroll context
 *
 * @param context - Operation context from payroll methods
 * @returns Metadata object for timeline event
 *
 * @example
 * ```typescript
 * employee.addTimelineEvent(
 *   PAYROLL_EVENTS.EMPLOYEE.HIRED,
 *   'Hired as Software Engineer',
 *   request,
 *   buildTimelineMetadata(params.context)
 * );
 * ```
 */
export function buildTimelineMetadata(context?: {
  userId?: unknown;
  userName?: string;
  userRole?: string;
  organizationId?: unknown;
}): Record<string, unknown> {
  if (!context) return {};

  const result: Record<string, unknown> = {};

  if (context.userId) {
    result.performedByUserId = String(context.userId);
  }
  if (context.userName) {
    result.performedByName = context.userName;
  }
  if (context.userRole) {
    result.performedByRole = context.userRole;
  }
  if (context.organizationId) {
    result.organizationId = String(context.organizationId);
  }

  return result;
}

/**
 * Build context object for timeline event (IP, user agent, etc.)
 *
 * @param request - Express/Fastify request object
 * @returns Context object for timeline event
 *
 * @example
 * ```typescript
 * employee.addTimelineEvent(
 *   PAYROLL_EVENTS.COMPENSATION.SALARY_UPDATED,
 *   `Salary updated to ${newSalary}`,
 *   request,
 *   { previousSalary, newSalary },
 *   buildRequestContext(request)
 * );
 * ```
 */
export function buildRequestContext(request?: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  get?: (header: string) => string | undefined;
}): Record<string, unknown> | undefined {
  if (!request) return undefined;

  const getHeader = (name: string): string | undefined => {
    if (request.get) return request.get(name);
    if (request.headers) {
      const value = request.headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    }
    return undefined;
  };

  return {
    ip: request.ip || getHeader('x-forwarded-for'),
    userAgent: getHeader('user-agent'),
    origin: getHeader('origin'),
  };
}

export default {
  PAYROLL_EVENTS,
  EMPLOYEE_TIMELINE_CONFIG,
  PAYROLL_RECORD_TIMELINE_CONFIG,
  LEAVE_REQUEST_TIMELINE_CONFIG,
  buildTimelineMetadata,
  buildRequestContext,
};

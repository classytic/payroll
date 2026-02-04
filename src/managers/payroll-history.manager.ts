/**
 * @classytic/payroll - Payroll History Manager
 *
 * Handles all payroll history and reporting operations:
 * - History queries with filters and pagination
 * - Summary statistics and aggregations
 * - Data export with audit tracking
 */

import mongoose, { Model, isValidObjectId } from 'mongoose';
import type {
  PayrollRecordDocument,
  EmployeeDocument,
  AnyDocument,
  ObjectId,
  ObjectIdLike,
  PayrollHistoryParams,
  PayrollSummaryParams,
  PayrollSummaryResult,
} from '../types.js';
import { getLogger } from '../utils/logger.js';
import { payroll as payrollQuery, toObjectId } from '../utils/query-builders.js';
import type { EventBus } from '../core/events.js';

/**
 * PayrollHistoryManager
 *
 * Master of payroll data queries and reporting. Handles history retrieval,
 * summary statistics, and data exports with proper security and audit trails.
 *
 * Key responsibilities:
 * - Payroll history queries (with filters and pagination)
 * - Summary statistics (gross, net, deductions, tax)
 * - Data export (with audit tracking)
 * - Multi-tenant security enforcement
 *
 * @example History query
 * ```typescript
 * const history = await manager.payrollHistory({
 *   organizationId,
 *   employeeId: 'EMP-001',
 *   year: 2024,
 *   status: 'paid',
 *   pagination: { page: 1, limit: 20 }
 * });
 * ```
 *
 * @example Summary statistics
 * ```typescript
 * const summary = await manager.payrollSummary({
 *   organizationId,
 *   month: 1,
 *   year: 2024
 * });
 * console.log(`Total paid: ${summary.totalNet}`);
 * ```
 *
 * @example Data export
 * ```typescript
 * const records = await manager.exportPayroll({
 *   organizationId,
 *   startDate: new Date('2024-01-01'),
 *   endDate: new Date('2024-12-31')
 * });
 * ```
 */
export class PayrollHistoryManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument
> {
  constructor(
    private readonly models: {
      EmployeeModel: Model<TEmployee>;
      PayrollRecordModel: Model<TPayrollRecord>;
      TransactionModel: Model<TTransaction>;
    },
    private readonly events: EventBus,
    private readonly resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
    private readonly findEmployeeFn: import('./context.js').FindEmployeeFn<TEmployee>
  ) {}

  /**
   * Get payroll history with filters and pagination
   *
   * Supports filtering by:
   * - Employee (by ID or business ID)
   * - Period (month, year)
   * - Status (paid, pending, etc.)
   * - Pagination (page, limit, sort)
   *
   * SECURITY: Always includes organizationId filter for multi-tenant isolation
   *
   * @param params - History query parameters
   * @returns Paginated payroll records with populated relations
   */
  async payrollHistory(params: PayrollHistoryParams): Promise<TPayrollRecord[]> {
    const { employeeId, employeeIdMode, organizationId: explicitOrgId, month, year, status, pagination = {} } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId);

    // Resolve employeeId to ObjectId _id if it's a string business ID
    // Respect explicit employeeIdMode hint before auto-detection
    let resolvedEmployeeId: mongoose.Types.ObjectId | undefined;
    if (employeeId) {
      const mode = employeeIdMode || 'auto';
      const shouldTreatAsObjectId =
        mode === 'objectId' ||
        (mode === 'auto' && isValidObjectId(employeeId));

      const shouldTreatAsBusinessId =
        mode === 'businessId' ||
        (mode === 'auto' && !isValidObjectId(employeeId));

      if (shouldTreatAsObjectId) {
        resolvedEmployeeId = toObjectId(employeeId as ObjectIdLike);
      } else if (shouldTreatAsBusinessId) {
        // String business ID - need to resolve to ObjectId _id
        const employee = await this.findEmployeeFn({
          employeeId,
          employeeIdMode,
          organizationId: orgId
        });
        resolvedEmployeeId = employee._id;
      }
    }

    // Build query with organizationId always included for security
    let queryBuilder = payrollQuery().forOrganization(orgId);
    if (resolvedEmployeeId) queryBuilder = queryBuilder.forEmployee(resolvedEmployeeId);
    if (month || year) queryBuilder = queryBuilder.forPeriod(month, year);
    if (status) queryBuilder = queryBuilder.withStatus(status);

    const query = queryBuilder.build();
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const sort = pagination.sort || { 'period.year': -1, 'period.month': -1 };

    return this.models.PayrollRecordModel.find(query)
      .populate('employeeId', 'employeeId position department')
      .populate('userId', 'name email')
      .populate('transactionId', 'amount method status date')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);
  }

  /**
   * Get payroll summary statistics
   *
   * Aggregates payroll data to provide:
   * - Total gross salary
   * - Total net salary
   * - Total deductions
   * - Total tax
   * - Employee count
   * - Status breakdown (paid, pending)
   *
   * @param params - Summary parameters (organization, period)
   * @returns Aggregated summary statistics
   */
  async payrollSummary(params: PayrollSummaryParams): Promise<PayrollSummaryResult> {
    const { organizationId: explicitOrgId, month, year } = params;

    // Resolve organizationId (required in multi-tenant, auto-inject in single-tenant)
    const orgId = this.resolveOrganizationIdFn(explicitOrgId);

    const query: Record<string, unknown> = { organizationId: orgId };
    if (month) query['period.month'] = month;
    if (year) query['period.year'] = year;

    const [summary] = await this.models.PayrollRecordModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$breakdown.grossSalary' },
          totalNet: { $sum: '$breakdown.netSalary' },
          totalDeductions: { $sum: { $sum: '$breakdown.deductions.amount' } },
          totalTax: { $sum: { $ifNull: ['$breakdown.taxAmount', 0] } },
          employeeCount: { $sum: 1 },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        },
      },
    ]);

    return summary || {
      totalGross: 0,
      totalNet: 0,
      totalDeductions: 0,
      totalTax: 0,
      employeeCount: 0,
      paidCount: 0,
      pendingCount: 0,
    };
  }

}

/**
 * Factory function for creating PayrollHistoryManager
 */
export function createPayrollHistoryManager<
  TEmployee extends EmployeeDocument = EmployeeDocument,
  TPayrollRecord extends PayrollRecordDocument = PayrollRecordDocument,
  TTransaction extends AnyDocument = AnyDocument
>(
  models: {
    EmployeeModel: Model<TEmployee>;
    PayrollRecordModel: Model<TPayrollRecord>;
    TransactionModel: Model<TTransaction>;
  },
  events: EventBus,
  resolveOrganizationIdFn: (providedOrgId?: ObjectIdLike) => ObjectId,
  findEmployeeFn: import('./context.js').FindEmployeeFn<TEmployee>
): PayrollHistoryManager<TEmployee, TPayrollRecord, TTransaction> {
  return new PayrollHistoryManager<TEmployee, TPayrollRecord, TTransaction>(models, events, resolveOrganizationIdFn, findEmployeeFn);
}

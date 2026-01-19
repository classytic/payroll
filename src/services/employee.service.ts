/**
 * @classytic/payroll - Employee Service (Refactored with Mongokit)
 *
 * High-level employee operations using Repository pattern
 *
 * ⚠️ **INTERNAL USE ONLY**
 *
 * This service is for internal use by the Payroll class only.
 * All methods use repository pattern with automatic multi-tenant isolation.
 *
 * **Key Changes from v1:**
 * - Uses Repository instead of direct Model access
 * - Multi-tenant isolation handled by plugin (organizationId auto-injected)
 * - Cleaner transaction handling via repo.withTransaction()
 * - No need to pass organizationId to most methods (plugin handles it)
 *
 * @internal
 */

import type { Repository } from '@classytic/mongokit';
import type { ClientSession } from 'mongoose';
import type {
  ObjectIdLike,
  EmployeeDocument,
  EmployeeStatus,
  Department,
  EmploymentType,
  Compensation,
  OperationContext,
  HRMConfig,
} from '../types.js';
import { EmployeeFactory, type CreateEmployeeParams } from '../factories/employee.factory.js';
import { employee as employeeQuery, toObjectId } from '../utils/query-builders.js';
import { isActive, isEmployed, canReceiveSalary } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { HRM_CONFIG } from '../config.js';

// ============================================================================
// Employee Service (Mongokit Refactored)
// ============================================================================

export class EmployeeService {
  private readonly config: HRMConfig;

  constructor(
    private readonly employeeRepo: Repository<EmployeeDocument>,
    config?: HRMConfig
  ) {
    this.config = config || HRM_CONFIG;
  }

  /**
   * Find employee by ID
   *
   * ⚠️ organizationId auto-scoped by multi-tenant plugin
   *
   * @throws {Error} If employee not found
   */
  async findById(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession; populate?: boolean } = {}
  ): Promise<EmployeeDocument | null> {
    // Use getAll to ensure organizationId filtering works at query level
    // (getById after hooks don't properly override return values in mongokit)
    const result = await this.employeeRepo.getAll(
      {
        filters: { _id: toObjectId(employeeId) },
        limit: 1,
      },
      {
        session: options.session,
        populate: options.populate ? (['userId'] as any) : undefined,
      }
    );

    return result.docs[0] || null;
  }

  /**
   * Find employee by user ID
   */
  async findByUserId(
    userId: ObjectIdLike,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument | null> {
    // organizationId automatically added by multiTenantPlugin
    return this.employeeRepo.getByQuery(
      { userId: toObjectId(userId) },
      { session: options.session }
    );
  }

  /**
   * Find employee by employeeId (human-readable ID)
   */
  async findByEmployeeId(
    employeeId: string,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument | null> {
    // organizationId automatically added by multiTenantPlugin
    return this.employeeRepo.getByQuery(
      { employeeId },
      { session: options.session, throwOnNotFound: false }
    );
  }

  /**
   * Find employee by email (guest employees)
   */
  async findByEmail(
    email: string,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument | null> {
    // organizationId automatically added by multiTenantPlugin
    // Normalize email (lowercase + trim) to match schema storage format
    return this.employeeRepo.getByQuery(
      { email: email.toLowerCase().trim() },
      { session: options.session }
    );
  }

  /**
   * Find all guest employees (no userId or userId: null)
   * Note: MongoDB's {field: null} query matches BOTH documents where field is null
   * AND documents where field doesn't exist, providing consistent behavior with query builder.
   */
  async findGuestEmployees(
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument[]> {
    // organizationId automatically added by multiTenantPlugin
    const result = await this.employeeRepo.getAll(
      { filters: { userId: null } },
      { session: options.session }
    );

    return result.docs;
  }

  /**
   * Find active employees with pagination support
   *
   * @param options - Query options including pagination
   * @returns Paginated result with employees and metadata
   *
   * @example
   * ```typescript
   * // Get first page (100 employees)
   * const result = await employeeService.findActive({ page: 1, limit: 100 });
   * console.log(result.docs); // Array of employees
   * console.log(result.total); // Total count
   *
   * // Get all (use with caution for large datasets)
   * const all = await employeeService.findActive({ limit: 0 }); // limit: 0 = no limit
   * ```
   */
  async findActive(
    options: {
      page?: number;
      limit?: number;
      session?: ClientSession;
      select?: string;
      sort?: string;
    } = {}
  ): Promise<import('../types.js').OffsetPaginationResult<EmployeeDocument> | import('../types.js').KeysetPaginationResult<EmployeeDocument>> {
    // organizationId automatically added by multiTenantPlugin
    const { page = 1, limit = 100, session, select, sort = '-createdAt' } = options;

    return this.employeeRepo.getAll(
      {
        filters: { status: 'active' },
        page,
        limit,
        sort
      },
      { session, select }
    );
  }

  /**
   * Find employed employees (not terminated) with pagination support
   *
   * @param options - Query options including pagination
   * @returns Paginated result with employees and metadata
   *
   * @example
   * ```typescript
   * // Get first 50 employed employees
   * const result = await employeeService.findEmployed({ limit: 50 });
   * ```
   */
  async findEmployed(
    options: {
      page?: number;
      limit?: number;
      session?: ClientSession;
      select?: string;
      sort?: string;
    } = {}
  ): Promise<import('../types.js').OffsetPaginationResult<EmployeeDocument> | import('../types.js').KeysetPaginationResult<EmployeeDocument>> {
    // organizationId automatically added by multiTenantPlugin
    const { page = 1, limit = 100, session, select, sort = '-createdAt' } = options;

    return this.employeeRepo.getAll(
      {
        filters: { status: { $ne: 'terminated' } },
        page,
        limit,
        sort
      },
      { session, select }
    );
  }

  /**
   * Find employees by department with pagination support
   *
   * @param department - Department to filter by
   * @param options - Query options including pagination
   * @returns Paginated result with employees and metadata
   *
   * @example
   * ```typescript
   * // Get first page of engineering employees
   * const result = await employeeService.findByDepartment('engineering', { page: 1, limit: 50 });
   * ```
   */
  async findByDepartment(
    department: Department,
    options: {
      page?: number;
      limit?: number;
      session?: ClientSession;
      select?: string;
      sort?: string;
    } = {}
  ): Promise<import('../types.js').OffsetPaginationResult<EmployeeDocument> | import('../types.js').KeysetPaginationResult<EmployeeDocument>> {
    // organizationId automatically added by multiTenantPlugin
    const { page = 1, limit = 100, session, select, sort = '-createdAt' } = options;

    return this.employeeRepo.getAll(
      {
        filters: { department, status: 'active' },
        page,
        limit,
        sort
      },
      { session, select }
    );
  }

  /**
   * Find employees eligible for payroll with pagination support
   *
   * ⚠️ Note: This method applies in-memory filtering after database query.
   * The pagination counts may not match perfectly due to post-filtering.
   * Consider using higher limits to account for filtered-out records.
   *
   * @param options - Query options including pagination
   * @returns Paginated result with eligible employees
   *
   * @example
   * ```typescript
   * // Get eligible employees (paginated)
   * const result = await employeeService.findEligibleForPayroll({ page: 1, limit: 100 });
   * ```
   */
  async findEligibleForPayroll(
    options: {
      page?: number;
      limit?: number;
      session?: ClientSession;
      select?: string;
      sort?: string;
    } = {}
  ): Promise<import('../types.js').OffsetPaginationResult<EmployeeDocument> | import('../types.js').KeysetPaginationResult<EmployeeDocument>> {
    // organizationId automatically added by multiTenantPlugin
    const { page = 1, limit = 100, session, select, sort = '-createdAt' } = options;

    const result = await this.employeeRepo.getAll(
      {
        filters: { status: { $ne: 'terminated' } },
        page,
        limit,
        sort
      },
      { session, select }
    );

    // Apply eligibility filter in-memory on docs
    const eligibleDocs = result.docs.filter((emp: EmployeeDocument) => canReceiveSalary(emp));

    // Return mongokit's standard structure
    return {
      ...result,
      docs: eligibleDocs,
      total: eligibleDocs.length, // Filtered count
    } as any;
  }

  /**
   * Create new employee
   *
   * organizationId auto-injected by multiTenantPlugin
   */
  async create(
    params: CreateEmployeeParams,
    options: { session?: ClientSession } = {}
  ): Promise<EmployeeDocument> {
    const employeeData = EmployeeFactory.create(params, this.config);

    // For guest employees, need special handling to preserve partial index
    if (!params.userId) {
      // Guest employee - prepare data for insertion
      const dataToInsert: Record<string, any> = {};

      // Copy all fields except userId/email
      for (const [key, value] of Object.entries(employeeData)) {
        if (key === 'userId' || key === 'email') continue;
        dataToInsert[key] = value;
      }

      // Only include email if it exists and is not empty
      if (employeeData.email && employeeData.email !== '') {
        dataToInsert.email = employeeData.email;
      }

      // Note: organizationId will be auto-injected by multiTenantPlugin
      return this.employeeRepo.create(dataToInsert, { session: options.session });
    }

    // Regular employee with userId
    return this.employeeRepo.create(employeeData as Partial<EmployeeDocument>, {
      session: options.session,
    });
  }

  /**
   * Update employee status
   */
  async updateStatus(
    employeeId: ObjectIdLike,
    status: EmployeeStatus,
    options: { session?: ClientSession; context?: OperationContext } = {}
  ): Promise<EmployeeDocument> {
    // Fetch first to ensure cross-org updates are blocked
    const existing = await this.findById(employeeId, options);
    if (!existing) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    const employee = await this.employeeRepo.update(
      employeeId,
      { status },
      { session: options.session }
    );

    logger.info('Employee status updated', {
      employeeId: (employee as any).employeeId,
      organizationId: (employee as any).organizationId?.toString(),
      newStatus: status,
    });

    return employee;
  }

  /**
   * Update employee compensation
   */
  async updateCompensation(
    employeeId: ObjectIdLike,
    compensation: Compensation,
    options: { session?: ClientSession; context?: OperationContext } = {}
  ): Promise<EmployeeDocument> {
    // Fetch first to ensure cross-org updates are blocked
    const existing = await this.findById(employeeId, options);
    if (!existing) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    const employee = await this.employeeRepo.update(
      employeeId,
      { compensation },
      { session: options.session }
    );

    logger.info('Employee compensation updated', {
      employeeId: (employee as any).employeeId,
      organizationId: (employee as any).organizationId?.toString(),
    });

    return employee;
  }

  /**
   * Terminate employee
   */
  async terminate(
    employeeId: ObjectIdLike,
    terminationDate: Date,
    options: { session?: ClientSession; reason?: string; context?: OperationContext } = {}
  ): Promise<EmployeeDocument> {
    // Fetch first to ensure cross-org updates are blocked
    const existing = await this.findById(employeeId, options);
    if (!existing) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    const updateData: any = {
      status: 'terminated',
      terminatedAt: terminationDate,
    };

    if (options.reason) {
      updateData.terminationReason = options.reason;
    }

    const employee = await this.employeeRepo.update(employeeId, updateData, {
      session: options.session,
    });

    logger.info('Employee terminated', {
      employeeId: (employee as any).employeeId,
      terminationDate: terminationDate.toISOString(),
    });

    return employee;
  }

  /**
   * Re-hire employee
   */
  async reHire(
    employeeId: ObjectIdLike,
    options: { session?: ClientSession; context?: OperationContext } = {}
  ): Promise<EmployeeDocument> {
    // Fetch first to ensure cross-org updates are blocked
    const existing = await this.findById(employeeId, options);
    if (!existing) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    const employee = await this.employeeRepo.update(
      employeeId,
      {
        status: 'active',
        terminatedAt: null,
        terminationReason: null,
      },
      { session: options.session }
    );

    logger.info('Employee re-hired', {
      employeeId: (employee as any).employeeId,
    });

    return employee;
  }

  /**
   * Check if employee exists
   */
  async exists(employeeId: ObjectIdLike): Promise<boolean> {
    const result = await this.employeeRepo.exists({ _id: toObjectId(employeeId) });
    return result !== null;
  }

  /**
   * Count employees
   */
  async count(filters: Record<string, unknown> = {}): Promise<number> {
    // organizationId automatically added by multiTenantPlugin
    return this.employeeRepo.count(filters);
  }

  /**
   * Validate employee can receive salary
   */
  validateEligibility(employee: EmployeeDocument): void {
    if (!employee) {
      throw new Error('Employee not found');
    }

    if (!isEmployed(employee)) {
      throw new Error(`Employee is terminated and cannot receive salary`);
    }

    if (!canReceiveSalary(employee)) {
      throw new Error('Employee is not eligible to receive salary');
    }
  }
}

/**
 * Factory function to create EmployeeService
 */
export function createEmployeeService(
  employeeRepo: Repository<EmployeeDocument>,
  config?: HRMConfig
): EmployeeService {
  return new EmployeeService(employeeRepo, config);
}

export default EmployeeService;
